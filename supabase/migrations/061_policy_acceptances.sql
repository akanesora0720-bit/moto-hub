-- 利用規約・プライバシーポリシー同意を policy_type で統一管理

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

comment on table public.policy_acceptances is '利用規約・プライバシーポリシー等への同意記録';
comment on column public.policy_acceptances.policy_type is 'terms=利用規約 / privacy=プライバシーポリシー';
comment on column public.policy_acceptances.policy_version is '文書バージョン（例: v1）';

-- 060 terms_acceptances から移行
insert into public.policy_acceptances (user_id, policy_type, policy_version, pdf_url, accepted_at, created_at)
select user_id, 'terms'::public.policy_type, terms_version, pdf_url, accepted_at, created_at
from public.terms_acceptances
on conflict (user_id, policy_type, policy_version) do nothing;

drop table if exists public.terms_acceptances;

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

create or replace function public.complete_dealer_onboarding(p_payload jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  if coalesce((p_payload->>'terms_accepted')::boolean, false) is not true then
    raise exception '利用規約への同意が必要です';
  end if;
  if coalesce((p_payload->>'privacy_accepted')::boolean, false) is not true then
    raise exception 'プライバシーポリシーへの同意が必要です';
  end if;

  perform public.record_policy_acceptance(
    'terms'::public.policy_type,
    coalesce(nullif(trim(p_payload->>'terms_version'), ''), 'v1'),
    coalesce(
      nullif(trim(p_payload->>'terms_pdf_url'), ''),
      '/terms/Motohub Terms Of Service V1.pdf'
    )
  );
  perform public.record_policy_acceptance(
    'privacy'::public.policy_type,
    coalesce(nullif(trim(p_payload->>'privacy_version'), ''), 'v1'),
    coalesce(
      nullif(trim(p_payload->>'privacy_pdf_url'), ''),
      '/legal/privacy_policy.pdf'
    )
  );

  update public.profiles
  set
    store_name = trim(p_payload->>'store_name'),
    trade_name = trim(p_payload->>'trade_name'),
    contact_name = trim(p_payload->>'contact_name'),
    antique_dealer_number = trim(p_payload->>'antique_dealer_number'),
    invoice_number = trim(p_payload->>'invoice_number'),
    prefecture = p_payload->>'prefecture',
    address = trim(p_payload->>'address'),
    phone = trim(p_payload->>'phone'),
    bank_name = trim(p_payload->>'bank_name'),
    bank_branch = nullif(trim(p_payload->>'bank_branch'), ''),
    bank_account_type = coalesce(nullif(trim(p_payload->>'bank_account_type'), ''), '普通'),
    bank_account_number = trim(p_payload->>'bank_account_number'),
    bank_account_holder = trim(p_payload->>'bank_account_holder'),
    antique_dealer_doc_path = p_payload->>'antique_dealer_doc_path',
    invoice_doc_path = p_payload->>'invoice_doc_path',
    profile_completed = true,
    verification_status = case
      when coalesce((p_payload->>'submit_for_review')::boolean, false) then 'pending'::public.verification_status
      else verification_status
    end,
    updated_at = now()
  where id = auth.uid()
  returning * into v_profile;

  perform public.ensure_dealer_identity_for_profile(auth.uid());

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;
