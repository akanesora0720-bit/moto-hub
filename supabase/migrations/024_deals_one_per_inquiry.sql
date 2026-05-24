-- One inquiry → at most one deal row (prevents admin + auto flow duplicates)

-- Detach older/duplicate deal rows from the same inquiry (keep the active/newest one)
with ranked as (
  select
    id,
    row_number() over (
      partition by inquiry_id
      order by
        case when status in ('completed', 'cancelled') then 1 else 0 end,
        updated_at desc,
        created_at desc
    ) as rn
  from public.deals
  where inquiry_id is not null
)
update public.deals d
set inquiry_id = null
from ranked r
where d.id = r.id
  and r.rn > 1;

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

-- Apply only after removing duplicate inquiry_id rows (see docs note in admin UI)
create unique index if not exists deals_one_per_inquiry_idx
  on public.deals (inquiry_id)
  where inquiry_id is not null;
