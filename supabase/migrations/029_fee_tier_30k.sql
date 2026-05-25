-- Fee tier: vehicle price <= 30,000 ex-tax → buyer 0% / seller 0%
-- vehicle price >= 30,001 ex-tax → buyer 0% / seller 5%

-- ---------------------------------------------------------------------------
-- Resolve fee rates from vehicle price (ex-tax)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_deal_fee_rates(p_price_ex_tax int)
returns jsonb
language sql
immutable
as $$
  select case
    when coalesce(p_price_ex_tax, 0) <= 30000 then
      jsonb_build_object(
        'buyer_fee_rate', 0,
        'seller_fee_rate', 0,
        'fee_tier', 'waived_low_price'
      )
    else
      jsonb_build_object(
        'buyer_fee_rate', 0,
        'seller_fee_rate', 0.05,
        'fee_tier', 'standard'
      )
  end;
$$;

-- ---------------------------------------------------------------------------
-- create_active_deal: atomic inquiry + deal + listing lock (listings = spec "bikes")
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
  v_rates jsonb;
  v_buyer_rate numeric;
  v_seller_rate numeric;
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
  v_rates := public.resolve_deal_fee_rates(v_listing.price_ex_tax);
  v_buyer_rate := (v_rates->>'buyer_fee_rate')::numeric;
  v_seller_rate := (v_rates->>'seller_fee_rate')::numeric;

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
    v_buyer_rate,
    v_seller_rate
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
    'fee_tier', v_rates->>'fee_tier'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_create_deal: apply fee tier from agreed price
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
  v_existing public.deals%rowtype;
  v_rates jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  if p_inquiry_id is not null then
    select * into v_existing
    from public.deals
    where inquiry_id = p_inquiry_id
    order by
      case when status in ('completed', 'cancelled') then 1 else 0 end,
      updated_at desc
    limit 1;

    if v_existing.id is not null and v_existing.status not in ('completed', 'cancelled') then
      raise exception 'inquiry already has active deal %', v_existing.id;
    end if;
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
  v_rates := public.resolve_deal_fee_rates(p_agreed_price_ex_tax);

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
    (v_rates->>'buyer_fee_rate')::numeric,
    (v_rates->>'seller_fee_rate')::numeric
  )
  returning * into v;

  if v_listing.status <> 'negotiating' then
    update public.listings
    set status = 'negotiating', updated_at = now()
    where id = p_listing_id;

    perform public.write_status_audit_log(
      'listing_negotiating',
      'listings',
      p_listing_id,
      v_listing_before,
      'negotiating',
      auth.uid()
    );
  end if;

  perform public.write_status_audit_log(
    'deal_created',
    'deals',
    v.id,
    null,
    v.status::text,
    auth.uid()
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_deal_billing: tier-aware platform fee
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
  v_fee_ex int;
  v_fee_tax int;
  v_fee_inc int;
  v_fee_label text;
  v_buyer_doc uuid;
  v_seller_doc uuid;
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
  v_fee_ex := round(v_price * v_seller_rate)::int;
  v_fee_tax := public.calc_consumption_tax(v_fee_ex);
  v_fee_inc := v_fee_ex + v_fee_tax;

  if v_fee_ex > 0 then
    v_fee_label := 'MotoHub利用手数料（5%・税抜）';
  else
    v_fee_label := 'MotoHub利用手数料（30,000円以下のため対象外）';
  end if;

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
  on conflict (deal_id, party) do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_buyer_doc;

  insert into public.invoices (
    deal_id, user_id, party, document_kind, status,
    total_ex_tax, total_tax, total_inc_tax
  )
  values (
    p_deal_id,
    v_deal.seller_id,
    'seller',
    'platform_fee',
    'draft',
    v_fee_ex,
    v_fee_tax,
    v_fee_inc
  )
  on conflict (deal_id, party) do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_seller_doc;

  select id into v_buyer_doc from public.invoices where deal_id = p_deal_id and party = 'buyer';
  select id into v_seller_doc from public.invoices where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_doc, v_seller_doc);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_buyer_doc, 'vehicle_price', '車両代（税抜）', v_price, 0, v_price, 1),
    (v_buyer_doc, 'consumption_tax', '消費税（10%）', v_vehicle_tax, 0, v_vehicle_tax, 2);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_seller_doc, 'seller_fee', v_fee_label, v_fee_ex, v_fee_tax, v_fee_inc, 1);

  delete from public.payouts where deal_id = p_deal_id;

  return jsonb_build_object(
    'payment_instruction_id', v_buyer_doc,
    'platform_fee_invoice_id', v_seller_doc,
    'fee_tier', v_rates->>'fee_tier',
    'platform_fee_ex_tax', v_fee_ex
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Skip platform fee invoice issue when waived
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

  update public.invoices
  set status = 'issued',
      issued_at = coalesce(issued_at, now()),
      updated_at = now()
  where id = v_inv.id
    and status in ('draft', 'review_pending');

  perform public.notify_user_email(
    'invoice.issued',
    v_deal.seller_id,
    format('取引 %s のMotoHub手数料請求書を発行しました。取引詳細からPDFを確認できます。', p_deal_id),
    'MotoHub: 手数料請求書'
  );
end;
$$;

-- Sync fee rates on existing open deals from agreed price
update public.deals d
set
  buyer_fee_rate = (public.resolve_deal_fee_rates(d.agreed_price_ex_tax)->>'buyer_fee_rate')::numeric,
  seller_fee_rate = (public.resolve_deal_fee_rates(d.agreed_price_ex_tax)->>'seller_fee_rate')::numeric,
  updated_at = now()
where d.status not in ('cancelled');

do $$
declare
  r record;
begin
  for r in select id from public.deals where status not in ('cancelled') loop
    perform public.ensure_deal_billing(r.id);
  end loop;
end;
$$;
