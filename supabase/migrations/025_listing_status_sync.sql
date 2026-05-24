-- Listing status sync: keep listings.status aligned with deals

-- Derive correct listing status from deal rows (removed listings untouched)
create or replace function public.sync_listing_status_from_deals(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.listing_status;
  v_next public.listing_status;
begin
  select status into v_current from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing not found';
  end if;

  if v_current = 'removed' then
    return v_current;
  end if;

  if exists (
    select 1 from public.deals d
    where d.listing_id = p_listing_id and d.status = 'completed'
  ) then
    v_next := 'sold';
  elsif public.listing_has_active_deal(p_listing_id) then
    v_next := 'negotiating';
  else
    v_next := 'active';
  end if;

  if v_current is distinct from v_next then
    update public.listings
    set status = v_next, updated_at = now()
    where id = p_listing_id;

    perform public.write_status_audit_log(
      'listing_status_synced',
      'listings',
      p_listing_id,
      v_current::text,
      v_next::text
    );
  end if;

  return v_next;
end;
$$;

grant execute on function public.sync_listing_status_from_deals(uuid) to authenticated;

-- admin_advance_deal: sync listing after deal terminal transitions
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

  if p_status in ('completed', 'cancelled') then
    perform public.sync_listing_status_from_deals(v.listing_id);
  end if;

  perform public.notify_deal_status(p_deal_id, p_status);
  return v;
end;
$$;

-- One-time repair: fix listings whose status disagrees with deals
do $$
declare
  r record;
begin
  for r in select id from public.listings where status <> 'removed' loop
    perform public.sync_listing_status_from_deals(r.id);
  end loop;
end;
$$;

-- Admin listing removal: block when active deals exist
create or replace function public.admin_remove_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.listings%rowtype;
  v_before text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  if public.listing_has_active_deal(p_listing_id) then
    raise exception 'cannot remove listing with active deal';
  end if;

  select * into v from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'listing not found';
  end if;

  v_before := v.status::text;

  update public.listings
  set status = 'removed', updated_at = now()
  where id = p_listing_id
  returning * into v;

  perform public.write_status_audit_log(
    'listing_removed',
    'listings',
    p_listing_id,
    v_before,
    'removed'
  );

  return v;
end;
$$;

grant execute on function public.admin_remove_listing(uuid) to authenticated;
