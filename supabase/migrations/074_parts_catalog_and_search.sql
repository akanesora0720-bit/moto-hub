-- 074: Parts catalog masters (lean) + search fields + learning models

-- ---------------------------------------------------------------------------
-- Catalog masters (small, admin-seeded only at launch)
-- ---------------------------------------------------------------------------
create table if not exists public.part_manufacturers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[A-Z0-9_]+$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.part_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  label text not null check (char_length(trim(label)) between 1 and 60),
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Learning model: grows from dealer input (suggest), not pre-loaded thousands
create table if not exists public.part_models (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.part_manufacturers (id) on delete cascade,
  normalized_name text not null check (char_length(normalized_name) between 1 and 80),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  is_universal boolean not null default false,
  usage_count int not null default 1 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists part_models_manufacturer_normalized_unique
  on public.part_models (manufacturer_id, normalized_name)
  where not is_universal;

create unique index if not exists part_models_manufacturer_universal_unique
  on public.part_models (manufacturer_id)
  where is_universal;

create index if not exists part_models_suggest_idx
  on public.part_models (manufacturer_id, normalized_name text_pattern_ops);

drop trigger if exists part_models_set_updated_at on public.part_models;
create trigger part_models_set_updated_at
  before update on public.part_models
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- part_listings extensions
-- ---------------------------------------------------------------------------
alter table public.part_listings
  add column if not exists manufacturer_id uuid references public.part_manufacturers (id),
  add column if not exists category_id uuid references public.part_categories (id),
  add column if not exists part_model_id uuid references public.part_models (id),
  add column if not exists is_universal_model boolean not null default false,
  add column if not exists model_display_name text not null default '',
  add column if not exists manufacturer_part_number text not null default '',
  add column if not exists manufacturer_part_number_normalized text not null default '';

create index if not exists part_listings_catalog_search_idx
  on public.part_listings (
    manufacturer_id,
    category_id,
    part_model_id,
    status,
    price_display_type,
    created_at desc
  )
  where status in ('active', 'negotiating');

create index if not exists part_listings_mpn_search_idx
  on public.part_listings (manufacturer_part_number_normalized)
  where manufacturer_part_number_normalized <> '';

create index if not exists part_listings_price_search_idx
  on public.part_listings (price_ex_tax)
  where price_display_type = 'fixed' and status = 'active';

-- ---------------------------------------------------------------------------
-- Seed manufacturers
-- ---------------------------------------------------------------------------
insert into public.part_manufacturers (slug, label, sort_order) values
  ('HONDA', 'HONDA', 10),
  ('YAMAHA', 'YAMAHA', 20),
  ('SUZUKI', 'SUZUKI', 30),
  ('KAWASAKI', 'KAWASAKI', 40),
  ('HARLEY_DAVIDSON', 'HARLEY-DAVIDSON', 50),
  ('BMW', 'BMW', 60),
  ('DUCATI', 'DUCATI', 70),
  ('TRIUMPH', 'TRIUMPH', 80),
  ('KTM', 'KTM', 90),
  ('APRILIA', 'APRILIA', 100),
  ('MOTO_GUZZI', 'MOTO GUZZI', 110),
  ('INDIAN', 'INDIAN', 120),
  ('OTHER', 'その他', 999)
on conflict (slug) do update
set label = excluded.label, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Seed categories
-- ---------------------------------------------------------------------------
insert into public.part_categories (slug, label, sort_order) values
  ('engine', 'エンジン', 10),
  ('exterior', '外装', 20),
  ('chassis', '足回り', 30),
  ('electrical', '電装系', 40),
  ('intake_exhaust', '吸排気', 50),
  ('brake', 'ブレーキ', 60),
  ('wheel', 'ホイール', 70),
  ('suspension', 'サスペンション', 80),
  ('handlebar', 'ハンドル周り', 90),
  ('lighting', '灯火類', 100),
  ('meter', 'メーター', 110),
  ('seat', 'シート', 120),
  ('oem', '純正部品', 130),
  ('aftermarket', '社外パーツ', 140),
  ('consumable', '消耗品', 150),
  ('other', 'その他', 999)
on conflict (slug) do update
set label = excluded.label, sort_order = excluded.sort_order, is_active = true;

-- ---------------------------------------------------------------------------
-- Normalize helper (ASCII alnum; app also NFKC — DB fallback)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_part_catalog_text(p_raw text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := upper(regexp_replace(trim(coalesce(p_raw, '')), '[\s\u3000]+', '', 'g'));
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Learning model upsert
-- ---------------------------------------------------------------------------
create or replace function public.upsert_part_model(
  p_manufacturer_id uuid,
  p_model_input text,
  p_is_universal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_display text;
  v_id uuid;
begin
  if p_manufacturer_id is null then
    raise exception 'manufacturer required';
  end if;

  if coalesce(p_is_universal, false) then
    insert into public.part_models (
      manufacturer_id, normalized_name, display_name, is_universal, usage_count
    ) values (
      p_manufacturer_id, 'UNIVERSAL', '汎用', true, 1
    )
    on conflict (manufacturer_id) where is_universal
    do update set
      usage_count = public.part_models.usage_count + 1,
      updated_at = now()
    returning id into v_id;
    return v_id;
  end if;

  v_display := trim(coalesce(p_model_input, ''));
  if v_display = '' then
    raise exception 'model required';
  end if;

  v_normalized := public.normalize_part_catalog_text(v_display);
  if v_normalized = '' then
    raise exception 'model required';
  end if;

  insert into public.part_models (
    manufacturer_id, normalized_name, display_name, is_universal, usage_count
  ) values (
    p_manufacturer_id, v_normalized, v_display, false, 1
  )
  on conflict (manufacturer_id, normalized_name) where not is_universal
  do update set
    usage_count = public.part_models.usage_count + 1,
    updated_at = now(),
    display_name = case
      when length(excluded.display_name) > length(public.part_models.display_name)
      then excluded.display_name
      else public.part_models.display_name
    end
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.upsert_part_model(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Sync legacy text columns + catalog FKs on write
-- ---------------------------------------------------------------------------
create or replace function public.sync_part_listing_catalog_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mfg_label text;
  v_cat_label text;
begin
  if new.manufacturer_id is not null then
    select label into v_mfg_label from public.part_manufacturers where id = new.manufacturer_id;
    if v_mfg_label is null then
      raise exception 'invalid manufacturer';
    end if;
    new.manufacturer := v_mfg_label;
  end if;

  if new.category_id is not null then
    select label into v_cat_label from public.part_categories where id = new.category_id;
    if v_cat_label is null then
      raise exception 'invalid category';
    end if;
    new.category := v_cat_label;
  end if;

  new.manufacturer_part_number_normalized :=
    public.normalize_part_catalog_text(new.manufacturer_part_number);

  if new.is_universal_model then
    new.part_model_id := public.upsert_part_model(new.manufacturer_id, null, true);
    new.model_display_name := '汎用';
    new.compatible_models := '汎用';
  elsif new.manufacturer_id is not null and coalesce(trim(new.model_display_name), '') <> '' then
    new.part_model_id := public.upsert_part_model(
      new.manufacturer_id,
      new.model_display_name,
      false
    );
    new.compatible_models := trim(new.model_display_name);
  end if;

  return new;
end;
$$;

drop trigger if exists part_listings_sync_catalog on public.part_listings;
create trigger part_listings_sync_catalog
  before insert or update of
    manufacturer_id,
    category_id,
    model_display_name,
    is_universal_model,
    manufacturer_part_number
  on public.part_listings
  for each row execute function public.sync_part_listing_catalog_fields();

-- ---------------------------------------------------------------------------
-- Backfill existing rows (best-effort)
-- ---------------------------------------------------------------------------
update public.part_listings pl
set manufacturer_id = pm.id
from public.part_manufacturers pm
where pl.manufacturer_id is null
  and upper(regexp_replace(trim(pl.manufacturer), '[\s\u3000]+', '', 'g')) = pm.slug;

update public.part_listings pl
set manufacturer_id = pm.id
from public.part_manufacturers pm
where pl.manufacturer_id is null
  and upper(trim(pl.manufacturer)) = upper(trim(pm.label));

update public.part_listings pl
set manufacturer_id = (select id from public.part_manufacturers where slug = 'OTHER' limit 1)
where pl.manufacturer_id is null;

update public.part_listings pl
set category_id = pc.id
from public.part_categories pc
where pl.category_id is null
  and trim(pl.category) = pc.label;

update public.part_listings pl
set category_id = (select id from public.part_categories where slug = 'other' limit 1)
where pl.category_id is null;

update public.part_listings pl
set
  model_display_name = coalesce(nullif(trim(pl.compatible_models), ''), '汎用'),
  is_universal_model = (trim(pl.compatible_models) in ('', '汎用', '通用', 'ユニバーサル'))
where coalesce(trim(pl.model_display_name), '') = '';

update public.part_listings pl
set manufacturer_part_number_normalized = public.normalize_part_catalog_text(pl.manufacturer_part_number)
where pl.manufacturer_part_number_normalized = ''
  and trim(pl.manufacturer_part_number) <> '';

-- Trigger sync for model FK + compatible_models text
update public.part_listings
set model_display_name = model_display_name
where manufacturer_id is not null
  and category_id is not null
  and coalesce(trim(model_display_name), '') <> '';

-- ---------------------------------------------------------------------------
-- RLS: catalog read-only for dealers; models learn via function
-- ---------------------------------------------------------------------------
alter table public.part_manufacturers enable row level security;
alter table public.part_categories enable row level security;
alter table public.part_models enable row level security;

drop policy if exists part_manufacturers_select on public.part_manufacturers;
create policy part_manufacturers_select on public.part_manufacturers
  for select to authenticated
  using (is_active or public.is_admin());

drop policy if exists part_categories_select on public.part_categories;
create policy part_categories_select on public.part_categories
  for select to authenticated
  using (is_active or public.is_admin());

drop policy if exists part_models_select on public.part_models;
create policy part_models_select on public.part_models
  for select to authenticated
  using (true);
