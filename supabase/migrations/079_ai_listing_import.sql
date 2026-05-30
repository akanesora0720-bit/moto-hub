-- AI出品サポート（MVP）: インポートジョブ + 出品下書き

alter type public.listing_status add value if not exists 'draft';

-- ---------------------------------------------------------------------------
-- Import jobs
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ai_listing_import_status') then
    create type public.ai_listing_import_status as enum (
      'uploaded', 'processing', 'completed', 'failed'
    );
  end if;
end
$$;

create table if not exists public.ai_listing_import_jobs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  source_filename text,
  storage_path text not null,
  mime_type text not null default 'image/jpeg',
  status public.ai_listing_import_status not null default 'uploaded',
  detected_count int not null default 0 check (detected_count >= 0),
  saved_draft_count int not null default 0 check (saved_draft_count >= 0),
  error_message text,
  model_name text,
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists ai_listing_import_jobs_seller_idx
  on public.ai_listing_import_jobs (seller_id, created_at desc);

create index if not exists ai_listing_import_jobs_status_idx
  on public.ai_listing_import_jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Parsed rows (before / after listing draft link)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_listing_draft_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_listing_import_jobs (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  sort_order int not null default 0,
  maker text,
  model text,
  displacement_cc int check (displacement_cc is null or displacement_cc > 0),
  year int check (year is null or (year >= 1950 and year <= 2100)),
  mileage int check (mileage is null or mileage >= 0),
  inspection_text text,
  insurance_text text,
  color text,
  frame_number text,
  price_ex_tax int check (price_ex_tax is null or price_ex_tax > 0),
  total_price_inc_tax int check (total_price_inc_tax is null or total_price_inc_tax > 0),
  repair_history text,
  warranty_text text,
  maintenance_text text,
  comment text,
  field_confidence jsonb not null default '{}'::jsonb,
  raw_extract jsonb,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_listing_draft_items_job_idx
  on public.ai_listing_draft_items (job_id, sort_order);

drop trigger if exists ai_listing_import_jobs_set_updated_at on public.ai_listing_import_jobs;
create trigger ai_listing_import_jobs_set_updated_at
  before update on public.ai_listing_import_jobs
  for each row execute function public.set_updated_at();

drop trigger if exists ai_listing_draft_items_set_updated_at on public.ai_listing_draft_items;
create trigger ai_listing_draft_items_set_updated_at
  before update on public.ai_listing_draft_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ai_listing_import_jobs enable row level security;
alter table public.ai_listing_draft_items enable row level security;

create policy ai_listing_import_jobs_select on public.ai_listing_import_jobs
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy ai_listing_import_jobs_insert on public.ai_listing_import_jobs
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_dealer_approved(auth.uid())
  );

create policy ai_listing_import_jobs_update on public.ai_listing_import_jobs
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

create policy ai_listing_draft_items_select on public.ai_listing_draft_items
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy ai_listing_draft_items_insert on public.ai_listing_draft_items
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_dealer_approved(auth.uid())
  );

create policy ai_listing_draft_items_update on public.ai_listing_draft_items
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Approved dealer helper (for RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_dealer_approved(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
      and p.is_banned = false
      and (
        p.is_admin = true
        or p.member_type = 'staff'
        or (p.member_type = 'dealer' and p.account_status = 'approved')
      )
  );
$$;

grant execute on function public.is_dealer_approved(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: ai-listing-imports (private screenshots)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ai-listing-imports', 'ai-listing-imports', false)
on conflict (id) do nothing;

drop policy if exists ai_listing_imports_storage_select on storage.objects;
create policy ai_listing_imports_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ai-listing-imports'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists ai_listing_imports_storage_insert on storage.objects;
create policy ai_listing_imports_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-listing-imports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_dealer_approved()
  );
