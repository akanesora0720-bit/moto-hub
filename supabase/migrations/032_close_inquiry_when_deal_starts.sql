-- Close inquiry when deal starts (avoid duplicate "新着問い合わせ" badges)

update public.inquiries i
set status = 'closed'
from public.deals d
where d.inquiry_id = i.id
  and i.status = 'open'
  and d.status not in ('completed', 'cancelled');

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

  update public.inquiries
  set status = 'closed'
  where id = v_inquiry.id;

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
