-- 061 がスタブ適用・terms_acceptances 未存在で失敗した環境の修復

do $$ begin
  create type public.policy_type as enum ('terms', 'privacy');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy_type public.policy_type not null,
  policy_version text not null,
  pdf_url text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, policy_type, policy_version)
);

create index if not exists policy_acceptances_user_id_idx on public.policy_acceptances (user_id);
create index if not exists policy_acceptances_type_version_idx
  on public.policy_acceptances (policy_type, policy_version);

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'terms_acceptances'
  ) then
    insert into public.policy_acceptances (
      user_id, policy_type, policy_version, pdf_url, accepted_at, created_at
    )
    select
      user_id,
      'terms'::public.policy_type,
      terms_version,
      pdf_url,
      accepted_at,
      created_at
    from public.terms_acceptances
    on conflict (user_id, policy_type, policy_version) do nothing;

    drop table public.terms_acceptances;
  end if;
end $$;

alter table public.policy_acceptances enable row level security;

drop policy if exists policy_acceptances_select_own on public.policy_acceptances;
create policy policy_acceptances_select_own on public.policy_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists policy_acceptances_insert_own on public.policy_acceptances;
create policy policy_acceptances_insert_own on public.policy_acceptances
  for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.record_policy_acceptance(
  p_policy_type public.policy_type,
  p_policy_version text,
  p_pdf_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  if coalesce(trim(p_policy_version), '') = '' then
    raise exception 'policy_version required';
  end if;
  if coalesce(trim(p_pdf_url), '') = '' then
    raise exception 'pdf_url required';
  end if;

  insert into public.policy_acceptances (user_id, policy_type, policy_version, pdf_url, accepted_at)
  values (auth.uid(), p_policy_type, trim(p_policy_version), trim(p_pdf_url), now())
  on conflict (user_id, policy_type, policy_version) do update
    set pdf_url = excluded.pdf_url,
        accepted_at = excluded.accepted_at
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_policy_acceptance(public.policy_type, text, text) to authenticated;

create or replace function public.record_terms_acceptance(
  p_terms_version text,
  p_pdf_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_policy_acceptance('terms'::public.policy_type, p_terms_version, p_pdf_url);
end;
$$;

grant execute on function public.record_terms_acceptance(text, text) to authenticated;

create or replace function public.has_accepted_policy(
  p_policy_type public.policy_type,
  p_policy_version text default 'v1'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.policy_acceptances
    where user_id = auth.uid()
      and policy_type = p_policy_type
      and policy_version = coalesce(nullif(trim(p_policy_version), ''), 'v1')
  );
$$;

grant execute on function public.has_accepted_policy(public.policy_type, text) to authenticated;

create or replace function public.has_accepted_terms(p_terms_version text default 'v1')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_accepted_policy('terms'::public.policy_type, p_terms_version);
$$;

grant execute on function public.has_accepted_terms(text) to authenticated;

create or replace function public.record_registration_policy_acceptances(
  p_terms_version text,
  p_terms_pdf_url text,
  p_privacy_version text,
  p_privacy_pdf_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_policy_acceptance('terms'::public.policy_type, p_terms_version, p_terms_pdf_url);
  perform public.record_policy_acceptance('privacy'::public.policy_type, p_privacy_version, p_privacy_pdf_url);
end;
$$;

grant execute on function public.record_registration_policy_acceptances(text, text, text, text) to authenticated;
