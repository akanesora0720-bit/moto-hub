-- UX pretest: 1台1商談 / 問い合わせ自動商談 / 成約確定 / 請求下書き / 設定

-- ---------------------------------------------------------------------------
-- listing_status: negotiating 追加
-- ---------------------------------------------------------------------------
alter type public.listing_status add value if not exists 'negotiating';

-- ---------------------------------------------------------------------------
-- deals: 管理者成約確認フラグ
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists seller_intent_confirmed boolean not null default false,
  add column if not exists buyer_intent_confirmed boolean not null default false;

-- 1 listing = 1 active deal
create unique index if not exists deals_one_active_per_listing_idx
  on public.deals (listing_id)
  where status not in ('completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- invoice status: review_pending
-- ---------------------------------------------------------------------------
alter type public.invoice_status add value if not exists 'review_pending';

-- ---------------------------------------------------------------------------
-- system settings
-- ---------------------------------------------------------------------------
create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values
  ('billing', '{"auto_send_invoices": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.get_setting_bool(p_key text, p_field text, p_default boolean default false)
returns boolean
language sql
stable
as $$
  select coalesce((value ->> p_field)::boolean, p_default)
  from public.system_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Active deal helper
-- ---------------------------------------------------------------------------
create or replace function public.listing_has_active_deal(p_listing_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.deals d
    where d.listing_id = p_listing_id
      and d.status not in ('completed', 'cancelled')
  );
$$;

create or replace function public.is_listing_inquirable(p_listing_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.listings l
    where l.id = p_listing_id
      and l.status = 'active'
      and not public.listing_has_active_deal(p_listing_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- 問い合わせ = 商談開始（1台1商談）
-- ---------------------------------------------------------------------------
create or replace function public.submit_listing_inquiry(
  p_listing_id uuid,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_listing public.listings;
  v_inquiry public.inquiries;
  v_deal public.deals;
begin
  if v_buyer is null then raise exception 'login required'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 5 then
    raise exception 'message too short';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null then raise exception 'listing not found'; end if;
  if v_listing.seller_id = v_buyer then raise exception 'cannot inquire own listing'; end if;
  if v_listing.status <> 'active' then raise exception 'listing not available'; end if;
  if public.listing_has_active_deal(p_listing_id) then raise exception 'listing is under negotiation'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_buyer and p.profile_completed = true and p.is_active = true and not p.is_banned
  ) then
    raise exception 'complete profile before inquiring';
  end if;

  insert into public.inquiries (listing_id, buyer_id, message, status)
  values (p_listing_id, v_buyer, trim(p_message), 'open')
  returning * into v_inquiry;

  insert into public.deals (
    listing_id, buyer_id, seller_id, agreed_price_ex_tax, status, inquiry_id
  ) values (
    p_listing_id, v_buyer, v_listing.seller_id, v_listing.price_ex_tax, 'negotiating', v_inquiry.id
  )
  returning * into v_deal;

  update public.listings set status = 'negotiating', updated_at = now()
  where id = p_listing_id;

  perform public.notify_enqueue(
    'inquiry.created',
    jsonb_build_object(
      'body', format('[%s %s] %s', v_listing.maker, v_listing.model, left(trim(p_message), 200))
    ),
    'inquiries', v_inquiry.id
  );
  perform public.notify_enqueue(
    'deal.created',
    jsonb_build_object('body', format('商談開始 deal=%s', v_deal.id)),
    'deals', v_deal.id
  );

  return jsonb_build_object(
    'inquiry_id', v_inquiry.id,
    'deal_id', v_deal.id
  );
end;
$$;

grant execute on function public.submit_listing_inquiry(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_create_deal: 1台1商談ガード + listing negotiating
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_deal(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_agreed_price_ex_tax int,
  p_inquiry_id uuid default null,
  p_initial_status public.deal_status default 'negotiating'
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v public.deals%rowtype;
  v_listing public.listings;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if v_listing.id is null then raise exception 'listing not found'; end if;
  if public.listing_has_active_deal(p_listing_id) then raise exception 'listing already has active deal'; end if;
  if v_listing.status not in ('active', 'negotiating') then raise exception 'listing not available'; end if;

  v_seller := v_listing.seller_id;

  insert into public.deals (listing_id, buyer_id, seller_id, agreed_price_ex_tax, status, inquiry_id)
  values (p_listing_id, p_buyer_id, v_seller, p_agreed_price_ex_tax, p_initial_status, p_inquiry_id)
  returning * into v;

  update public.listings set status = 'negotiating', updated_at = now() where id = p_listing_id;

  if p_inquiry_id is not null then
    update public.inquiries set status = 'closed' where id = p_inquiry_id and status = 'open';
  end if;

  perform public.notify_enqueue('deal.created',
    jsonb_build_object('body', format('deal %s created', v.id)), 'deals', v.id);

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_advance_deal: cancel で listing を active に戻す
-- ---------------------------------------------------------------------------
create or replace function public.admin_advance_deal(p_deal_id uuid, p_status public.deal_status)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;

  update public.deals
  set
    status = p_status,
    funded_at = case when p_status = 'funded' and funded_at is null then now() else funded_at end,
    payout_at = case when p_status = 'payout_done' and payout_at is null then now() else payout_at end,
    completed_at = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
    buyer_confirmed_at = case when p_status in ('cancelled', 'dispute') then null else buyer_confirmed_at end,
    seller_confirmed_at = case when p_status in ('cancelled', 'dispute') then null else seller_confirmed_at end,
    seller_intent_confirmed = case when p_status in ('cancelled', 'dispute') then false else seller_intent_confirmed end,
    buyer_intent_confirmed = case when p_status in ('cancelled', 'dispute') then false else buyer_intent_confirmed end,
    updated_at = now()
  where id = p_deal_id returning * into v;

  if p_status = 'completed' then
    update public.listings set status = 'sold', updated_at = now() where id = v.listing_id;
  elsif p_status = 'cancelled' then
    update public.listings set status = 'active', updated_at = now() where id = v.listing_id;
  end if;

  perform public.notify_deal_status(p_deal_id, p_status);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 管理者成約確定フロー
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_deal_intent(
  p_deal_id uuid,
  p_party text,
  p_confirmed boolean
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare v public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v.status not in ('inquiry', 'negotiating') then raise exception 'deal not in negotiation phase'; end if;

  if p_party = 'seller' then
    update public.deals set seller_intent_confirmed = p_confirmed, updated_at = now()
    where id = p_deal_id returning * into v;
  elsif p_party = 'buyer' then
    update public.deals set buyer_intent_confirmed = p_confirmed, updated_at = now()
    where id = p_deal_id returning * into v;
  else
    raise exception 'invalid party';
  end if;
  return v;
end;
$$;

grant execute on function public.admin_set_deal_intent(uuid, text, boolean) to authenticated;

create or replace function public.admin_finalize_agreement(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare v public.deals%rowtype;
        v_auto boolean;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if not v.seller_intent_confirmed or not v.buyer_intent_confirmed then
    raise exception 'both parties must be confirmed by admin';
  end if;
  if v.status not in ('inquiry', 'negotiating') then raise exception 'invalid deal status for agreement'; end if;

  update public.deals set status = 'agreed', updated_at = now()
  where id = p_deal_id returning * into v;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'review_pending', updated_at = now()
  where deal_id = p_deal_id and status = 'draft';

  perform public.notify_enqueue(
    'invoice.review_pending',
    jsonb_build_object('body', format('deal %s 請求書確認待ち', p_deal_id)),
    'deals', p_deal_id
  );

  v_auto := public.get_setting_bool('billing', 'auto_send_invoices', false);
  if v_auto then
    perform public.admin_approve_and_send_invoices(p_deal_id);
  end if;

  perform public.notify_deal_status(p_deal_id, 'agreed');
  return v;
end;
$$;

grant execute on function public.admin_finalize_agreement(uuid) to authenticated;

create or replace function public.admin_approve_and_send_invoices(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_deal public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v_deal from public.deals where id = p_deal_id;
  if not found then raise exception 'deal not found'; end if;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'issued', issued_at = coalesce(issued_at, now()), updated_at = now()
  where deal_id = p_deal_id and status in ('draft', 'review_pending');

  perform public.notify_user_email('invoice.issued', v_deal.buyer_id,
    format('取引 %s の請求書を発行しました。取引詳細からPDFを確認できます。', p_deal_id));
  perform public.notify_user_email('invoice.issued', v_deal.seller_id,
    format('取引 %s の精算書を発行しました。', p_deal_id));

  return public.ensure_deal_billing(p_deal_id);
end;
$$;

grant execute on function public.admin_approve_and_send_invoices(uuid) to authenticated;

-- ensure_deal_billing: draft のまま
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

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id, v_deal.buyer_id, 'buyer', 'draft',
    v_price + v_buyer_fee, v_buyer_tax, v_price + v_buyer_fee + v_buyer_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_buyer_inv;

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id, v_deal.seller_id, 'seller', 'draft',
    v_price - v_seller_fee, v_seller_tax, v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_seller_inv;

  select id into v_buyer_inv from public.invoices where deal_id = p_deal_id and party = 'buyer';
  select id into v_seller_inv from public.invoices where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_inv, v_seller_inv);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order) values
    (v_buyer_inv, 'vehicle_price', '車両価格（税抜）', v_price, 0, v_price, 1),
    (v_buyer_inv, 'buyer_fee', '買い手手数料（税抜・最低5000円）', v_buyer_fee, v_buyer_tax, v_buyer_fee + v_buyer_tax, 2),
    (v_seller_inv, 'vehicle_price', '売却価格（税抜）', v_price, 0, v_price, 1),
    (v_seller_inv, 'seller_fee', '売り手手数料（税抜・最低5000円）', -v_seller_fee, -v_seller_tax, -(v_seller_fee + v_seller_tax), 2);

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

-- admin_issue_deal_invoices: 後方互換 → approve flow へ
create or replace function public.admin_issue_deal_invoices(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return public.admin_approve_and_send_invoices(p_deal_id);
end;
$$;

insert into public.notification_templates (event_type, channel, subject_template, body_template) values
  ('invoice.review_pending', 'email', '[MotoHub] 請求書確認待ち', '請求書・精算書の確認が必要です。\n\n{{body}}')
on conflict (event_type) do update
set subject_template = excluded.subject_template, body_template = excluded.body_template;

-- RLS system_settings admin only
alter table public.system_settings enable row level security;
drop policy if exists system_settings_admin on public.system_settings;
create policy system_settings_admin on public.system_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.system_settings to authenticated;
