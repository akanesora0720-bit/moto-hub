-- 月額会費: 毎月20日に請求書発行、当月26日までに支払い（JST）

alter type public.invoice_item_type add value if not exists 'membership_fee';

alter table public.invoices
  add column if not exists billing_month date,
  add column if not exists payment_due_at timestamptz;

comment on column public.invoices.billing_month is '月額会費の対象月（月初日）';
comment on column public.invoices.payment_due_at is 'お支払期限（月額会費等）';

-- document_kind: monthly_membership
alter table public.invoices
  drop constraint if exists invoices_document_kind_check;

alter table public.invoices
  add constraint invoices_document_kind_check
  check (document_kind in (
    'legacy', 'payment_instruction', 'platform_fee', 'motohub_inspection', 'monthly_membership'
  ));

alter table public.invoices
  drop constraint if exists invoices_source_check;

alter table public.invoices
  add constraint invoices_source_check
  check (
    (deal_id is not null and inspection_request_id is null and billing_month is null)
    or (deal_id is null and inspection_request_id is not null and billing_month is null)
    or (deal_id is null and inspection_request_id is null and billing_month is not null)
  );

create unique index if not exists invoices_monthly_membership_unique
  on public.invoices (user_id, billing_month)
  where document_kind = 'monthly_membership' and billing_month is not null;

-- billing settings
insert into public.system_settings (key, value)
values (
  'billing',
  jsonb_build_object(
    'auto_send_invoices', false,
    'monthly_membership_fee_ex_tax', 15000,
    'monthly_membership_issue_day', 20,
    'monthly_membership_due_day', 26
  )
)
on conflict (key) do update
set value = public.system_settings.value
  || jsonb_build_object(
    'monthly_membership_fee_ex_tax', 15000,
    'monthly_membership_issue_day', 20,
    'monthly_membership_due_day', 26
  ),
  updated_at = now();

create or replace function public.get_billing_int_setting(
  p_field text,
  p_default int
)
returns int
language sql
stable
as $$
  select coalesce((value ->> p_field)::int, p_default)
  from public.system_settings
  where key = 'billing';
$$;

-- Core: issue invoices for one billing month (idempotent)
create or replace function public.issue_monthly_membership_invoices(p_billing_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_billing_month)::date;
  v_fee_ex int;
  v_tax int;
  v_inc int;
  v_issue_day int;
  v_due_day int;
  v_y int := extract(year from v_month)::int;
  v_m int := extract(month from v_month)::int;
  v_issued_at timestamptz;
  v_due_at timestamptz;
  v_label text;
  v_created int := 0;
  v_skipped int := 0;
  r record;
  v_inv_id uuid;
begin
  v_fee_ex := public.get_billing_int_setting('monthly_membership_fee_ex_tax', 15000);
  v_issue_day := public.get_billing_int_setting('monthly_membership_issue_day', 20);
  v_due_day := public.get_billing_int_setting('monthly_membership_due_day', 26);

  if v_fee_ex <= 0 then
    raise exception 'monthly_membership_fee_ex_tax must be positive';
  end if;

  v_tax := public.calc_consumption_tax(v_fee_ex);
  v_inc := v_fee_ex + v_tax;
  v_issued_at := make_timestamptz(v_y, v_m, v_issue_day, 0, 0, 0, 'Asia/Tokyo');
  v_due_at := make_timestamptz(v_y, v_m, v_due_day, 23, 59, 59, 'Asia/Tokyo');
  v_label := format('MotoHub加盟店 月額会費（%s年%s月分）', v_y, v_m);

  for r in
    select p.id, p.email, p.store_name
    from public.profiles p
    where p.member_type = 'dealer'
      and p.account_status = 'approved'::public.account_status
      and p.is_active = true
      and not p.is_banned
  loop
    if exists (
      select 1 from public.invoices i
      where i.user_id = r.id
        and i.document_kind = 'monthly_membership'
        and i.billing_month = v_month
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.invoices (
      deal_id,
      inspection_request_id,
      billing_month,
      user_id,
      party,
      document_kind,
      status,
      total_ex_tax,
      total_tax,
      total_inc_tax,
      issued_at,
      payment_due_at
    )
    values (
      null,
      null,
      v_month,
      r.id,
      'seller',
      'monthly_membership',
      'issued',
      v_fee_ex,
      v_tax,
      v_inc,
      v_issued_at,
      v_due_at
    )
    returning id into v_inv_id;

    insert into public.invoice_items (
      invoice_id,
      item_type,
      label,
      amount_ex_tax,
      tax_amount,
      amount_inc_tax,
      sort_order
    )
    values (
      v_inv_id,
      'membership_fee',
      v_label,
      v_fee_ex,
      v_tax,
      v_inc,
      0
    );

    perform public.insert_user_notification(
      r.id,
      '月額会費の請求書を発行しました',
      format(
        '%s年%s月分 · 税込 %s円 · お支払期限 %s/%s（26日）まで',
        v_y, v_m, v_inc, v_m, v_due_day
      ),
      'important',
      '/my/payments'
    );

    perform public.notify_enqueue(
      'membership.invoice_issued',
      jsonb_build_object(
        'body', format(
          '%s · %s年%s月分 税込%s円 · 支払期限 %s月%s日',
          coalesce(r.store_name, r.email),
          v_y, v_m, v_inc, v_m, v_due_day
        )
      ),
      'invoices',
      v_inv_id
    );

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'billing_month', v_month,
    'created', v_created,
    'skipped_existing', v_skipped,
    'fee_ex_tax', v_fee_ex,
    'due_at', v_due_at
  );
end;
$$;

-- Cron: run on issue day (JST, default 20th)
create or replace function public.run_monthly_membership_billing_job(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jst date := (timezone('Asia/Tokyo', now()))::date;
  v_issue_day int := public.get_billing_int_setting('monthly_membership_issue_day', 20);
  v_month date := date_trunc('month', v_jst)::date;
begin
  if not p_force and extract(day from v_jst)::int <> v_issue_day then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'not_issue_day',
      'jst_date', v_jst,
      'issue_day', v_issue_day
    );
  end if;

  return public.issue_monthly_membership_invoices(v_month)
    || jsonb_build_object('skipped', false, 'jst_date', v_jst);
end;
$$;

-- Admin: manual issue (any day, current month by default)
create or replace function public.admin_issue_monthly_membership_invoices(
  p_billing_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  v_month := date_trunc(
    'month',
    coalesce(p_billing_month, (timezone('Asia/Tokyo', now()))::date)
  )::date;

  return public.issue_monthly_membership_invoices(v_month);
end;
$$;

grant execute on function public.issue_monthly_membership_invoices(date) to service_role;
grant execute on function public.run_monthly_membership_billing_job(boolean) to service_role;
grant execute on function public.admin_issue_monthly_membership_invoices(date) to authenticated;

-- Notification template
insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'membership.invoice_issued',
  'email',
  '[MotoHub] 月額会費請求書を発行しました',
  '月額会費の請求書を発行しました。

{{body}}

MotoHubの「振込・月額入金報告」から請求書PDFを確認し、期限までにお振込のうえ入金報告をお願いします。',
  true
)
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

-- Mark paid: link monthly payment report optional note
create or replace function public.admin_mark_invoice_paid(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.invoices;
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

  if v_row.document_kind = 'monthly_membership' and v_row.billing_month is not null then
    update public.monthly_payment_reports mpr
    set
      status = 'confirmed'::public.monthly_payment_status,
      admin_note = coalesce(trim(mpr.admin_note), '請求書入金確認'),
      confirmed_by = auth.uid(),
      confirmed_at = now()
    where mpr.user_id = v_row.user_id
      and mpr.billing_month = v_row.billing_month
      and mpr.status in ('reported', 'unconfirmed');
  end if;

  perform public.notify_user_email(
    'payment.confirmed',
    v_row.user_id,
    format('入金を確認しました（請求 %s）', p_invoice_id)
  );
  return v_row;
end;
$$;
