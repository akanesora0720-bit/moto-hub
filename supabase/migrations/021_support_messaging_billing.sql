-- Phase5: 運営サポート / 管理者メール / 請求・入出金

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'support_ticket_category') then
    create type public.support_ticket_category as enum (
      'name_transfer', 'documents', 'payment', 'deal', 'billing', 'system', 'other'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'support_ticket_status') then
    create type public.support_ticket_status as enum (
      'open', 'reviewing', 'answered', 'closed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'message_importance') then
    create type public.message_importance as enum ('normal', 'important', 'urgent');
  end if;
  if not exists (select 1 from pg_type where typname = 'message_log_status') then
    create type public.message_log_status as enum ('draft', 'queued', 'sent', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'bulk_batch_status') then
    create type public.bulk_batch_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'monthly_payment_status') then
    create type public.monthly_payment_status as enum (
      'reported', 'unconfirmed', 'confirmed', 'rejected'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_party') then
    create type public.invoice_party as enum ('buyer', 'seller');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('draft', 'issued', 'paid', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_item_type') then
    create type public.invoice_item_type as enum (
      'vehicle_price', 'buyer_fee', 'seller_fee', 'consumption_tax', 'adjustment'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type public.payout_status as enum ('awaiting', 'ready', 'paid', 'cancelled');
  end if;
end
$$;

alter type public.notification_channel add value if not exists 'in_app';

-- ---------------------------------------------------------------------------
-- In-app notifications
-- ---------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  importance public.message_importance not null default 'normal',
  link_url text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx
  on public.user_notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  category public.support_ticket_category not null,
  subject text not null check (char_length(trim(subject)) >= 2),
  message text not null check (char_length(trim(message)) >= 10),
  status public.support_ticket_status not null default 'open',
  admin_reply text,
  answered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Admin messaging
-- ---------------------------------------------------------------------------
create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  batch_id uuid,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_email text not null,
  subject text not null,
  body text not null,
  importance public.message_importance not null default 'normal',
  send_email boolean not null default true,
  send_in_app boolean not null default true,
  status public.message_log_status not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists message_logs_status_idx on public.message_logs (status, created_at);

create table if not exists public.bulk_message_batches (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles (id) on delete set null,
  title text not null,
  subject text not null,
  body text not null,
  filter_json jsonb not null default '{}'::jsonb,
  importance public.message_importance not null default 'normal',
  send_email boolean not null default true,
  send_in_app boolean not null default true,
  target_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  status public.bulk_batch_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.message_logs
  drop constraint if exists message_logs_batch_id_fkey;
alter table public.message_logs
  add constraint message_logs_batch_id_fkey
  foreign key (batch_id) references public.bulk_message_batches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Monthly membership payments
-- ---------------------------------------------------------------------------
create table if not exists public.monthly_payment_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  billing_month date not null,
  reported_amount int not null check (reported_amount > 0),
  paid_at date not null,
  payer_name text not null check (char_length(trim(payer_name)) >= 1),
  note text,
  status public.monthly_payment_status not null default 'reported',
  admin_note text,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint monthly_payment_reports_unique unique (user_id, billing_month)
);

create index if not exists monthly_payment_reports_status_idx
  on public.monthly_payment_reports (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Deal billing
-- ---------------------------------------------------------------------------
alter table public.deals
  alter column buyer_fee_rate set default 0.04;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  party public.invoice_party not null,
  status public.invoice_status not null default 'draft',
  total_ex_tax int not null default 0,
  total_tax int not null default 0,
  total_inc_tax int not null default 0,
  issued_at timestamptz,
  paid_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_deal_party_unique unique (deal_id, party)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  item_type public.invoice_item_type not null,
  label text not null,
  amount_ex_tax int not null,
  tax_amount int not null default 0,
  amount_inc_tax int not null,
  sort_order int not null default 0
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id, sort_order);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  gross_vehicle_price int not null,
  seller_fee_ex_tax int not null,
  seller_fee_tax int not null,
  payout_amount int not null,
  status public.payout_status not null default 'awaiting',
  paid_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  constraint payouts_deal_unique unique (deal_id)
);

create table if not exists public.invoice_documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  pdf_url text,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.calc_fee_ex_tax(p_amount int, p_rate numeric, p_min int default 5000)
returns int
language sql
immutable
as $$
  select greatest(p_min, round(p_amount * p_rate)::int);
$$;

create or replace function public.insert_user_notification(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_importance public.message_importance default 'normal',
  p_link_url text default null,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.user_notifications (user_id, title, body, importance, link_url, entity_type, entity_id)
  values (p_user_id, trim(p_title), trim(p_body), p_importance, p_link_url, p_entity_type, p_entity_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.notify_user_email(
  p_event_type text,
  p_user_id uuid,
  p_body text,
  p_subject_override text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then return null; end if;
  return public.notify_enqueue(
    p_event_type,
    jsonb_build_object('body', p_body, 'recipient_email', v_email, 'user_id', p_user_id, 'subject', coalesce(p_subject_override, '')),
    'profiles', p_user_id, 'email'::public.notification_channel
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Support RPCs
-- ---------------------------------------------------------------------------
create or replace function public.submit_support_ticket(
  p_category public.support_ticket_category,
  p_subject text,
  p_message text,
  p_deal_id uuid default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.support_tickets;
        v_store text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_deal_id is not null then
    if not exists (
      select 1 from public.deals d
      where d.id = p_deal_id and (d.buyer_id = auth.uid() or d.seller_id = auth.uid())
    ) then
      raise exception 'deal access denied';
    end if;
  end if;

  insert into public.support_tickets (user_id, deal_id, category, subject, message)
  values (auth.uid(), p_deal_id, p_category, trim(p_subject), trim(p_message))
  returning * into v_row;

  select coalesce(store_name, email) into v_store from public.profiles where id = auth.uid();

  perform public.insert_user_notification(
    auth.uid(), '問い合わせを受付しました', trim(p_subject), 'normal', '/support/' || v_row.id, 'support_tickets', v_row.id
  );
  perform public.notify_enqueue(
    'support.created',
    jsonb_build_object('body', format('[%s] %s\n%s', v_row.category, trim(p_subject), left(trim(p_message), 500))),
    'support_tickets', v_row.id
  );
  perform public.notify_user_email(
    'support.received', auth.uid(),
    format('件名: %s\n内容は管理画面で確認できます。', trim(p_subject))
  );

  return v_row;
end;
$$;

grant execute on function public.submit_support_ticket(public.support_ticket_category, text, text, uuid) to authenticated;

create or replace function public.admin_reply_support_ticket(
  p_ticket_id uuid,
  p_reply text,
  p_status public.support_ticket_status default 'answered'
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.support_tickets;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if char_length(trim(coalesce(p_reply, ''))) < 2 then raise exception 'reply required'; end if;

  update public.support_tickets
  set admin_reply = trim(p_reply),
      status = p_status,
      answered_by = auth.uid(),
      answered_at = now(),
      updated_at = now()
  where id = p_ticket_id
  returning * into v_row;

  if v_row.id is null then raise exception 'ticket not found'; end if;

  perform public.insert_user_notification(
    v_row.user_id, '運営サポート回答', trim(p_reply), 'important',
    '/support/' || v_row.id, 'support_tickets', v_row.id
  );
  perform public.notify_user_email(
    'support.answered', v_row.user_id,
    format('件名: %s\n\n%s', v_row.subject, trim(p_reply))
  );

  return v_row;
end;
$$;

grant execute on function public.admin_reply_support_ticket(uuid, text, public.support_ticket_status) to authenticated;

create or replace function public.admin_set_support_status(
  p_ticket_id uuid,
  p_status public.support_ticket_status
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.support_tickets;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.support_tickets set status = p_status, updated_at = now()
  where id = p_ticket_id returning * into v_row;
  if v_row.id is null then raise exception 'ticket not found'; end if;
  return v_row;
end;
$$;

grant execute on function public.admin_set_support_status(uuid, public.support_ticket_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Deal billing generation
-- ---------------------------------------------------------------------------
create or replace function public.ensure_deal_billing(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_buyer_fee int;
  v_seller_fee int;
  v_buyer_tax int;
  v_seller_tax int;
  v_buyer_inv uuid;
  v_seller_inv uuid;
  v_price int;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  v_price := v_deal.agreed_price_ex_tax;

  v_buyer_fee := public.calc_fee_ex_tax(v_price, coalesce(v_deal.buyer_fee_rate, 0.04));
  v_seller_fee := public.calc_fee_ex_tax(v_price, coalesce(v_deal.seller_fee_rate, 0.05));
  v_buyer_tax := round(v_buyer_fee * 0.1)::int;
  v_seller_tax := round(v_seller_fee * 0.1)::int;

  insert into public.invoices (deal_id, user_id, party, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id, v_deal.buyer_id, 'buyer',
    v_price + v_buyer_fee, v_buyer_tax, v_price + v_buyer_fee + v_buyer_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_buyer_inv;

  insert into public.invoices (deal_id, user_id, party, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id, v_deal.seller_id, 'seller',
    v_price - v_seller_fee, v_seller_tax, v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_seller_inv;

  delete from public.invoice_items where invoice_id in (v_buyer_inv, v_seller_inv);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order) values
    (v_buyer_inv, 'vehicle_price', '車両価格（税抜）', v_price, 0, v_price, 1),
    (v_buyer_inv, 'buyer_fee', '買い手手数料（税抜）', v_buyer_fee, v_buyer_tax, v_buyer_fee + v_buyer_tax, 2),
    (v_seller_inv, 'vehicle_price', '売却価格（税抜）', v_price, 0, v_price, 1),
    (v_seller_inv, 'seller_fee', '売り手手数料（税抜）', -v_seller_fee, -v_seller_tax, -(v_seller_fee + v_seller_tax), 2);

  insert into public.payouts (deal_id, seller_id, gross_vehicle_price, seller_fee_ex_tax, seller_fee_tax, payout_amount)
  values (p_deal_id, v_deal.seller_id, v_price, v_seller_fee, v_seller_tax, v_price - v_seller_fee - v_seller_tax)
  on conflict (deal_id) do update set
    gross_vehicle_price = excluded.gross_vehicle_price,
    seller_fee_ex_tax = excluded.seller_fee_ex_tax,
    seller_fee_tax = excluded.seller_fee_tax,
    payout_amount = excluded.payout_amount;

  return jsonb_build_object('buyer_invoice_id', v_buyer_inv, 'seller_invoice_id', v_seller_inv);
end;
$$;

grant execute on function public.ensure_deal_billing(uuid) to authenticated;

create or replace function public.admin_issue_deal_invoices(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  perform public.ensure_deal_billing(p_deal_id);
  update public.invoices set status = 'issued', issued_at = now(), updated_at = now()
  where deal_id = p_deal_id and status = 'draft';

  perform public.notify_user_email('invoice.issued', (select buyer_id from public.deals where id = p_deal_id),
    format('取引 %s の請求書を発行しました。', p_deal_id));
  perform public.notify_user_email('invoice.issued', (select seller_id from public.deals where id = p_deal_id),
    format('取引 %s の精算書を発行しました。', p_deal_id));

  return public.ensure_deal_billing(p_deal_id);
end;
$$;

grant execute on function public.admin_issue_deal_invoices(uuid) to authenticated;

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
  perform public.notify_user_email('payment.confirmed', v_row.user_id, format('入金を確認しました（請求 %s）', p_invoice_id));
  return v_row;
end;
$$;

grant execute on function public.admin_mark_invoice_paid(uuid) to authenticated;

create or replace function public.admin_mark_payout_paid(p_payout_id uuid, p_note text default null)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.payouts;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.payouts
  set status = 'paid', paid_at = now(), admin_note = coalesce(trim(p_note), admin_note)
  where id = p_payout_id returning * into v_row;
  if v_row.id is null then raise exception 'payout not found'; end if;
  perform public.notify_user_email('payout.completed', v_row.seller_id,
    format('振込が完了しました。金額: %s円', v_row.payout_amount));
  return v_row;
end;
$$;

grant execute on function public.admin_mark_payout_paid(uuid, text) to authenticated;

create or replace function public.admin_set_payout_status(
  p_payout_id uuid,
  p_status public.payout_status
)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.payouts;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.payouts set status = p_status where id = p_payout_id returning * into v_row;
  if v_row.id is null then raise exception 'payout not found'; end if;
  if p_status = 'ready' then
    perform public.notify_user_email('payout.ready', v_row.seller_id, '振込準備が完了しました。');
  end if;
  return v_row;
end;
$$;

grant execute on function public.admin_set_payout_status(uuid, public.payout_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Monthly payment RPCs
-- ---------------------------------------------------------------------------
create or replace function public.report_monthly_payment(
  p_billing_month date,
  p_reported_amount int,
  p_paid_at date,
  p_payer_name text,
  p_note text default null
)
returns public.monthly_payment_reports
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.monthly_payment_reports;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  insert into public.monthly_payment_reports (user_id, billing_month, reported_amount, paid_at, payer_name, note, status)
  values (auth.uid(), date_trunc('month', p_billing_month)::date, p_reported_amount, p_paid_at, trim(p_payer_name), p_note, 'reported')
  on conflict (user_id, billing_month) do update set
    reported_amount = excluded.reported_amount,
    paid_at = excluded.paid_at,
    payer_name = excluded.payer_name,
    note = excluded.note,
    status = 'reported',
    admin_note = null,
    confirmed_by = null,
    confirmed_at = null
  returning * into v_row;

  perform public.notify_enqueue('membership.payment_reported',
    jsonb_build_object('body', format('%s %s円', v_row.billing_month, v_row.reported_amount)),
    'monthly_payment_reports', v_row.id);
  perform public.insert_user_notification(auth.uid(), '月額入金を報告しました',
    format('%s 分 %s円', v_row.billing_month, v_row.reported_amount), 'normal', '/my/payments');

  return v_row;
end;
$$;

grant execute on function public.report_monthly_payment(date, int, date, text, text) to authenticated;

create or replace function public.admin_confirm_monthly_payment(
  p_report_id uuid,
  p_status public.monthly_payment_status,
  p_admin_note text default null
)
returns public.monthly_payment_reports
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.monthly_payment_reports;
        v_event text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('confirmed', 'rejected', 'unconfirmed') then
    raise exception 'invalid status';
  end if;

  update public.monthly_payment_reports
  set status = p_status,
      admin_note = coalesce(trim(p_admin_note), admin_note),
      confirmed_by = auth.uid(),
      confirmed_at = now()
  where id = p_report_id returning * into v_row;

  if v_row.id is null then raise exception 'report not found'; end if;

  v_event := case p_status when 'confirmed' then 'membership.payment_confirmed' else 'membership.payment_rejected' end;
  perform public.notify_user_email(v_event, v_row.user_id, coalesce(trim(p_admin_note), p_status::text));
  perform public.insert_user_notification(v_row.user_id, '月額入金報告の結果',
    coalesce(trim(p_admin_note), p_status::text), 'important', '/my/payments');

  return v_row;
end;
$$;

grant execute on function public.admin_confirm_monthly_payment(uuid, public.monthly_payment_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin messaging RPCs
-- ---------------------------------------------------------------------------
create or replace function public.admin_send_message(
  p_target_user_id uuid,
  p_subject text,
  p_body text,
  p_importance public.message_importance default 'normal',
  p_send_email boolean default true,
  p_send_in_app boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_email text;
        v_log_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select email into v_email from public.profiles where id = p_target_user_id;
  if v_email is null then raise exception 'user not found'; end if;

  insert into public.message_logs (admin_id, target_user_id, target_email, subject, body, importance, send_email, send_in_app, status)
  values (auth.uid(), p_target_user_id, v_email, trim(p_subject), trim(p_body), p_importance, p_send_email, p_send_in_app, 'queued')
  returning id into v_log_id;

  if p_send_in_app then
    perform public.insert_user_notification(
      p_target_user_id, trim(p_subject), trim(p_body), p_importance, '/notifications', 'message_logs', v_log_id
    );
  end if;
  if p_send_email then
    perform public.notify_enqueue('admin.message',
      jsonb_build_object('body', trim(p_body), 'recipient_email', v_email, 'subject', trim(p_subject)),
      'message_logs', v_log_id);
  end if;

  update public.message_logs set status = 'sent', sent_at = now() where id = v_log_id;
  return v_log_id;
end;
$$;

grant execute on function public.admin_send_message(uuid, text, text, public.message_importance, boolean, boolean) to authenticated;

create or replace function public.admin_create_bulk_message_batch(
  p_title text,
  p_subject text,
  p_body text,
  p_filter_json jsonb,
  p_importance public.message_importance default 'normal',
  p_send_email boolean default true,
  p_send_in_app boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_batch_id uuid;
        v_count int := 0;
        r record;
        v_filter jsonb := coalesce(p_filter_json, '{}'::jsonb);
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  insert into public.bulk_message_batches (admin_id, title, subject, body, filter_json, importance, send_email, send_in_app, status)
  values (auth.uid(), trim(p_title), trim(p_subject), trim(p_body), v_filter, p_importance, p_send_email, p_send_in_app, 'processing')
  returning id into v_batch_id;

  for r in
    select p.id, p.email
    from public.profiles p
    where p.member_type = 'dealer'
      and (not coalesce((v_filter->>'exclude_banned')::boolean, true) or p.is_banned = false)
      and (v_filter->>'trust_rank' is null or p.trust_rank::text = v_filter->>'trust_rank')
      and (v_filter->>'prefecture' is null or p.prefecture = v_filter->>'prefecture')
      and (
        v_filter->>'active_deals' is null
        or exists (
          select 1 from public.deals d
          where (d.buyer_id = p.id or d.seller_id = p.id)
            and d.status not in ('completed', 'cancelled')
        )
      )
  loop
    insert into public.message_logs (admin_id, batch_id, target_user_id, target_email, subject, body, importance, send_email, send_in_app, status)
    values (auth.uid(), v_batch_id, r.id, r.email, trim(p_subject), trim(p_body), p_importance, p_send_email, p_send_in_app, 'queued');

    if p_send_in_app then
      perform public.insert_user_notification(r.id, trim(p_subject), trim(p_body), p_importance, '/notifications', 'bulk_message_batches', v_batch_id);
    end if;
    if p_send_email then
      perform public.notify_enqueue('admin.message',
        jsonb_build_object('body', trim(p_body), 'recipient_email', r.email, 'subject', trim(p_subject)),
        'message_logs', v_batch_id);
    end if;

    update public.message_logs set status = 'sent', sent_at = now()
    where batch_id = v_batch_id and target_user_id = r.id and status = 'queued';

    v_count := v_count + 1;
  end loop;

  update public.bulk_message_batches
  set target_count = v_count, sent_count = v_count, status = 'completed', completed_at = now()
  where id = v_batch_id;

  return v_batch_id;
end;
$$;

grant execute on function public.admin_create_bulk_message_batch(text, text, text, jsonb, public.message_importance, boolean, boolean) to authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications set read_at = now()
  where id = p_notification_id and user_id = auth.uid();
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification templates
-- ---------------------------------------------------------------------------
insert into public.notification_templates (event_type, channel, subject_template, body_template) values
  ('support.created', 'email', '[MotoHub] 新規サポート問い合わせ', '運営サポート問い合わせが届きました。\n\n{{body}}'),
  ('support.received', 'email', '[MotoHub] 問い合わせ受付', '{{body}}'),
  ('support.answered', 'email', '[MotoHub] サポート回答', '{{body}}'),
  ('admin.message', 'email', '[MotoHub] {{subject}}', '{{body}}'),
  ('membership.payment_reported', 'email', '[MotoHub] 月額入金報告', '月額入金報告が届きました。\n\n{{body}}'),
  ('membership.payment_confirmed', 'email', '[MotoHub] 月額入金確認', '{{body}}'),
  ('membership.payment_rejected', 'email', '[MotoHub] 月額入金差戻し', '{{body}}'),
  ('invoice.issued', 'email', '[MotoHub] 請求書発行', '{{body}}'),
  ('payment.confirmed', 'email', '[MotoHub] 入金確認', '{{body}}'),
  ('payout.ready', 'email', '[MotoHub] 振込準備完了', '{{body}}'),
  ('payout.completed', 'email', '[MotoHub] 振込完了', '{{body}}')
on conflict (event_type) do update
set subject_template = excluded.subject_template, body_template = excluded.body_template;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.user_notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.message_logs enable row level security;
alter table public.bulk_message_batches enable row level security;
alter table public.monthly_payment_reports enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payouts enable row level security;
alter table public.invoice_documents enable row level security;

create policy user_notifications_self on public.user_notifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy user_notifications_update on public.user_notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy support_tickets_self on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid());
create policy support_tickets_admin on public.support_tickets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy message_logs_admin on public.message_logs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy bulk_batches_admin on public.bulk_message_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy monthly_payments_self on public.monthly_payment_reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy monthly_payments_insert on public.monthly_payment_reports for insert to authenticated
  with check (user_id = auth.uid());
create policy monthly_payments_admin on public.monthly_payment_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy invoices_party on public.invoices for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy invoices_admin on public.invoices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy invoice_items_party on public.invoice_items for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and (i.user_id = auth.uid() or public.is_admin())
  ));
create policy invoice_items_admin on public.invoice_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy payouts_party on public.payouts for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());
create policy payouts_admin on public.payouts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy invoice_docs_party on public.invoice_documents for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id and (i.user_id = auth.uid() or public.is_admin())
  ));
create policy invoice_docs_admin on public.invoice_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
