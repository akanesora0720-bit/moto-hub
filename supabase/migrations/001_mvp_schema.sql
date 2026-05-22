-- MotoHub MVP schema
-- Run in Supabase SQL Editor or: supabase db push

-- ---------------------------------------------------------------------------
-- Extensions & helpers
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles (dealers)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  store_name text,
  contact_name text,
  antique_dealer_number text,
  invoice_number text,
  prefecture text,
  phone text,
  credit_rank text not null default 'C'
    check (credit_rank in ('S', 'A', 'B', 'C', 'D')),
  is_active boolean not null default true,
  is_admin boolean not null default false,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_active_idx on public.profiles (is_active) where is_active = true;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, lower(new.email));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type public.listing_status as enum ('active', 'sold', 'removed');
  end if;
end
$$;

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  maker text not null,
  model text not null,
  year int not null check (year >= 1950 and year <= 2100),
  mileage int not null check (mileage >= 0),
  frame_number text not null,
  price_ex_tax int not null check (price_ex_tax > 0),
  condition_comment text not null default '',
  status public.listing_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_active_idx
  on public.listings (created_at desc)
  where status = 'active';

drop trigger if exists listings_set_updated_at on public.listings;
create trigger listings_set_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Listing images
-- ---------------------------------------------------------------------------
create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listing_images_listing_idx
  on public.listing_images (listing_id, sort_order);

-- ---------------------------------------------------------------------------
-- Inquiries
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'inquiry_status') then
    create type public.inquiry_status as enum ('open', 'closed');
  end if;
end
$$;

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  status public.inquiry_status not null default 'open',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Deals (成約管理)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_status') then
    create type public.deal_status as enum ('pending', 'completed', 'cancelled');
  end if;
end
$$;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  agreed_price_ex_tax int not null check (agreed_price_ex_tax > 0),
  status public.deal_status not null default 'pending',
  seller_fee_rate numeric(5, 4) not null default 0.05,
  buyer_fee_rate numeric(5, 4) not null default 0.05,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid() and p.is_active = true),
    false
  );
$$;

create or replace function public.my_profile_complete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.profile_completed from public.profiles p where p.id = auth.uid() and p.is_active = true),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_images enable row level security;
alter table public.inquiries enable row level security;
alter table public.deals enable row level security;

-- profiles
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated on public.profiles
  for select to authenticated
  using (is_active = true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- listings
drop policy if exists listings_select_active on public.listings;
create policy listings_select_active on public.listings
  for select to authenticated
  using (
    status = 'active'
    or seller_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.my_profile_complete()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
  );

drop policy if exists listings_update_own on public.listings;
create policy listings_update_own on public.listings
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

-- listing_images
drop policy if exists listing_images_select on public.listing_images;
create policy listing_images_select on public.listing_images
  for select to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id
        and (l.status = 'active' or l.seller_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists listing_images_insert_own on public.listing_images;
create policy listing_images_insert_own on public.listing_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid()
    )
  );

drop policy if exists listing_images_delete_own on public.listing_images;
create policy listing_images_delete_own on public.listing_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_id and (l.seller_id = auth.uid() or public.is_admin())
    )
  );

-- inquiries
drop policy if exists inquiries_select_parties on public.inquiries;
create policy inquiries_select_parties on public.inquiries
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or exists (
      select 1 from public.listings l
      where l.id = listing_id and l.seller_id = auth.uid()
    )
    or public.is_admin()
  );

drop policy if exists inquiries_insert_buyer on public.inquiries;
create policy inquiries_insert_buyer on public.inquiries
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and public.my_profile_complete()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.status = 'active'
        and l.seller_id <> auth.uid()
    )
  );

-- deals
drop policy if exists deals_select_parties on public.deals;
create policy deals_select_parties on public.deals
  for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

drop policy if exists deals_admin_write on public.deals;
create policy deals_admin_write on public.deals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket (create in Dashboard if migration cannot)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', false)
on conflict (id) do nothing;

drop policy if exists listing_images_storage_select on storage.objects;
create policy listing_images_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'listing-images');

drop policy if exists listing_images_storage_insert on storage.objects;
create policy listing_images_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists listing_images_storage_delete on storage.objects;
create policy listing_images_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
