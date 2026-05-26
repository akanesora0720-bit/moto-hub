-- 入金期限管理（営業日）: 車両代金とMotoHub手数料
--
-- - 車両代金入金期限: 合意確定後 3営業日（JSTの営業日、土日除外）
-- - 手数料支払期限: 引渡完了後の請求書発行日から 3営業日
-- - PDFの期日は vehicle(payment_due_at) / platform_fee_due_at を使い分け

-- ---------------------------------------------------------------------------
-- Business-day helpers (weekends only)
-- ---------------------------------------------------------------------------
create or replace function public.is_business_day(p_day date)
returns boolean
language sql
immutable
as $$
  select extract(isodow from p_day)::int between 1 and 5;
$$;

create or replace function public.add_business_days(p_start date, p_days int)
returns date
language plpgsql
immutable
as $$
declare
  v date := p_start;
  i int := 0;
begin
  if p_days <= 0 then
    return p_start;
  end if;
  while i < p_days loop
    v := v + 1;
    if public.is_business_day(v) then
      i := i + 1;
    end if;
  end loop;
  return v;
end;
$$;

create or replace function public.business_day_deadline_ts(p_base timestamptz, p_days int)
returns timestamptz
language sql
immutable
as $$
  select (
    (
      public.add_business_days((p_base at time zone 'Asia/Tokyo')::date, p_days)
      + time '23:59:59'
    ) at time zone 'Asia/Tokyo'
  );
$$;

-- ---------------------------------------------------------------------------
-- deals: platform fee due (separate from vehicle payment_due_at)
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists platform_fee_invoice_issued_at timestamptz,
  add column if not exists platform_fee_due_at timestamptz,
  add column if not exists platform_fee_paid_at timestamptz;

comment on column public.deals.payment_due_at is '車両代金の入金期限（買い手→売り手、JST）';
comment on column public.deals.platform_fee_due_at is 'MotoHub手数料の支払期限（売り手→MotoHub、JST）';

-- ---------------------------------------------------------------------------
-- Agreement finalize: set vehicle payment due = 3 business days
-- ---------------------------------------------------------------------------
create or replace function public.admin_finalize_agreement(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_auto boolean;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if not v.seller_intent_confirmed or not v.buyer_intent_confirmed then
    raise exception 'both parties must be confirmed by admin';
  end if;
  if v.status not in ('inquiry', 'negotiating') then
    raise exception 'invalid deal status for agreement';
  end if;

  update public.deals
  set status = 'awaiting_payment',
      payment_due_at = coalesce(payment_due_at, public.business_day_deadline_ts(now(), 3)),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'review_pending', updated_at = now()
  where deal_id = p_deal_id
    and party = 'buyer'
    and document_kind = 'payment_instruction'
    and status = 'draft';

  perform public.notify_enqueue(
    'invoice.review_pending',
    jsonb_build_object('body', format('deal %s 入金指示書確認待ち', p_deal_id)),
    'deals', p_deal_id
  );

  v_auto := public.get_setting_bool('billing', 'auto_send_invoices', false);
  if v_auto then
    perform public.admin_approve_and_send_invoices(p_deal_id);
  end if;

  perform public.notify_deal_status(p_deal_id, 'awaiting_payment');
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Platform fee invoice issue: set platform fee issued_at + due_at(3 business days)
-- ---------------------------------------------------------------------------
create or replace function public.issue_platform_fee_invoice(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_inv public.invoices;
  v_issued_at timestamptz;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;

  perform public.ensure_deal_billing(p_deal_id);

  select * into v_inv
  from public.invoices
  where deal_id = p_deal_id and party = 'seller' and document_kind = 'platform_fee';

  if v_inv.total_inc_tax <= 0 then
    update public.invoices
    set status = 'cancelled',
        admin_note = coalesce(admin_note, '') || ' 手数料対象外（30,000円以下）',
        updated_at = now()
    where id = v_inv.id;
    return;
  end if;

  v_issued_at := coalesce(v_inv.issued_at, now());

  update public.invoices
  set status = 'issued',
      issued_at = v_issued_at,
      updated_at = now()
  where id = v_inv.id
    and status in ('draft', 'review_pending');

  update public.deals
  set
    platform_fee_invoice_issued_at = coalesce(platform_fee_invoice_issued_at, v_issued_at),
    platform_fee_due_at = coalesce(platform_fee_due_at, public.business_day_deadline_ts(v_issued_at, 3)),
    updated_at = now()
  where id = p_deal_id;

  perform public.notify_user_email(
    'invoice.issued',
    v_deal.seller_id,
    format('取引 %s のMotoHub手数料請求書を発行しました。取引詳細からPDFを確認できます。', p_deal_id),
    'MotoHub: 手数料請求書'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark invoice paid: sync platform_fee_paid_at on deal
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.invoices;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.invoices set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_invoice_id returning * into v_row;
  if v_row.id is null then raise exception 'invoice not found'; end if;

  if v_row.deal_id is not null and v_row.document_kind = 'platform_fee' then
    update public.deals
    set platform_fee_paid_at = coalesce(platform_fee_paid_at, v_row.paid_at),
        updated_at = now()
    where id = v_row.deal_id;
  end if;

  perform public.notify_user_email('payment.confirmed', v_row.user_id, format('入金を確認しました（請求 %s）', p_invoice_id));
  return v_row;
end;
$$;

-- Backfill platform fee deadlines for already-issued invoices
update public.deals d
set
  platform_fee_invoice_issued_at = coalesce(d.platform_fee_invoice_issued_at, i.issued_at),
  platform_fee_due_at = coalesce(
    d.platform_fee_due_at,
    public.business_day_deadline_ts(coalesce(i.issued_at, now()), 3)
  )
from public.invoices i
where i.deal_id = d.id
  and i.document_kind = 'platform_fee'
  and i.status = 'issued'
  and i.total_inc_tax > 0;

