-- 利用規約同意の記録（バージョン管理・監査用）

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  terms_version text not null,
  pdf_url text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, terms_version)
);

create index if not exists terms_acceptances_user_id_idx on public.terms_acceptances (user_id);
create index if not exists terms_acceptances_terms_version_idx on public.terms_acceptances (terms_version);

comment on table public.terms_acceptances is '利用規約への同意記録（ユーザー・バージョン・PDF URL・日時）';
comment on column public.terms_acceptances.terms_version is '規約バージョン（例: v1）。改定時に新バージョンで再同意';
comment on column public.terms_acceptances.pdf_url is '同意時点の利用規約PDFのURL（絶対URL推奨）';
comment on column public.terms_acceptances.accepted_at is '同意日時';

alter table public.terms_acceptances enable row level security;

drop policy if exists terms_acceptances_select_own on public.terms_acceptances;
create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists terms_acceptances_insert_own on public.terms_acceptances;
create policy terms_acceptances_insert_own on public.terms_acceptances
  for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.record_terms_acceptance(
  p_terms_version text,
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
  if coalesce(trim(p_terms_version), '') = '' then
    raise exception 'terms_version required';
  end if;
  if coalesce(trim(p_pdf_url), '') = '' then
    raise exception 'pdf_url required';
  end if;

  insert into public.terms_acceptances (user_id, terms_version, pdf_url, accepted_at)
  values (auth.uid(), trim(p_terms_version), trim(p_pdf_url), now())
  on conflict (user_id, terms_version) do update
    set pdf_url = excluded.pdf_url,
        accepted_at = excluded.accepted_at
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.record_terms_acceptance(text, text) to authenticated;

create or replace function public.has_accepted_terms(p_terms_version text default 'v1')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.terms_acceptances
    where user_id = auth.uid()
      and terms_version = coalesce(nullif(trim(p_terms_version), ''), 'v1')
  );
$$;

grant execute on function public.has_accepted_terms(text) to authenticated;

-- 加盟店オンボーディング: 規約同意必須 + 記録
create or replace function public.complete_dealer_onboarding(p_payload jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_version text;
  v_pdf_url text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  if coalesce((p_payload->>'terms_accepted')::boolean, false) is not true then
    raise exception '利用規約への同意が必要です';
  end if;

  v_version := coalesce(nullif(trim(p_payload->>'terms_version'), ''), 'v1');
  v_pdf_url := coalesce(
    nullif(trim(p_payload->>'terms_pdf_url'), ''),
    '/terms/Motohub Terms Of Service V1.pdf'
  );

  perform public.record_terms_acceptance(v_version, v_pdf_url);

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
