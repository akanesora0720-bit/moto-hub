-- 073: Parts marketplace (lightweight module)
-- Scope (phase 1a):
-- - part listings / inquiries / messages / sales
-- - approved dealers only for listing & inquiry operations
-- - lightweight settlement: buyer payment instruction + seller fee invoice
-- - part fee rule: < 10,000 JPY ex-tax => 0%, >= 10,000 => seller 10%, buyer 0%

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'price_display_type') then
    create type public.price_display_type as enum ('fixed', 'ask');
  end if;
  if not exists (select 1 from pg_type where typname = 'part_listing_status') then
    create type public.part_listing_status as enum ('active', 'negotiating', 'sold', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'part_shipping_bearer') then
    create type public.part_shipping_bearer as enum ('buyer', 'seller', 'consult');
  end if;
  if not exists (select 1 from pg_type where typname = 'part_inquiry_status') then
    create type public.part_inquiry_status as enum ('open', 'closed');
  end if;
  if not exists (select 1 from pg_type where typname = 'part_sale_status') then
    create type public.part_sale_status as enum ('completed', 'cancelled');
  end if;
end
$$;

alter type public.invoice_item_type add value if not exists 'part_price';
alter type public.invoice_item_type add value if not exists 'part_seller_fee';

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
create table if not exists public.part_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  part_name text not null check (char_length(trim(part_name)) between 1 and 120),
  manufacturer text not null check (char_length(trim(manufacturer)) between 1 and 80),
  compatible_models text not null default '',
  category text not null check (char_length(trim(category)) between 1 and 60),
  part_condition text not null check (char_length(trim(part_condition)) between 1 and 40),
  description text not null default '',
  price_display_type public.price_display_type not null default 'fixed',
  price_ex_tax int,
  shipping_bearer public.part_shipping_bearer not null default 'buyer',
  status public.part_listing_status not null default 'active',
  sold_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_listings_price_check check (
    (price_display_type = 'fixed' and price_ex_tax is not null and price_ex_tax > 0)
    or (price_display_type = 'ask')
  )
);

create index if not exists part_listings_active_idx
  on public.part_listings (created_at desc)
  where status = 'active';

create index if not exists part_listings_search_idx
  on public.part_listings (manufacturer, category, status, created_at desc);

drop trigger if exists part_listings_set_updated_at on public.part_listings;
create trigger part_listings_set_updated_at
  before update on public.part_listings
  for each row execute function public.set_updated_at();

create table if not exists public.part_listing_images (
  id uuid primary key default gen_random_uuid(),
  part_listing_id uuid not null references public.part_listings (id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists part_listing_images_listing_idx
  on public.part_listing_images (part_listing_id, sort_order);

create table if not exists public.part_inquiries (
  id uuid primary key default gen_random_uuid(),
  part_listing_id uuid not null references public.part_listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  status public.part_inquiry_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create unique index if not exists part_inquiries_listing_buyer_unique
  on public.part_inquiries (part_listing_id, buyer_id);

create index if not exists part_inquiries_buyer_idx
  on public.part_inquiries (buyer_id, created_at desc);

create index if not exists part_inquiries_seller_idx
  on public.part_inquiries (seller_id, created_at desc);

drop trigger if exists part_inquiries_set_updated_at on public.part_inquiries;
create trigger part_inquiries_set_updated_at
  before update on public.part_inquiries
  for each row execute function public.set_updated_at();

create table if not exists public.part_inquiry_messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.part_inquiries (id) on delete cascade,
  sender_user_id uuid not null references public.profiles (id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists part_inquiry_messages_idx
  on public.part_inquiry_messages (inquiry_id, created_at asc);

create table if not exists public.part_sales (
  id uuid primary key default gen_random_uuid(),
  part_listing_id uuid not null references public.part_listings (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  inquiry_id uuid references public.part_inquiries (id) on delete set null,
  agreed_price_ex_tax int not null check (agreed_price_ex_tax > 0),
  seller_fee_rate numeric(5, 4) not null default 0.10,
  buyer_fee_rate numeric(5, 4) not null default 0,
  seller_fee_ex_tax int not null default 0,
  seller_fee_tax int not null default 0,
  seller_fee_inc_tax int not null default 0,
  shipping_bearer public.part_shipping_bearer not null default 'buyer',
  status public.part_sale_status not null default 'completed',
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists part_sales_listing_unique
  on public.part_sales (part_listing_id);

create index if not exists part_sales_seller_idx
  on public.part_sales (seller_id, created_at desc);

create index if not exists part_sales_buyer_idx
  on public.part_sales (buyer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Invoices extension for part sales
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists part_sale_id uuid references public.part_sales (id) on delete cascade;

drop index if exists invoices_deal_party_unique;
create unique index if not exists invoices_deal_party_unique
  on public.invoices (deal_id, party)
  where deal_id is not null;

create unique index if not exists invoices_part_sale_party_unique
  on public.invoices (part_sale_id, party)
  where part_sale_id is not null;

alter table public.invoices
  drop constraint if exists invoices_document_kind_check;

alter table public.invoices
  add constraint invoices_document_kind_check
  check (document_kind in (
    'legacy',
    'payment_instruction',
    'platform_fee',
    'motohub_inspection',
    'monthly_membership',
    'part_payment_instruction',
    'part_platform_fee'
  ));

alter table public.invoices
  drop constraint if exists invoices_source_check;

alter table public.invoices
  add constraint invoices_source_check
  check (
    (deal_id is not null and inspection_request_id is null and billing_month is null and part_sale_id is null)
    or (deal_id is null and inspection_request_id is not null and billing_month is null and part_sale_id is null)
    or (deal_id is null and inspection_request_id is null and billing_month is not null and part_sale_id is null)
    or (deal_id is null and inspection_request_id is null and billing_month is null and part_sale_id is not null)
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.resolve_part_fee_rates(p_price_ex_tax int)
returns jsonb
language sql
immutable
as $$
  select case
    when coalesce(p_price_ex_tax, 0) < 10000 then
      jsonb_build_object(
        'buyer_fee_rate', 0,
        'seller_fee_rate', 0,
        'fee_tier', 'waived_under_10000'
      )
    else
      jsonb_build_object(
        'buyer_fee_rate', 0,
        'seller_fee_rate', 0.10,
        'fee_tier', 'standard'
      )
  end;
$$;

create or replace function public.is_part_inquiry_participant(
  p_inquiry_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.part_inquiries i
    where i.id = p_inquiry_id
      and (i.buyer_id = p_user_id or i.seller_id = p_user_id)
  );
$$;

create or replace function public.issue_part_sale_invoices(p_part_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.part_sales;
  v_vehicle_tax int;
  v_vehicle_inc int;
  v_buyer_inv uuid;
  v_seller_inv uuid;
begin
  select * into v_sale from public.part_sales where id = p_part_sale_id;
  if v_sale.id is null then
    raise exception 'part sale not found';
  end if;

  v_vehicle_tax := public.calc_consumption_tax(v_sale.agreed_price_ex_tax);
  v_vehicle_inc := v_sale.agreed_price_ex_tax + v_vehicle_tax;

  insert into public.invoices (
    deal_id,
    inspection_request_id,
    billing_month,
    part_sale_id,
    user_id,
    party,
    document_kind,
    status,
    total_ex_tax,
    total_tax,
    total_inc_tax,
    issued_at
  )
  values (
    null,
    null,
    null,
    p_part_sale_id,
    v_sale.buyer_id,
    'buyer',
    'part_payment_instruction',
    'issued',
    v_sale.agreed_price_ex_tax,
    v_vehicle_tax,
    v_vehicle_inc,
    now()
  )
  on conflict (part_sale_id, party) where part_sale_id is not null do update set
    document_kind = excluded.document_kind,
    status = excluded.status,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    issued_at = excluded.issued_at,
    updated_at = now()
  returning id into v_buyer_inv;

  delete from public.invoice_items where invoice_id = v_buyer_inv;
  insert into public.invoice_items (
    invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order
  )
  values (
    v_buyer_inv, 'part_price', 'パーツ代金', v_sale.agreed_price_ex_tax, v_vehicle_tax, v_vehicle_inc, 0
  );

  if v_sale.seller_fee_ex_tax > 0 then
    insert into public.invoices (
      deal_id,
      inspection_request_id,
      billing_month,
      part_sale_id,
      user_id,
      party,
      document_kind,
      status,
      total_ex_tax,
      total_tax,
      total_inc_tax,
      issued_at
    )
    values (
      null,
      null,
      null,
      p_part_sale_id,
      v_sale.seller_id,
      'seller',
      'part_platform_fee',
      'issued',
      v_sale.seller_fee_ex_tax,
      v_sale.seller_fee_tax,
      v_sale.seller_fee_inc_tax,
      now()
    )
    on conflict (part_sale_id, party) where part_sale_id is not null do update set
      document_kind = excluded.document_kind,
      status = excluded.status,
      total_ex_tax = excluded.total_ex_tax,
      total_tax = excluded.total_tax,
      total_inc_tax = excluded.total_inc_tax,
      issued_at = excluded.issued_at,
      updated_at = now()
    returning id into v_seller_inv;

    delete from public.invoice_items where invoice_id = v_seller_inv;
    insert into public.invoice_items (
      invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order
    )
    values (
      v_seller_inv, 'part_seller_fee', 'MotoHubパーツ売買手数料（10%・税抜）',
      v_sale.seller_fee_ex_tax, v_sale.seller_fee_tax, v_sale.seller_fee_inc_tax, 0
    );
  else
    v_seller_inv := null;
  end if;

  return jsonb_build_object(
    'buyer_invoice_id', v_buyer_inv,
    'seller_invoice_id', v_seller_inv
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_part_inquiry(
  p_part_listing_id uuid,
  p_initial_message text
)
returns public.part_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_listing public.part_listings;
  v_inquiry public.part_inquiries;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if not public.dealer_has_full_access(v_caller) then
    raise exception 'approved dealer account required';
  end if;
  if char_length(trim(coalesce(p_initial_message, ''))) < 5 then
    raise exception 'message too short';
  end if;

  select * into v_listing
  from public.part_listings
  where id = p_part_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'part listing not found';
  end if;
  if v_listing.seller_id = v_caller then
    raise exception 'cannot inquire your own part';
  end if;
  if v_listing.status not in ('active', 'negotiating') then
    raise exception 'part listing is not available';
  end if;

  insert into public.part_inquiries (part_listing_id, buyer_id, seller_id, status)
  values (p_part_listing_id, v_caller, v_listing.seller_id, 'open')
  on conflict (part_listing_id, buyer_id) do update set
    status = 'open',
    closed_at = null,
    updated_at = now()
  returning * into v_inquiry;

  insert into public.part_inquiry_messages (inquiry_id, sender_user_id, message)
  values (v_inquiry.id, v_caller, trim(p_initial_message));

  update public.part_listings
  set status = case when status = 'active' then 'negotiating' else status end,
      updated_at = now()
  where id = p_part_listing_id;

  return v_inquiry;
end;
$$;

create or replace function public.post_part_inquiry_message(
  p_inquiry_id uuid,
  p_message text
)
returns public.part_inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_inquiry public.part_inquiries;
  v_msg public.part_inquiry_messages;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 1 then
    raise exception 'message is required';
  end if;

  select * into v_inquiry from public.part_inquiries where id = p_inquiry_id;
  if v_inquiry.id is null then
    raise exception 'inquiry not found';
  end if;
  if v_inquiry.status <> 'open' then
    raise exception 'inquiry is closed';
  end if;
  if not public.is_admin()
     and v_caller <> v_inquiry.buyer_id
     and v_caller <> v_inquiry.seller_id then
    raise exception 'party only';
  end if;

  insert into public.part_inquiry_messages (inquiry_id, sender_user_id, message)
  values (p_inquiry_id, v_caller, trim(p_message))
  returning * into v_msg;

  update public.part_inquiries
  set updated_at = now()
  where id = p_inquiry_id;

  return v_msg;
end;
$$;

create or replace function public.complete_part_sale(
  p_part_listing_id uuid,
  p_buyer_id uuid,
  p_agreed_price_ex_tax int,
  p_shipping_bearer public.part_shipping_bearer default null
)
returns public.part_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_listing public.part_listings;
  v_sale public.part_sales;
  v_rates jsonb;
  v_seller_fee_rate numeric;
  v_seller_fee_ex int;
  v_seller_fee_tax int;
  v_seller_fee_inc int;
  v_shipping public.part_shipping_bearer;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if p_agreed_price_ex_tax is null or p_agreed_price_ex_tax <= 0 then
    raise exception 'agreed price must be positive';
  end if;

  select * into v_listing
  from public.part_listings
  where id = p_part_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'part listing not found';
  end if;
  if not public.is_admin() and v_listing.seller_id <> v_caller then
    raise exception 'seller or admin only';
  end if;
  if v_listing.status in ('sold', 'archived') then
    raise exception 'part listing is already closed';
  end if;

  if not exists (
    select 1
    from public.part_inquiries i
    where i.part_listing_id = p_part_listing_id
      and i.buyer_id = p_buyer_id
      and i.seller_id = v_listing.seller_id
  ) then
    raise exception 'buyer has no inquiry for this part';
  end if;

  if not public.is_admin() and not public.dealer_has_full_access(p_buyer_id) then
    raise exception 'buyer is not approved dealer';
  end if;

  v_rates := public.resolve_part_fee_rates(p_agreed_price_ex_tax);
  v_seller_fee_rate := (v_rates->>'seller_fee_rate')::numeric;
  v_seller_fee_ex := round(p_agreed_price_ex_tax * v_seller_fee_rate)::int;
  v_seller_fee_tax := public.calc_consumption_tax(v_seller_fee_ex);
  v_seller_fee_inc := v_seller_fee_ex + v_seller_fee_tax;
  v_shipping := coalesce(p_shipping_bearer, v_listing.shipping_bearer);

  insert into public.part_sales (
    part_listing_id,
    buyer_id,
    seller_id,
    inquiry_id,
    agreed_price_ex_tax,
    seller_fee_rate,
    buyer_fee_rate,
    seller_fee_ex_tax,
    seller_fee_tax,
    seller_fee_inc_tax,
    shipping_bearer,
    status,
    completed_at
  )
  values (
    p_part_listing_id,
    p_buyer_id,
    v_listing.seller_id,
    (
      select id from public.part_inquiries
      where part_listing_id = p_part_listing_id
        and buyer_id = p_buyer_id
      order by created_at desc
      limit 1
    ),
    p_agreed_price_ex_tax,
    v_seller_fee_rate,
    0,
    v_seller_fee_ex,
    v_seller_fee_tax,
    v_seller_fee_inc,
    v_shipping,
    'completed',
    now()
  )
  returning * into v_sale;

  update public.part_listings
  set status = 'sold',
      sold_at = coalesce(sold_at, now()),
      updated_at = now()
  where id = p_part_listing_id;

  update public.part_inquiries
  set status = 'closed',
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
  where part_listing_id = p_part_listing_id
    and status = 'open';

  perform public.issue_part_sale_invoices(v_sale.id);
  return v_sale;
end;
$$;

grant execute on function public.resolve_part_fee_rates(int) to authenticated;
grant execute on function public.is_part_inquiry_participant(uuid, uuid) to authenticated;
grant execute on function public.issue_part_sale_invoices(uuid) to authenticated;
grant execute on function public.create_part_inquiry(uuid, text) to authenticated;
grant execute on function public.post_part_inquiry_message(uuid, text) to authenticated;
grant execute on function public.complete_part_sale(uuid, uuid, int, public.part_shipping_bearer) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.part_listings enable row level security;
alter table public.part_listing_images enable row level security;
alter table public.part_inquiries enable row level security;
alter table public.part_inquiry_messages enable row level security;
alter table public.part_sales enable row level security;

create policy part_listings_select on public.part_listings
  for select to authenticated
  using (
    status = 'active'
    or seller_id = auth.uid()
    or public.is_admin()
  );

create policy part_listings_insert on public.part_listings
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.dealer_has_full_access(auth.uid())
  );

create policy part_listings_update on public.part_listings
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

create policy part_listings_delete on public.part_listings
  for delete to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy part_listing_images_select on public.part_listing_images
  for select to authenticated
  using (
    exists (
      select 1
      from public.part_listings l
      where l.id = part_listing_id
        and (l.status = 'active' or l.seller_id = auth.uid() or public.is_admin())
    )
  );

create policy part_listing_images_insert on public.part_listing_images
  for insert to authenticated
  with check (
    exists (
      select 1 from public.part_listings l
      where l.id = part_listing_id
        and l.seller_id = auth.uid()
        and public.dealer_has_full_access(auth.uid())
    )
  );

create policy part_listing_images_delete on public.part_listing_images
  for delete to authenticated
  using (
    exists (
      select 1 from public.part_listings l
      where l.id = part_listing_id
        and (l.seller_id = auth.uid() or public.is_admin())
    )
  );

create policy part_inquiries_select on public.part_inquiries
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.is_admin()
  );

create policy part_inquiries_insert on public.part_inquiries
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and public.dealer_has_full_access(auth.uid())
    and buyer_id <> seller_id
    and exists (
      select 1
      from public.part_listings l
      where l.id = part_listing_id
        and l.seller_id = seller_id
        and l.status in ('active', 'negotiating')
    )
  );

create policy part_inquiries_update on public.part_inquiries
  for update to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin())
  with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy part_inquiry_messages_select on public.part_inquiry_messages
  for select to authenticated
  using (
    public.is_part_inquiry_participant(inquiry_id)
    or public.is_admin()
  );

create policy part_inquiry_messages_insert on public.part_inquiry_messages
  for insert to authenticated
  with check (
    sender_user_id = auth.uid()
    and (
      public.is_part_inquiry_participant(inquiry_id)
      or public.is_admin()
    )
  );

create policy part_sales_select on public.part_sales
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.is_admin()
  );

create policy part_sales_insert on public.part_sales
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Storage bucket: part-images
-- path: {seller_id}/{part_listing_id}/{image_id}.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('part-images', 'part-images', false)
on conflict (id) do nothing;

drop policy if exists part_images_storage_select on storage.objects;
create policy part_images_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'part-images'
    and exists (
      select 1
      from public.part_listings l
      where l.id::text = (storage.foldername(name))[2]
        and (
          l.status = 'active'
          or l.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists part_images_storage_insert on storage.objects;
create policy part_images_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'part-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1
      from public.part_listings l
      where l.id::text = (storage.foldername(name))[2]
        and l.seller_id = auth.uid()
        and public.dealer_has_full_access(auth.uid())
    )
  );

drop policy if exists part_images_storage_delete on storage.objects;
create policy part_images_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'part-images'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );
