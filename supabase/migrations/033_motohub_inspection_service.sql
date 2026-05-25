-- MotoHub査定サービス（現車確認 + 出品代行）
-- 旧 inspection_status トグルによる「査定済」は廃止

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'inspection_request_status') then
    create type public.inspection_request_status as enum (
      'requested',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'inspection_badge_type') then
    create type public.inspection_badge_type as enum ('none', 'motohub_inspected');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- listings: MotoHub査定済バッジ（スタッフ登録のみ）
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists inspected_by_staff_id uuid references public.profiles (id) on delete set null,
  add column if not exists inspection_completed_at timestamptz,
  add column if not exists inspection_badge_type public.inspection_badge_type not null default 'none';

update public.listings
set inspection_badge_type = 'none',
    inspection_status = false
where inspection_status = true or inspection_badge_type is null;

comment on column public.listings.inspection_badge_type is 'motohub_inspected = MotoHubスタッフが現車確認・出品代行';

-- ---------------------------------------------------------------------------
-- inspection_requests（bike_id → listing_id）
-- ---------------------------------------------------------------------------
create table if not exists public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  assigned_staff_id uuid references public.profiles (id) on delete set null,
  status public.inspection_request_status not null default 'requested',
  vehicle_name text not null,
  storage_location text not null,
  contact_name text not null,
  preferred_at timestamptz,
  scheduled_at timestamptz,
  completed_at timestamptz,
  fee_ex_tax int not null default 3000 check (fee_ex_tax >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inspection_requests_dealer_idx
  on public.inspection_requests (dealer_id, created_at desc);

create index if not exists inspection_requests_status_idx
  on public.inspection_requests (status, created_at desc);

drop trigger if exists inspection_requests_set_updated_at on public.inspection_requests;
create trigger inspection_requests_set_updated_at
  before update on public.inspection_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Staff-only helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_motohub_inspection_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.member_type = 'staff'
      and p.is_active = true
  );
$$;

create or replace function public.guard_listing_inspection_badge()
returns trigger
language plpgsql
as $$
begin
  if new.inspection_badge_type = 'motohub_inspected' then
    if tg_op = 'INSERT' and new.inspected_by_staff_id is null then
      raise exception 'motohub_inspected requires inspected_by_staff_id';
    end if;
    if not public.is_motohub_inspection_staff()
       and current_setting('role', true) <> 'service_role' then
      raise exception 'only MotoHub staff can set motohub_inspected badge';
    end if;
  elsif new.inspection_badge_type = 'none' then
    if old.inspection_badge_type = 'motohub_inspected'
       and not public.is_motohub_inspection_staff()
       and not public.is_admin() then
      raise exception 'cannot remove motohub_inspected badge';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists listings_guard_inspection_badge on public.listings;
create trigger listings_guard_inspection_badge
  before insert or update of inspection_badge_type, inspected_by_staff_id
  on public.listings
  for each row execute function public.guard_listing_inspection_badge();

-- ---------------------------------------------------------------------------
-- RLS inspection_requests
-- ---------------------------------------------------------------------------
alter table public.inspection_requests enable row level security;

drop policy if exists inspection_requests_dealer_select on public.inspection_requests;
create policy inspection_requests_dealer_select on public.inspection_requests
  for select to authenticated
  using (dealer_id = auth.uid() or public.is_admin() or public.is_motohub_inspection_staff());

drop policy if exists inspection_requests_dealer_insert on public.inspection_requests;
create policy inspection_requests_dealer_insert on public.inspection_requests
  for insert to authenticated
  with check (
    dealer_id = auth.uid()
    and requested_by = auth.uid()
    and public.is_dealer()
  );

drop policy if exists inspection_requests_staff_update on public.inspection_requests;
create policy inspection_requests_staff_update on public.inspection_requests
  for update to authenticated
  using (public.is_motohub_inspection_staff() or public.is_admin())
  with check (public.is_motohub_inspection_staff() or public.is_admin());

-- Staff may insert listing on behalf of dealer during active inspection
drop policy if exists listings_insert_staff_inspection on public.listings;
create policy listings_insert_staff_inspection on public.listings
  for insert to authenticated
  with check (
    public.is_motohub_inspection_staff()
    and exists (
      select 1 from public.inspection_requests r
      where r.dealer_id = seller_id
        and r.assigned_staff_id = auth.uid()
        and r.status in ('scheduled', 'in_progress')
    )
  );

-- ---------------------------------------------------------------------------
-- Dealer: create inspection request
-- ---------------------------------------------------------------------------
create or replace function public.create_inspection_request(
  p_vehicle_name text,
  p_storage_location text,
  p_contact_name text,
  p_preferred_at timestamptz default null,
  p_notes text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not public.is_dealer() then raise exception 'dealer only'; end if;
  if char_length(trim(coalesce(p_vehicle_name, ''))) < 1 then
    raise exception 'vehicle_name required';
  end if;
  if char_length(trim(coalesce(p_storage_location, ''))) < 1 then
    raise exception 'storage_location required';
  end if;
  if char_length(trim(coalesce(p_contact_name, ''))) < 1 then
    raise exception 'contact_name required';
  end if;

  insert into public.inspection_requests (
    dealer_id,
    requested_by,
    vehicle_name,
    storage_location,
    contact_name,
    preferred_at,
    notes,
    status,
    fee_ex_tax
  )
  values (
    auth.uid(),
    auth.uid(),
    trim(p_vehicle_name),
    trim(p_storage_location),
    trim(p_contact_name),
    p_preferred_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    'requested',
    3000
  )
  returning * into v;

  perform public.notify_enqueue(
    'inspection.requested',
    jsonb_build_object(
      'body',
      format('[%s] %s', v.storage_location, v.vehicle_name)
    ),
    'inspection_requests',
    v.id
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: assign / schedule / status
-- ---------------------------------------------------------------------------
create or replace function public.staff_update_inspection_request(
  p_request_id uuid,
  p_status public.inspection_request_status default null,
  p_assigned_staff_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_notes text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;

  update public.inspection_requests
  set
    status = coalesce(p_status, status),
    assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id, auth.uid()),
    scheduled_at = coalesce(p_scheduled_at, scheduled_at),
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    updated_at = now()
  where id = p_request_id
  returning * into v;

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: complete with listing (出品代行完了 + バッジ付与)
-- ---------------------------------------------------------------------------
create or replace function public.complete_motohub_inspection(
  p_request_id uuid,
  p_listing_id uuid
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_listing public.listings;
  v_staff uuid := auth.uid();
begin
  if not public.is_motohub_inspection_staff() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.status = 'cancelled' then raise exception 'request cancelled'; end if;
  if v.status = 'completed' then raise exception 'already completed'; end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then raise exception 'listing not found'; end if;
  if v_listing.seller_id <> v.dealer_id then
    raise exception 'listing seller must match request dealer';
  end if;

  update public.listings
  set
    inspection_badge_type = 'motohub_inspected',
    inspected_by_staff_id = v_staff,
    inspection_completed_at = now(),
    inspection_status = false,
    updated_at = now()
  where id = p_listing_id;

  update public.inspection_requests
  set
    listing_id = p_listing_id,
    status = 'completed',
    completed_at = now(),
    assigned_staff_id = coalesce(assigned_staff_id, v_staff),
    updated_at = now()
  where id = p_request_id
  returning * into v;

  perform public.write_status_audit_log(
    'motohub_inspection_completed',
    'listings',
    p_listing_id,
    'none',
    'motohub_inspected',
    v_staff
  );

  perform public.notify_user_email(
    'inspection.completed',
    v.dealer_id,
    format('MotoHub査定が完了し、出品しました（%s）。取引画面・検索で「MotoHub査定済」として表示されます。', p_listing_id),
    'MotoHub: 査定・出品代行完了'
  );

  return v;
end;
$$;

-- Dashboard stats: MotoHub査定済台数
create or replace function public.get_dealer_dashboard_stats(p_dealer_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_dealer_id, auth.uid());
  v_listings int;
  v_completed int;
  v_inspected int;
  v_avg_price numeric;
  v_avg_days numeric;
  v_monthly_sales bigint;
begin
  if v_id is null then raise exception 'login required'; end if;
  if v_id <> auth.uid() and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select count(*) into v_listings
  from public.listings where seller_id = v_id and status <> 'removed';

  select count(*) into v_completed
  from public.deals where seller_id = v_id and status = 'completed';

  select count(*) into v_inspected
  from public.listings
  where seller_id = v_id
    and status <> 'removed'
    and inspection_badge_type = 'motohub_inspected';

  select coalesce(avg(agreed_price_ex_tax), 0) into v_avg_price
  from public.deals where seller_id = v_id and status = 'completed';

  select coalesce(avg(
    extract(epoch from (coalesce(d.completed_at, d.updated_at) - l.created_at)) / 86400.0
  ), 0) into v_avg_days
  from public.deals d
  join public.listings l on l.id = d.listing_id
  where d.seller_id = v_id and d.status = 'completed';

  select coalesce(sum(agreed_price_ex_tax), 0) into v_monthly_sales
  from public.deals
  where seller_id = v_id and status = 'completed'
    and completed_at >= date_trunc('month', now());

  return jsonb_build_object(
    'listing_count', v_listings,
    'completed_count', v_completed,
    'completion_rate', case when v_listings > 0 then round((v_completed::numeric / v_listings) * 100, 1) else 0 end,
    'avg_completed_price', round(v_avg_price),
    'inspected_count', v_inspected,
    'avg_listing_days', round(v_avg_days, 1),
    'monthly_sales_ex_tax', v_monthly_sales
  );
end;
$$;

-- Staff: listing images + storage during inspection (dealer folder path)
drop policy if exists listing_images_insert_staff_inspection on public.listing_images;
create policy listing_images_insert_staff_inspection on public.listing_images
  for insert to authenticated
  with check (
    public.is_motohub_inspection_staff()
    and exists (
      select 1
      from public.listings l
      join public.inspection_requests r on r.dealer_id = l.seller_id
      where l.id = listing_id
        and r.assigned_staff_id = auth.uid()
        and r.status in ('scheduled', 'in_progress')
    )
  );

drop policy if exists listing_images_storage_insert_staff on storage.objects;
create policy listing_images_storage_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and public.is_motohub_inspection_staff()
    and exists (
      select 1 from public.inspection_requests r
      where r.dealer_id::text = (storage.foldername(name))[1]
        and r.assigned_staff_id = auth.uid()
        and r.status in ('scheduled', 'in_progress')
    )
  );

grant execute on function public.is_motohub_inspection_staff() to authenticated;
grant execute on function public.create_inspection_request(text, text, text, timestamptz, text) to authenticated;
grant execute on function public.staff_update_inspection_request(uuid, public.inspection_request_status, uuid, timestamptz, text) to authenticated;
grant execute on function public.complete_motohub_inspection(uuid, uuid) to authenticated;
