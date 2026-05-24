-- Deal exclusivity, audit status logs, fee model (buyer 0% / seller 5%)
-- Note: vehicle inventory is public.listings (spec "bikes" maps to listings.id)

-- ---------------------------------------------------------------------------
-- audit_logs: status change columns
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add column if not exists target_table text,
  add column if not exists before_status text,
  add column if not exists after_status text;

create or replace function public.write_status_audit_log(
  p_action text,
  p_target_table text,
  p_target_id uuid,
  p_before_status text,
  p_after_status text,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    target_table,
    before_status,
    after_status,
    payload
  )
  values (
    coalesce(p_actor_id, auth.uid()),
    p_action,
    p_target_table,
    p_target_id,
    p_target_table,
    p_before_status,
    p_after_status,
    jsonb_build_object(
      'before_status', p_before_status,
      'after_status', p_after_status
    )
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fee defaults & calc (buyer 0%, seller 5% flat — no minimum)
-- ---------------------------------------------------------------------------
alter table public.deals
  alter column buyer_fee_rate set default 0,
  alter column seller_fee_rate set default 0.05;

create or replace function public.calc_fee_ex_tax(
  p_amount int,
  p_rate numeric,
  p_min int default 5000
)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_rate, 0) <= 0 then 0
    when coalesce(p_min, 0) <= 0 then round(p_amount * p_rate)::int
    else greatest(p_min, round(p_amount * p_rate)::int)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic deal creation (1 listing = 1 active deal)
-- ---------------------------------------------------------------------------
create or replace function public.create_active_deal(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_initial_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_listing public.listings;
  v_inquiry public.inquiries;
  v_deal public.deals;
  v_listing_before text;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if p_buyer_id = p_seller_id then
    raise exception 'buyer cannot be seller';
  end if;
  if char_length(trim(coalesce(p_initial_message, ''))) < 5 then
    raise exception 'message too short';
  end if;
  if v_caller <> p_buyer_id and not public.is_admin() then
    raise exception 'buyer mismatch';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'listing not found';
  end if;
  if v_listing.seller_id <> p_seller_id then
    raise exception 'seller mismatch';
  end if;
  if v_listing.status <> 'active' then
    raise exception 'listing not available';
  end if;
  if public.listing_has_active_deal(p_listing_id) then
    raise exception 'listing is under negotiation';
  end if;

  if not public.is_admin() then
    if not exists (
      select 1 from public.profiles p
      where p.id = p_buyer_id
        and p.profile_completed = true
        and p.is_active = true
        and not p.is_banned
    ) then
      raise exception 'complete profile before inquiring';
    end if;
  end if;

  v_listing_before := v_listing.status::text;

  insert into public.inquiries (listing_id, buyer_id, message, status)
  values (p_listing_id, p_buyer_id, trim(p_initial_message), 'open')
  returning * into v_inquiry;

  insert into public.deals (
    listing_id,
    buyer_id,
    seller_id,
    agreed_price_ex_tax,
    status,
    inquiry_id,
    buyer_fee_rate,
    seller_fee_rate
  )
  values (
    p_listing_id,
    p_buyer_id,
    p_seller_id,
    v_listing.price_ex_tax,
    'negotiating',
    v_inquiry.id,
    0,
    0.05
  )
  returning * into v_deal;

  update public.listings
  set status = 'negotiating', updated_at = now()
  where id = p_listing_id;

  perform public.write_status_audit_log(
    'deal_started',
    'listings',
    p_listing_id,
    v_listing_before,
    'negotiating',
    v_caller
  );
  perform public.write_status_audit_log(
    'deal_created',
    'deals',
    v_deal.id,
    null,
    v_deal.status::text,
    v_caller
  );

  perform public.notify_enqueue(
    'inquiry.created',
    jsonb_build_object(
      'body',
      format(
        '[%s %s] %s',
        v_listing.maker,
        v_listing.model,
        left(trim(p_initial_message), 200)
      )
    ),
    'inquiries',
    v_inquiry.id
  );
  perform public.notify_enqueue(
    'deal.created',
    jsonb_build_object('body', format('商談開始 deal=%s', v_deal.id)),
    'deals',
    v_deal.id
  );

  return jsonb_build_object(
    'inquiry_id', v_inquiry.id,
    'deal_id', v_deal.id,
    'listing_id', p_listing_id
  );
end;
$$;

grant execute on function public.create_active_deal(uuid, uuid, uuid, text) to authenticated;

-- Backward-compatible alias (spec name p_bike_id → listings.id)
comment on function public.create_active_deal(uuid, uuid, uuid, text) is
  'Atomically starts a deal for one listing (vehicle). p_listing_id is the inventory id (listings / bikes).';

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
  v_seller uuid;
begin
  if v_buyer is null then
    raise exception 'login required';
  end if;

  select seller_id into v_seller
  from public.listings
  where id = p_listing_id;

  if v_seller is null then
    raise exception 'listing not found';
  end if;
  if v_seller = v_buyer then
    raise exception 'cannot inquire own listing';
  end if;

  return public.create_active_deal(
    p_listing_id,
    v_buyer,
    v_seller,
    p_message
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_create_deal: reuse exclusivity + audit
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
  v public.deals%rowtype;
  v_listing public.listings;
  v_listing_before text;
  v_deal_before text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'listing not found';
  end if;
  if public.listing_has_active_deal(p_listing_id) then
    raise exception 'listing already has active deal';
  end if;
  if v_listing.status not in ('active', 'negotiating') then
    raise exception 'listing not available';
  end if;

  v_listing_before := v_listing.status::text;

  insert into public.deals (
    listing_id,
    buyer_id,
    seller_id,
    agreed_price_ex_tax,
    status,
    inquiry_id,
    buyer_fee_rate,
    seller_fee_rate
  )
  values (
    p_listing_id,
    p_buyer_id,
    v_listing.seller_id,
    p_agreed_price_ex_tax,
    p_initial_status,
    p_inquiry_id,
    0,
    0.05
  )
  returning * into v;

  if v_listing.status <> 'negotiating' then
    update public.listings
    set status = 'negotiating', updated_at = now()
    where id = p_listing_id;

    perform public.write_status_audit_log(
      'listing_status_changed',
      'listings',
      p_listing_id,
      v_listing_before,
      'negotiating'
    );
  end if;

  perform public.write_status_audit_log(
    'deal_created',
    'deals',
    v.id,
    null,
    v.status::text
  );

  if p_inquiry_id is not null then
    update public.inquiries
    set status = 'closed'
    where id = p_inquiry_id and status = 'open';
  end if;

  perform public.notify_enqueue(
    'deal.created',
    jsonb_build_object('body', format('deal %s created', v.id)),
    'deals',
    v.id
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_advance_deal: audit listing + deal status changes
-- ---------------------------------------------------------------------------
create or replace function public.admin_advance_deal(
  p_deal_id uuid,
  p_status public.deal_status
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_deal_before text;
  v_listing_before text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v
  from public.deals
  where id = p_deal_id
  for update;

  if not found then
    raise exception 'deal not found';
  end if;

  v_deal_before := v.status::text;

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
  where id = p_deal_id
  returning * into v;

  perform public.write_status_audit_log(
    'deal_status_changed',
    'deals',
    p_deal_id,
    v_deal_before,
    p_status::text
  );

  if p_status = 'completed' then
    select status::text into v_listing_before
    from public.listings
    where id = v.listing_id;

    update public.listings
    set status = 'sold', updated_at = now()
    where id = v.listing_id;

    perform public.write_status_audit_log(
      'listing_status_changed',
      'listings',
      v.listing_id,
      v_listing_before,
      'sold'
    );
  elsif p_status = 'cancelled' then
    select status::text into v_listing_before
    from public.listings
    where id = v.listing_id;

    update public.listings
    set status = 'active', updated_at = now()
    where id = v.listing_id;

    perform public.write_status_audit_log(
      'listing_status_changed',
      'listings',
      v.listing_id,
      v_listing_before,
      'active'
    );
  end if;

  perform public.notify_deal_status(p_deal_id, p_status);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_deal_billing: buyer 0% / seller 5%
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
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  v_price := v_deal.agreed_price_ex_tax;

  v_buyer_fee := public.calc_fee_ex_tax(v_price, coalesce(v_deal.buyer_fee_rate, 0), 0);
  v_seller_fee := public.calc_fee_ex_tax(v_price, coalesce(v_deal.seller_fee_rate, 0.05), 0);
  v_buyer_tax := round(v_buyer_fee * 0.1)::int;
  v_seller_tax := round(v_seller_fee * 0.1)::int;

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id,
    v_deal.buyer_id,
    'buyer',
    'draft',
    v_price + v_buyer_fee,
    v_buyer_tax,
    v_price + v_buyer_fee + v_buyer_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_buyer_inv;

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id,
    v_deal.seller_id,
    'seller',
    'draft',
    v_price - v_seller_fee,
    v_seller_tax,
    v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id, party) do update set updated_at = now()
  returning id into v_seller_inv;

  select id into v_buyer_inv from public.invoices where deal_id = p_deal_id and party = 'buyer';
  select id into v_seller_inv from public.invoices where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_inv, v_seller_inv);

  if v_buyer_fee > 0 then
    insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
    values
      (v_buyer_inv, 'vehicle_price', '車両価格（税抜）', v_price, 0, v_price, 1),
      (v_buyer_inv, 'buyer_fee', '買い手手数料（税抜）', v_buyer_fee, v_buyer_tax, v_buyer_fee + v_buyer_tax, 2);
  else
    insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
    values
      (v_buyer_inv, 'vehicle_price', '車両価格（税抜）', v_price, 0, v_price, 1);
  end if;

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_seller_inv, 'vehicle_price', '売却価格（税抜）', v_price, 0, v_price, 1),
    (v_seller_inv, 'seller_fee', '売り手手数料（税抜・5%）', -v_seller_fee, -v_seller_tax, -(v_seller_fee + v_seller_tax), 2);

  insert into public.payouts (deal_id, seller_id, gross_vehicle_price, seller_fee_ex_tax, seller_fee_tax, payout_amount)
  values (
    p_deal_id,
    v_deal.seller_id,
    v_price,
    v_seller_fee,
    v_seller_tax,
    v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id) do update set
    gross_vehicle_price = excluded.gross_vehicle_price,
    seller_fee_ex_tax = excluded.seller_fee_ex_tax,
    seller_fee_tax = excluded.seller_fee_tax,
    payout_amount = excluded.payout_amount;

  return jsonb_build_object('buyer_invoice_id', v_buyer_inv, 'seller_invoice_id', v_seller_inv);
end;
$$;
