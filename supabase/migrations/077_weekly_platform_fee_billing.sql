-- 週次プラットフォーム手数料請求（車両）+ 成約時入金指示書の自動発行

-- ---------------------------------------------------------------------------
-- Accruals queue
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_fee_accrual_type') then
    create type public.platform_fee_accrual_type as enum ('vehicle', 'part');
  end if;
  if not exists (select 1 from pg_type where typname = 'platform_fee_accrual_status') then
    create type public.platform_fee_accrual_status as enum (
      'pending', 'invoiced', 'waived', 'cancelled'
    );
  end if;
end
$$;

create table if not exists public.platform_fee_accruals (
  id uuid primary key default gen_random_uuid(),
  accrual_type public.platform_fee_accrual_type not null,
  deal_id uuid references public.deals (id) on delete cascade,
  part_sale_id uuid references public.part_sales (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  agreed_price_ex_tax int not null check (agreed_price_ex_tax >= 0),
  fee_ex_tax int not null default 0 check (fee_ex_tax >= 0),
  fee_tax int not null default 0 check (fee_tax >= 0),
  fee_inc_tax int not null default 0 check (fee_inc_tax >= 0),
  accrued_at timestamptz not null default now(),
  billing_week_start date not null,
  billing_week_end date not null,
  status public.platform_fee_accrual_status not null default 'pending',
  weekly_invoice_id uuid references public.invoices (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_fee_accruals_source_check check (
    (accrual_type = 'vehicle' and deal_id is not null and part_sale_id is null)
    or (accrual_type = 'part' and part_sale_id is not null and deal_id is null)
  )
);

create unique index if not exists platform_fee_accruals_deal_unique
  on public.platform_fee_accruals (deal_id)
  where deal_id is not null and status in ('pending', 'invoiced');

create unique index if not exists platform_fee_accruals_part_sale_unique
  on public.platform_fee_accruals (part_sale_id)
  where part_sale_id is not null and status in ('pending', 'invoiced');

create index if not exists platform_fee_accruals_week_pending_idx
  on public.platform_fee_accruals (billing_week_start, billing_week_end, accrual_type, status)
  where status = 'pending';

create index if not exists platform_fee_accruals_seller_idx
  on public.platform_fee_accruals (seller_id, accrued_at desc);

-- ---------------------------------------------------------------------------
-- Invoices: weekly fields + document kinds
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists billing_week_start date,
  add column if not exists billing_week_end date,
  add column if not exists invoice_number text;

comment on column public.invoices.billing_week_start is '週次手数料請求の集計週開始（土曜・JST日付）';
comment on column public.invoices.billing_week_end is '週次手数料請求の集計週終了（金曜・JST日付）';

alter table public.invoices
  drop constraint if exists invoices_document_kind_check;

alter table public.invoices
  add constraint invoices_document_kind_check
  check (document_kind in (
    'legacy',
    'payment_instruction',
    'platform_fee',
    'motohub_inspection',
    'monthly_membership',
    'part_payment_instruction',
    'part_platform_fee',
    'weekly_vehicle_platform_fee',
    'weekly_part_platform_fee'
  ));

alter table public.invoices
  drop constraint if exists invoices_source_check;

alter table public.invoices
  add constraint invoices_source_check
  check (
  (
    deal_id is not null
    and inspection_request_id is null
    and billing_month is null
    and part_sale_id is null
    and billing_week_start is null
  )
  or (
    deal_id is null
    and inspection_request_id is not null
    and billing_month is null
    and part_sale_id is null
    and billing_week_start is null
  )
  or (
    deal_id is null
    and inspection_request_id is null
    and billing_month is not null
    and part_sale_id is null
    and billing_week_start is null
  )
  or (
    deal_id is null
    and inspection_request_id is null
    and billing_month is null
    and part_sale_id is not null
    and billing_week_start is null
  )
  or (
    deal_id is null
    and inspection_request_id is null
    and billing_month is null
    and part_sale_id is null
    and billing_week_start is not null
    and billing_week_end is not null
  )
);

create unique index if not exists invoices_weekly_vehicle_unique
  on public.invoices (user_id, billing_week_start)
  where document_kind = 'weekly_vehicle_platform_fee';

create unique index if not exists invoices_weekly_part_unique
  on public.invoices (user_id, billing_week_start)
  where document_kind = 'weekly_part_platform_fee';

create unique index if not exists invoices_invoice_number_unique
  on public.invoices (invoice_number)
  where invoice_number is not null;

alter type public.invoice_item_type add value if not exists 'weekly_fee_line';

-- ---------------------------------------------------------------------------
-- Week helpers (JST calendar dates)
-- ---------------------------------------------------------------------------
create or replace function public.jst_date(p_ts timestamptz default now())
returns date
language sql
stable
as $$
  select (timezone('Asia/Tokyo', coalesce(p_ts, now())))::date;
$$;

create or replace function public.billing_week_bounds_for_date(p_day date)
returns table (week_start date, week_end date)
language sql
stable
as $$
  with d as (
    select p_day as day
  ),
  off as (
    select ((extract(isodow from day)::int + 1) % 7) as days_since_sat
    from d
  )
  select
    (select day from d) - (select days_since_sat from off) as week_start,
    (select day from d) - (select days_since_sat from off) + 6 as week_end;
$$;

create or replace function public.billing_week_bounds_for_ts(p_ts timestamptz)
returns table (week_start date, week_end date)
language sql
stable
as $$
  select * from public.billing_week_bounds_for_date(public.jst_date(p_ts));
$$;

create or replace function public.last_completed_billing_week(p_issue_day date default public.jst_date())
returns table (week_start date, week_end date)
language sql
stable
as $$
  with fri as (
    select p_issue_day - ((extract(isodow from p_issue_day)::int + 2) % 7) as friday
  )
  select
    friday - 6 as week_start,
    friday as week_end
  from fri;
$$;

create or replace function public.next_invoice_number(p_prefix text)
returns text
language plpgsql
as $$
declare
  v_seq int;
  v_day text;
begin
  v_day := to_char(public.jst_date(), 'YYYYMMDD');
  select count(*)::int + 1 into v_seq
  from public.invoices
  where invoice_number like p_prefix || '-' || v_day || '-%';
  return format('%s-%s-%04s', p_prefix, v_day, v_seq);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vehicle fee accrual (pickup completed)
-- ---------------------------------------------------------------------------
create or replace function public.accrue_vehicle_platform_fee(p_deal_id uuid)
returns public.platform_fee_accruals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_rates jsonb;
  v_seller_rate numeric;
  v_fee_ex int;
  v_fee_tax int;
  v_fee_inc int;
  v_week_start date;
  v_week_end date;
  v_row public.platform_fee_accruals;
  v_accrued_at timestamptz;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;
  if v_deal.pickup_completed_at is null then
    raise exception 'pickup not completed';
  end if;

  select * into v_row
  from public.platform_fee_accruals
  where deal_id = p_deal_id
    and status in ('pending', 'invoiced')
  limit 1;
  if v_row.id is not null then
    return v_row;
  end if;

  v_accrued_at := v_deal.pickup_completed_at;
  select week_start, week_end into v_week_start, v_week_end
  from public.billing_week_bounds_for_ts(v_accrued_at);

  v_rates := public.resolve_deal_fee_rates(v_deal.agreed_price_ex_tax);
  v_seller_rate := (v_rates->>'seller_fee_rate')::numeric;
  v_fee_ex := round(v_deal.agreed_price_ex_tax * v_seller_rate)::int;
  v_fee_tax := public.calc_consumption_tax(v_fee_ex);
  v_fee_inc := v_fee_ex + v_fee_tax;

  insert into public.platform_fee_accruals (
    accrual_type,
    deal_id,
    seller_id,
    agreed_price_ex_tax,
    fee_ex_tax,
    fee_tax,
    fee_inc_tax,
    accrued_at,
    billing_week_start,
    billing_week_end,
    status
  )
  values (
    'vehicle',
    p_deal_id,
    v_deal.seller_id,
    v_deal.agreed_price_ex_tax,
    v_fee_ex,
    v_fee_tax,
    v_fee_inc,
    v_accrued_at,
    v_week_start,
    v_week_end,
    case when v_fee_ex <= 0 then 'waived'::public.platform_fee_accrual_status else 'pending'::public.platform_fee_accrual_status end
  )
  returning * into v_row;

  update public.deals
  set platform_fee_accrued_at = coalesce(platform_fee_accrued_at, v_accrued_at),
      updated_at = now()
  where id = p_deal_id;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_deal_billing: payment instruction only (no per-deal platform fee)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_deal_billing(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_price int;
  v_rates jsonb;
  v_seller_rate numeric;
  v_vehicle_tax int;
  v_vehicle_inc int;
  v_buyer_doc uuid;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  v_price := v_deal.agreed_price_ex_tax;
  v_rates := public.resolve_deal_fee_rates(v_price);
  v_seller_rate := (v_rates->>'seller_fee_rate')::numeric;

  update public.deals
  set buyer_fee_rate = (v_rates->>'buyer_fee_rate')::numeric,
      seller_fee_rate = v_seller_rate,
      updated_at = now()
  where id = p_deal_id;

  v_vehicle_tax := public.calc_consumption_tax(v_price);
  v_vehicle_inc := v_price + v_vehicle_tax;

  insert into public.invoices (
    deal_id, user_id, party, document_kind, status,
    total_ex_tax, total_tax, total_inc_tax
  )
  values (
    p_deal_id,
    v_deal.buyer_id,
    'buyer',
    'payment_instruction',
    'draft',
    v_price,
    v_vehicle_tax,
    v_vehicle_inc
  )
  on conflict (deal_id, party) where deal_id is not null do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_buyer_doc;

  select id into v_buyer_doc
  from public.invoices
  where deal_id = p_deal_id and party = 'buyer';

  delete from public.invoice_items where invoice_id = v_buyer_doc;

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_buyer_doc, 'vehicle_price', '車両代（税抜）', v_price, 0, v_price, 1),
    (v_buyer_doc, 'consumption_tax', '消費税（10%）', v_vehicle_tax, 0, v_vehicle_tax, 2);

  delete from public.payouts where deal_id = p_deal_id;

  return jsonb_build_object(
    'payment_instruction_id', v_buyer_doc,
    'fee_tier', v_rates->>'fee_tier',
    'platform_fee_ex_tax', round(v_price * v_seller_rate)::int
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Per-deal platform fee issue → accrue only if pickup done (legacy callers)
-- ---------------------------------------------------------------------------
create or replace function public.issue_platform_fee_invoice(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;

  if v_deal.pickup_completed_at is null then
    return;
  end if;

  perform public.accrue_vehicle_platform_fee(p_deal_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly invoice issue (Mondays)
-- ---------------------------------------------------------------------------
create or replace function public.issue_weekly_platform_fee_invoices(
  p_issue_date date default public.jst_date()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
  v_week_end date;
  v_issued_at timestamptz;
  v_due_at timestamptz;
  v_vehicle_created int := 0;
  v_part_created int := 0;
  r_seller record;
  r_line record;
  v_inv_id uuid;
  v_total_ex int;
  v_total_tax int;
  v_total_inc int;
  v_sort int;
  v_doc_kind text;
  v_prefix text;
  v_label text;
begin
  if extract(isodow from p_issue_date) <> 1 then
    return jsonb_build_object('skipped', true, 'reason', 'not_monday');
  end if;

  select week_start, week_end into v_week_start, v_week_end
  from public.last_completed_billing_week(p_issue_date);

  v_issued_at := make_timestamptz(
    extract(year from p_issue_date)::int,
    extract(month from p_issue_date)::int,
    extract(day from p_issue_date)::int,
    9, 0, 0, 'Asia/Tokyo'
  );
  v_due_at := public.business_day_deadline_ts(v_issued_at, 3);

  for v_doc_kind, v_prefix in
    select * from (values
      ('weekly_vehicle_platform_fee', 'WH-V'),
      ('weekly_part_platform_fee', 'WH-P')
    ) as t(kind, prefix)
  loop
    for r_seller in
      select a.seller_id, sum(a.fee_ex_tax) as fee_ex, sum(a.fee_tax) as fee_tax, sum(a.fee_inc_tax) as fee_inc
      from public.platform_fee_accruals a
      where a.status = 'pending'
        and a.billing_week_start = v_week_start
        and a.billing_week_end = v_week_end
        and a.fee_ex_tax > 0
        and (
          (v_doc_kind = 'weekly_vehicle_platform_fee' and a.accrual_type = 'vehicle')
          or (v_doc_kind = 'weekly_part_platform_fee' and a.accrual_type = 'part')
        )
      group by a.seller_id
    loop
      if exists (
        select 1 from public.invoices i
        where i.user_id = r_seller.seller_id
          and i.document_kind = v_doc_kind
          and i.billing_week_start = v_week_start
      ) then
        continue;
      end if;

      v_total_ex := r_seller.fee_ex;
      v_total_tax := r_seller.fee_tax;
      v_total_inc := r_seller.fee_inc;

      insert into public.invoices (
        user_id,
        party,
        document_kind,
        status,
        total_ex_tax,
        total_tax,
        total_inc_tax,
        billing_week_start,
        billing_week_end,
        invoice_number,
        issued_at,
        payment_due_at
      )
      values (
        r_seller.seller_id,
        'seller',
        v_doc_kind,
        'issued',
        v_total_ex,
        v_total_tax,
        v_total_inc,
        v_week_start,
        v_week_end,
        public.next_invoice_number(v_prefix),
        v_issued_at,
        v_due_at
      )
      returning id into v_inv_id;

      v_sort := 0;
      for r_line in
        select a.*
        from public.platform_fee_accruals a
        where a.seller_id = r_seller.seller_id
          and a.status = 'pending'
          and a.billing_week_start = v_week_start
          and a.billing_week_end = v_week_end
          and a.fee_ex_tax > 0
          and (
            (v_doc_kind = 'weekly_vehicle_platform_fee' and a.accrual_type = 'vehicle')
            or (v_doc_kind = 'weekly_part_platform_fee' and a.accrual_type = 'part')
          )
        order by a.accrued_at
      loop
        v_sort := v_sort + 1;
        if r_line.accrual_type = 'vehicle' then
          select format(
            '車両成約 %s %s（税抜%s円）',
            l.maker,
            l.model,
            r_line.agreed_price_ex_tax
          ) into v_label
          from public.deals d
          join public.listings l on l.id = d.listing_id
          where d.id = r_line.deal_id;
        else
          select format(
            'パーツ成約 %s（税抜%s円）',
            pl.part_name,
            r_line.agreed_price_ex_tax
          ) into v_label
          from public.part_sales ps
          join public.part_listings pl on pl.id = ps.part_listing_id
          where ps.id = r_line.part_sale_id;
        end if;

        insert into public.invoice_items (
          invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order
        )
        values (
          v_inv_id,
          'weekly_fee_line',
          coalesce(v_label, '成約手数料'),
          r_line.fee_ex_tax,
          r_line.fee_tax,
          r_line.fee_inc_tax,
          v_sort
        );

        update public.platform_fee_accruals
        set status = 'invoiced',
            weekly_invoice_id = v_inv_id,
            updated_at = now()
        where id = r_line.id;

        if r_line.accrual_type = 'vehicle' then
          update public.deals
          set platform_fee_invoice_issued_at = coalesce(platform_fee_invoice_issued_at, v_issued_at),
              platform_fee_due_at = coalesce(platform_fee_due_at, v_due_at),
              updated_at = now()
          where id = r_line.deal_id;
        end if;
      end loop;

      perform public.notify_user_email(
        'invoice.issued',
        r_seller.seller_id,
        format(
          '週次Moto-Hub手数料請求書（%s〜%s）を発行しました。/my/payments からPDFを確認できます。',
          to_char(v_week_start, 'YYYY/MM/DD'),
          to_char(v_week_end, 'YYYY/MM/DD')
        ),
        'MotoHub: 週次手数料請求書'
      );

      if v_doc_kind = 'weekly_vehicle_platform_fee' then
        v_vehicle_created := v_vehicle_created + 1;
      else
        v_part_created := v_part_created + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'week_start', v_week_start,
    'week_end', v_week_end,
    'vehicle_invoices', v_vehicle_created,
    'part_invoices', v_part_created
  );
end;
$$;

create or replace function public.run_weekly_platform_fee_billing_job(
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := public.jst_date();
begin
  if not p_force and extract(isodow from v_today) <> 1 then
    return jsonb_build_object('skipped', true, 'reason', 'not_monday');
  end if;
  return public.issue_weekly_platform_fee_invoices(v_today);
end;
$$;

-- ---------------------------------------------------------------------------
-- Auto issue payment instruction on agreement
-- ---------------------------------------------------------------------------
create or replace function public.admin_finalize_agreement(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'deal not found';
  end if;
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
  perform public.admin_approve_and_send_invoices(p_deal_id);

  perform public.notify_deal_status(p_deal_id, 'awaiting_payment');
  perform public.sync_transaction_record(p_deal_id);
  return v;
end;
$$;

update public.system_settings
set value = coalesce(value, '{}'::jsonb) || '{"auto_send_invoices": true}'::jsonb,
    updated_at = now()
where key = 'billing';

-- ---------------------------------------------------------------------------
-- Milestones: accrue on pickup completed
-- ---------------------------------------------------------------------------
create or replace function public.update_deal_milestones(
  p_deal_id uuid,
  p_pickup_scheduled_at timestamptz default null,
  p_pickup_completed_at timestamptz default null,
  p_documents_shipped_at timestamptz default null,
  p_transfer_completed_at timestamptz default null,
  p_tracking_number text default null,
  p_clear_tracking boolean default false
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_had_pickup boolean;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.deals where id = p_deal_id for update;
  if v.id is null then raise exception 'deal not found'; end if;
  if not public.deal_status_allows_board(v.status) then
    raise exception 'milestones not editable for this status';
  end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_pickup_scheduled_at is not null
     and v.buyer_id <> auth.uid() and not public.is_admin() then
    raise exception 'buyer or admin only for pickup schedule';
  end if;

  if p_pickup_completed_at is not null
     and v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only for pickup completed';
  end if;

  if p_documents_shipped_at is not null
     and v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only for documents shipped';
  end if;

  if p_transfer_completed_at is not null
     and v.buyer_id <> auth.uid()
     and v.seller_id <> auth.uid()
     and not public.is_admin() then
    raise exception 'party or admin only for transfer completed';
  end if;

  v_had_pickup := v.pickup_completed_at is not null;

  v_before := jsonb_build_object(
    'pickup_scheduled_at', v.pickup_scheduled_at,
    'pickup_completed_at', v.pickup_completed_at,
    'documents_shipped_at', v.documents_shipped_at,
    'transfer_completed_at', v.transfer_completed_at,
    'tracking_number', v.tracking_number
  );

  update public.deals
  set
    pickup_scheduled_at = coalesce(p_pickup_scheduled_at, pickup_scheduled_at),
    pickup_completed_at = coalesce(p_pickup_completed_at, pickup_completed_at),
    documents_shipped_at = coalesce(p_documents_shipped_at, documents_shipped_at),
    transfer_completed_at = coalesce(p_transfer_completed_at, transfer_completed_at),
    tracking_number = case
      when p_clear_tracking then null
      when p_tracking_number is not null then nullif(trim(p_tracking_number), '')
      else tracking_number
    end,
    updated_at = now()
  where id = p_deal_id
  returning * into v;

  if not v_had_pickup and v.pickup_completed_at is not null then
    perform public.accrue_vehicle_platform_fee(p_deal_id);
  end if;

  v_after := jsonb_build_object(
    'pickup_scheduled_at', v.pickup_scheduled_at,
    'pickup_completed_at', v.pickup_completed_at,
    'documents_shipped_at', v.documents_shipped_at,
    'transfer_completed_at', v.transfer_completed_at,
    'tracking_number', v.tracking_number
  );

  perform public.write_status_audit_log(
    'deal_milestones_updated',
    'deals',
    p_deal_id,
    v.status::text,
    v.status::text,
    auth.uid()
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    'deal_milestones_updated',
    'deals',
    p_deal_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v;
end;
$$;

create or replace function public.deal_mark_handover(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_inspection text;
  v_requires boolean;
  v_next_status public.deal_status;
  v_had_pickup boolean;
begin
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only';
  end if;
  if v.status <> 'funded' then
    raise exception 'status must be funded';
  end if;
  if v.pickup_scheduled_at is null and not public.is_admin() then
    raise exception 'buyer must register pickup schedule before handover';
  end if;

  v_had_pickup := v.pickup_completed_at is not null;

  select inspection_remaining into v_inspection
  from public.listings where id = v.listing_id;

  v_requires := coalesce(trim(v_inspection), '') <> '';

  if v_requires then
    v_next_status := 'transfer_pending';
  else
    v_next_status := 'handover_done';
  end if;

  update public.deals
  set
    handover_at = now(),
    pickup_completed_at = coalesce(pickup_completed_at, now()),
    status = v_next_status,
    requires_name_transfer = v_requires,
    transfer_deadline_at = case
      when v_requires then public.transfer_deadline_next_friday(now())
      else null
    end,
    updated_at = now()
  where id = p_deal_id
  returning * into v;

  if not v_had_pickup and v.pickup_completed_at is not null then
    perform public.accrue_vehicle_platform_fee(p_deal_id);
  end if;

  perform public.notify_deal_status(p_deal_id, v_next_status);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark paid: weekly invoices
-- ---------------------------------------------------------------------------
create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invoices;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.invoices
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = p_invoice_id
  returning * into v_row;
  if v_row.id is null then raise exception 'invoice not found'; end if;

  if v_row.deal_id is not null and v_row.document_kind = 'platform_fee' then
    update public.deals
    set platform_fee_paid_at = coalesce(platform_fee_paid_at, v_row.paid_at),
        updated_at = now()
    where id = v_row.deal_id;
  end if;

  if v_row.document_kind in ('weekly_vehicle_platform_fee', 'weekly_part_platform_fee') then
    update public.deals d
    set platform_fee_paid_at = coalesce(d.platform_fee_paid_at, v_row.paid_at),
        updated_at = now()
    from public.platform_fee_accruals a
    where a.weekly_invoice_id = v_row.id
      and a.deal_id = d.id;
  end if;

  perform public.notify_user_email(
    'payment.confirmed',
    v_row.user_id,
    format('入金を確認しました（請求 %s）', coalesce(v_row.invoice_number, left(v_row.id::text, 8)))
  );
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Migration: cancel per-deal fee drafts; backfill accruals
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists platform_fee_accrued_at timestamptz;

update public.invoices
set status = 'cancelled',
    admin_note = coalesce(admin_note, '') || ' 週次請求へ移行のため取消',
    updated_at = now()
where document_kind in ('platform_fee', 'part_platform_fee')
  and status in ('draft', 'review_pending');

do $$
declare
  r record;
begin
  for r in
    select id from public.deals
    where pickup_completed_at is not null
      and status not in ('cancelled')
  loop
    begin
      perform public.accrue_vehicle_platform_fee(r.id);
    exception when others then
      raise notice 'accrue_vehicle_platform_fee %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

grant execute on function public.accrue_vehicle_platform_fee(uuid) to authenticated;
grant execute on function public.issue_weekly_platform_fee_invoices(date) to authenticated;
grant execute on function public.run_weekly_platform_fee_billing_job(boolean) to authenticated;

alter table public.platform_fee_accruals enable row level security;

create policy platform_fee_accruals_select on public.platform_fee_accruals
  for select to authenticated
  using (
    seller_id = auth.uid()
    or public.is_admin()
  );
