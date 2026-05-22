-- RideWorks 信用スコア制度（免許モデル）: 履歴・監査・BAN・年次スナップショット
-- profiles = 加盟店 (dealers)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'penalty_category') then
    create type public.penalty_category as enum ('minor', 'moderate', 'severe');
  end if;
  if not exists (select 1 from pg_type where typname = 'admin_action_type') then
    create type public.admin_action_type as enum (
      'penalty',
      'ban',
      'unban',
      'year_end_reset',
      'recovery',
      'complaint_approved',
      'member_suspend',
      'member_resume'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- profiles (dealers) extensions
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists yearly_reset_at timestamptz,
  add column if not exists is_banned boolean not null default false,
  add column if not exists ban_reason text;

comment on column public.profiles.trust_score is '当年信用点数 (current_score)';
comment on column public.profiles.trust_rank is '表示バッジ (current_badge、年末締めで確定)';
comment on column public.profiles.yearly_reset_at is '直近の年次リセット日時';

-- ---------------------------------------------------------------------------
-- dealers ビュー（仕様上の名称）
-- ---------------------------------------------------------------------------
create or replace view public.dealers as
select
  p.id as dealer_id,
  p.email,
  p.store_name,
  p.member_type,
  p.trust_score as current_score,
  p.trust_rank as current_badge,
  p.yearly_reset_at,
  p.is_banned,
  p.is_active,
  p.ban_reason,
  p.last_penalty_at,
  p.last_recovery_at,
  p.created_at
from public.profiles p
where p.member_type = 'dealer';

grant select on public.dealers to authenticated;

-- ---------------------------------------------------------------------------
-- History & audit tables
-- ---------------------------------------------------------------------------
create table if not exists public.penalty_history (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  penalty_points int not null check (penalty_points > 0 and penalty_points <= 100),
  reason text not null check (char_length(trim(reason)) >= 3),
  category public.penalty_category not null,
  complaint_id uuid references public.complaints (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists penalty_history_dealer_idx
  on public.penalty_history (dealer_id, created_at desc);

create table if not exists public.dealer_yearly_snapshot (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  year int not null check (year >= 2020 and year <= 2100),
  final_score int not null check (final_score >= 0 and final_score <= 100),
  final_badge public.trust_rank not null,
  created_at timestamptz not null default now(),
  constraint dealer_yearly_snapshot_unique unique (dealer_id, year)
);

create index if not exists dealer_yearly_snapshot_year_idx
  on public.dealer_yearly_snapshot (year desc, dealer_id);

create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  action_type public.admin_action_type not null,
  target_dealer_id uuid references public.profiles (id) on delete set null,
  performed_by uuid references public.profiles (id) on delete set null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_created_idx
  on public.admin_actions (created_at desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
  on public.audit_logs (created_at desc);

create table if not exists public.ban_history (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) >= 3),
  banned_by uuid references public.profiles (id) on delete set null,
  banned_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  note text
);

create index if not exists ban_history_dealer_idx
  on public.ban_history (dealer_id, banned_at desc);

-- ---------------------------------------------------------------------------
-- Badge thresholds (40点台で Yellow)
-- ---------------------------------------------------------------------------
create or replace function public.trust_rank_from_score(p_score int)
returns public.trust_rank
language sql
immutable
as $$
  select case
    when p_score >= 95 then 'GOLD'::public.trust_rank
    when p_score >= 70 then 'BLUE'::public.trust_rank
    when p_score >= 40 then 'YELLOW'::public.trust_rank
    else 'RED'::public.trust_rank
  end;
$$;

-- ---------------------------------------------------------------------------
-- Audit helpers
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.write_admin_action(
  p_action_type public.admin_action_type,
  p_target_dealer_id uuid,
  p_note text,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_actions (action_type, target_dealer_id, performed_by, note, payload)
  values (p_action_type, p_target_dealer_id, auth.uid(), p_note, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Penalty application (internal + admin RPC)
-- ---------------------------------------------------------------------------
create or replace function public.apply_dealer_penalty(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_category public.penalty_category,
  p_complaint_id uuid default null,
  p_skip_admin_check boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_history_id uuid;
begin
  if not p_skip_admin_check and not public.is_admin() then
    raise exception 'admin only';
  end if;

  if p_points is null or p_points <= 0 or p_points > 100 then
    raise exception 'invalid penalty points';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'reason required';
  end if;

  select * into v_row from public.profiles where id = p_dealer_id for update;
  if v_row.id is null then
    raise exception 'dealer not found';
  end if;

  update public.profiles
  set
    trust_score = greatest(0, trust_score - p_points),
    last_penalty_at = now()
  where id = p_dealer_id
  returning * into v_row;

  insert into public.penalty_history (
    dealer_id, penalty_points, reason, category, complaint_id, created_by
  )
  values (
    p_dealer_id, p_points, trim(p_reason), p_category, p_complaint_id, auth.uid()
  )
  returning id into v_history_id;

  perform public.write_admin_action(
    'penalty',
    p_dealer_id,
    trim(p_reason),
    jsonb_build_object(
      'points', p_points,
      'category', p_category,
      'new_score', v_row.trust_score,
      'penalty_history_id', v_history_id
    )
  );

  perform public.write_audit_log(
    'dealer_penalty',
    'profiles',
    p_dealer_id,
    jsonb_build_object(
      'points', p_points,
      'category', p_category,
      'reason', trim(p_reason),
      'new_score', v_row.trust_score,
      'complaint_id', p_complaint_id
    )
  );

  return v_row;
end;
$$;

create or replace function public.admin_apply_penalty(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_category public.penalty_category
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.apply_dealer_penalty(p_dealer_id, p_points, p_reason, p_category, null, false);
end;
$$;

-- 後方互換
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
  v_cat public.penalty_category;
begin
  v_cat := case
    when p_penalty <= 5 then 'minor'::public.penalty_category
    when p_penalty <= 10 then 'moderate'::public.penalty_category
    else 'severe'::public.penalty_category
  end;
  return public.apply_dealer_penalty(
    p_profile_id,
    p_penalty,
    'システム減点（レガシー）',
    v_cat,
    null,
    true
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- BAN
-- ---------------------------------------------------------------------------
create or replace function public.admin_ban_dealer(
  p_dealer_id uuid,
  p_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'ban reason required';
  end if;

  update public.profiles
  set
    is_banned = true,
    is_active = false,
    ban_reason = trim(p_reason)
  where id = p_dealer_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'dealer not found';
  end if;

  insert into public.ban_history (dealer_id, reason, banned_by)
  values (p_dealer_id, trim(p_reason), auth.uid());

  perform public.write_admin_action('ban', p_dealer_id, trim(p_reason), '{}'::jsonb);
  perform public.write_audit_log('dealer_ban', 'profiles', p_dealer_id, jsonb_build_object('reason', trim(p_reason)));

  return v_row;
end;
$$;

create or replace function public.admin_unban_dealer(
  p_dealer_id uuid,
  p_note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.ban_history
  set lifted_at = now(), lifted_by = auth.uid(), note = p_note
  where dealer_id = p_dealer_id and lifted_at is null;

  update public.profiles
  set
    is_banned = false,
    is_active = true,
    ban_reason = null
  where id = p_dealer_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'dealer not found';
  end if;

  perform public.write_admin_action('unban', p_dealer_id, coalesce(p_note, 'BAN解除'), '{}'::jsonb);
  perform public.write_audit_log('dealer_unban', 'profiles', p_dealer_id, jsonb_build_object('note', p_note));

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Complaint approve → penalty_history
-- ---------------------------------------------------------------------------
create or replace function public.penalty_category_for_complaint(p_type public.complaint_type)
returns public.penalty_category
language sql
immutable
as $$
  select case p_type
    when 'minor_condition' then 'minor'::public.penalty_category
    when 'undisclosed_damage' then 'moderate'::public.penalty_category
    when 'transfer_delay' then 'moderate'::public.penalty_category
    else 'severe'::public.penalty_category
  end;
$$;

create or replace function public.approve_complaint(p_complaint_id uuid)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.complaints;
  v_reason text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v_c from public.complaints where id = p_complaint_id for update;
  if v_c.id is null then raise exception 'complaint not found'; end if;
  if v_c.status <> 'pending' then raise exception 'already reviewed'; end if;

  v_reason := format('クレーム承認: %s', v_c.complaint_type::text);

  perform public.apply_dealer_penalty(
    v_c.seller_id,
    v_c.penalty_score,
    v_reason,
    public.penalty_category_for_complaint(v_c.complaint_type),
    v_c.id,
    true
  );

  update public.complaints
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_complaint_id
  returning * into v_c;

  perform public.write_admin_action(
    'complaint_approved',
    v_c.seller_id,
    v_reason,
    jsonb_build_object('complaint_id', p_complaint_id, 'penalty', v_c.penalty_score)
  );

  return v_c;
end;
$$;

-- ---------------------------------------------------------------------------
-- Year-end reset + snapshot
-- ---------------------------------------------------------------------------
create or replace function public.apply_trust_year_end()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_year int := extract(year from current_date)::int;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  insert into public.dealer_yearly_snapshot (dealer_id, year, final_score, final_badge)
  select
    p.id,
    v_year,
    p.trust_score,
    public.trust_rank_from_score(p.trust_score)
  from public.profiles p
  where p.member_type = 'dealer'
  on conflict (dealer_id, year) do update
  set
    final_score = excluded.final_score,
    final_badge = excluded.final_badge,
    created_at = now();

  update public.profiles
  set
    trust_rank = public.trust_rank_from_score(trust_score),
    trust_score = 100,
    yearly_reset_at = now()
  where member_type = 'dealer';

  get diagnostics v_count = row_count;

  perform public.write_admin_action(
    'year_end_reset',
    null,
    format('%s年度 年末締め', v_year),
    jsonb_build_object('year', v_year, 'dealers_reset', v_count)
  );

  perform public.write_audit_log(
    'year_end_reset',
    'system',
    null,
    jsonb_build_object('year', v_year, 'dealers_reset', v_count)
  );

  return jsonb_build_object('year', v_year, 'members_reset', v_count);
end;
$$;

-- 信用回復は 017_remove_trust_recovery.sql で廃止（年末締めのみ）

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.penalty_history enable row level security;
alter table public.dealer_yearly_snapshot enable row level security;
alter table public.admin_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ban_history enable row level security;

drop policy if exists penalty_history_select on public.penalty_history;
create policy penalty_history_select on public.penalty_history
  for select to authenticated
  using (dealer_id = auth.uid() or public.is_admin());

drop policy if exists dealer_yearly_snapshot_select on public.dealer_yearly_snapshot;
create policy dealer_yearly_snapshot_select on public.dealer_yearly_snapshot
  for select to authenticated
  using (dealer_id = auth.uid() or public.is_admin());

drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using (public.is_admin());

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_admin());

drop policy if exists ban_history_select on public.ban_history;
create policy ban_history_select on public.ban_history
  for select to authenticated
  using (dealer_id = auth.uid() or public.is_admin());

grant execute on function public.admin_apply_penalty(uuid, int, text, public.penalty_category) to authenticated;
grant execute on function public.admin_ban_dealer(uuid, text) to authenticated;
grant execute on function public.admin_unban_dealer(uuid, text) to authenticated;

-- クレーム減点（-5 / -10 / -30+）
create or replace function public.penalty_for_complaint_type(p_type public.complaint_type)
returns int
language sql
immutable
as $$
  select case p_type
    when 'minor_condition' then 5
    when 'undisclosed_damage' then 10
    when 'transfer_delay' then 10
    when 'major_misrepresentation' then 30
    when 'mileage_issue' then 30
    when 'theft_issue' then 50
  end;
$$;
