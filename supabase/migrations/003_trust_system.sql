-- MotoHub Phase2: 信用システム（減点制・クレーム・回復）
-- profiles = 会員（auth.users と 1:1）。要件の users は profiles に相当。

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'trust_rank') then
    create type public.trust_rank as enum ('GOLD', 'BLUE', 'YELLOW', 'RED');
  end if;
  if not exists (select 1 from pg_type where typname = 'complaint_status') then
    create type public.complaint_status as enum ('pending', 'approved', 'rejected');
  end if;
  if not exists (select 1 from pg_type where typname = 'complaint_type') then
    create type public.complaint_type as enum (
      'minor_condition',
      'undisclosed_damage',
      'major_misrepresentation',
      'mileage_issue',
      'transfer_delay',
      'theft_issue'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles: trust_score / trust_rank
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists trust_score int not null default 100
    check (trust_score >= 0 and trust_score <= 100),
  add column if not exists trust_rank public.trust_rank not null default 'GOLD',
  add column if not exists last_penalty_at timestamptz,
  add column if not exists last_recovery_at timestamptz;

update public.profiles
set trust_score = 100, trust_rank = 'GOLD'
where trust_score is null or trust_rank is null;

-- ---------------------------------------------------------------------------
-- listings: RideWorks査定済
-- ---------------------------------------------------------------------------
alter table public.listings
  add column if not exists inspection_status boolean not null default false;

-- ---------------------------------------------------------------------------
-- complaints
-- ---------------------------------------------------------------------------
create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  complaint_type public.complaint_type not null,
  description text not null,
  penalty_score int not null check (penalty_score > 0 and penalty_score <= 100),
  status public.complaint_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists complaints_status_idx on public.complaints (status, created_at desc);
create index if not exists complaints_seller_idx on public.complaints (seller_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trust helpers
-- ---------------------------------------------------------------------------
create or replace function public.trust_rank_from_score(p_score int)
returns public.trust_rank
language sql
immutable
as $$
  select case
    when p_score >= 95 then 'GOLD'::public.trust_rank
    when p_score >= 70 then 'BLUE'::public.trust_rank
    when p_score >= 50 then 'YELLOW'::public.trust_rank
    else 'RED'::public.trust_rank
  end;
$$;

create or replace function public.sync_profile_trust_rank()
returns trigger
language plpgsql
as $$
begin
  new.trust_rank := public.trust_rank_from_score(new.trust_score);
  return new;
end;
$$;

drop trigger if exists profiles_sync_trust_rank on public.profiles;
create trigger profiles_sync_trust_rank
  before insert or update of trust_score on public.profiles
  for each row execute function public.sync_profile_trust_rank();

create or replace function public.penalty_for_complaint_type(p_type public.complaint_type)
returns int
language sql
immutable
as $$
  select case p_type
    when 'minor_condition' then 5
    when 'undisclosed_damage' then 10
    when 'major_misrepresentation' then 20
    when 'mileage_issue' then 30
    when 'transfer_delay' then 20
    when 'theft_issue' then 50
  end;
$$;

create or replace function public.apply_trust_penalty(
  p_profile_id uuid,
  p_penalty int
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  update public.profiles
  set
    trust_score = greatest(0, trust_score - p_penalty),
    last_penalty_at = now()
  where id = p_profile_id
  returning * into v_row;
  return v_row;
end;
$$;

-- 管理者: クレーム承認 → 減点
create or replace function public.approve_complaint(p_complaint_id uuid)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.complaints;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v_c from public.complaints where id = p_complaint_id for update;
  if v_c.id is null then raise exception 'complaint not found'; end if;
  if v_c.status <> 'pending' then raise exception 'already reviewed'; end if;

  perform public.apply_trust_penalty(v_c.seller_id, v_c.penalty_score);

  update public.complaints
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_complaint_id
  returning * into v_c;

  return v_c;
end;
$$;

create or replace function public.reject_complaint(p_complaint_id uuid)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.complaints;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.complaints
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_complaint_id and status = 'pending'
  returning * into v_c;

  if v_c.id is null then raise exception 'complaint not found or not pending'; end if;
  return v_c;
end;
$$;

-- 回復: 6ヶ月問題なし +5 / 12ヶ月問題なし +10（12ヶ月を優先、100上限）
create or replace function public.apply_trust_recovery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count_12 int := 0;
  v_count_6 int := 0;
  v_row record;
  v_bonus int;
  v_since timestamptz;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  for v_row in
    select p.id, p.trust_score, p.last_penalty_at, p.last_recovery_at
    from public.profiles p
    where p.trust_score < 100
  loop
    v_since := greatest(
      coalesce(v_row.last_penalty_at, '1970-01-01'::timestamptz),
      coalesce(v_row.last_recovery_at, '1970-01-01'::timestamptz)
    );

    if exists (
      select 1 from public.complaints c
      where c.seller_id = v_row.id
        and c.status = 'approved'
        and c.reviewed_at > v_since
    ) then
      continue;
    end if;

    if not exists (
      select 1 from public.complaints c
      where c.seller_id = v_row.id
        and c.status = 'approved'
        and c.reviewed_at > now() - interval '12 months'
    ) and v_row.trust_score < 100 then
      v_bonus := 10;
      v_count_12 := v_count_12 + 1;
    elsif not exists (
      select 1 from public.complaints c
      where c.seller_id = v_row.id
        and c.status = 'approved'
        and c.reviewed_at > now() - interval '6 months'
    ) and v_row.trust_score < 100 then
      v_bonus := 5;
      v_count_6 := v_count_6 + 1;
    else
      continue;
    end if;

    update public.profiles
    set
      trust_score = least(100, trust_score + v_bonus),
      last_recovery_at = now()
    where id = v_row.id;
  end loop;

  return jsonb_build_object(
    'recovered_6_months', v_count_6,
    'recovered_12_months', v_count_12
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: complaints
-- ---------------------------------------------------------------------------
alter table public.complaints enable row level security;

drop policy if exists complaints_select on public.complaints;
create policy complaints_select on public.complaints
  for select to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists complaints_insert_buyer on public.complaints;
create policy complaints_insert_buyer on public.complaints
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and public.my_profile_complete()
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.seller_id = seller_id
        and l.seller_id <> auth.uid()
    )
  );

drop policy if exists complaints_admin_update on public.complaints;
create policy complaints_admin_update on public.complaints
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant execute on function public.approve_complaint(uuid) to authenticated;
grant execute on function public.reject_complaint(uuid) to authenticated;
grant execute on function public.apply_trust_recovery() to authenticated;
