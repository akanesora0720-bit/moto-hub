-- 加盟店アカウント状態（仮登録〜審査〜加盟完了）

do $$ begin
  create type public.account_status as enum (
    'pre_registered',
    'pending_review',
    'approved',
    'rejected',
    'suspended'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists account_status public.account_status,
  add column if not exists contract_established_at timestamptz;

comment on column public.profiles.account_status is
  '加盟店アカウント状態: pre_registered=仮登録, pending_review=審査待ち, approved=加盟完了, rejected=否認, suspended=停止';
comment on column public.profiles.contract_established_at is
  '正式加盟契約成立日時（approved 時に設定。利用契約成立はこの時点）';

-- 既存データの移行
update public.profiles
set account_status = case
  when member_type = 'staff' then 'approved'::public.account_status
  when membership_status = 'suspended' or (not is_active and member_type = 'dealer') then 'suspended'::public.account_status
  when verification_status = 'verified' then 'approved'::public.account_status
  when verification_status = 'rejected' then 'rejected'::public.account_status
  when verification_status = 'pending' or profile_completed then 'pending_review'::public.account_status
  else 'pre_registered'::public.account_status
end
where account_status is null;

update public.profiles
set contract_established_at = verified_at
where account_status = 'approved'
  and contract_established_at is null
  and verified_at is not null;

alter table public.profiles
  alter column account_status set default 'pre_registered';

create index if not exists profiles_account_status_idx on public.profiles (account_status)
  where member_type = 'dealer';

-- signup 時: 業者は仮登録
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.member_type := 'dealer';
  v_token text;
  v_invite public.staff_invites;
  v_status public.account_status := 'pre_registered';
begin
  if new.raw_user_meta_data ->> 'member_type' = 'staff' then
    v_token := new.raw_user_meta_data ->> 'staff_invite_token';
    if v_token is null then
      raise exception 'staff signup requires invite';
    end if;

    select * into v_invite
    from public.staff_invites
    where token = trim(v_token)::uuid
      and used_at is null
      and expires_at > now()
      and email = lower(new.email);

    if v_invite.id is null then
      raise exception 'invalid or expired staff invite';
    end if;

    update public.staff_invites set used_at = now() where id = v_invite.id;
    v_type := 'staff';
    v_status := 'approved';
  end if;

  insert into public.profiles (id, email, member_type, account_status)
  values (new.id, lower(new.email), v_type, v_status);
  return new;
end;
$$;

-- 仮登録完了（メール登録直後・規約同意済み）
create or replace function public.finalize_dealer_pre_registration(
  p_terms_version text,
  p_terms_pdf_url text,
  p_privacy_version text,
  p_privacy_pdf_url text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  perform public.record_registration_policy_acceptances(
    p_terms_version, p_terms_pdf_url, p_privacy_version, p_privacy_pdf_url
  );

  update public.profiles
  set
    account_status = 'pre_registered'::public.account_status,
    verification_status = 'unverified'::public.verification_status,
    profile_completed = false,
    updated_at = now()
  where id = auth.uid()
    and member_type = 'dealer'
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'dealer only';
  end if;

  return v_profile;
end;
$$;

grant execute on function public.finalize_dealer_pre_registration(text, text, text, text) to authenticated;

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
    account_status = 'pending_review'::public.account_status,
    verification_status = 'pending'::public.verification_status,
    updated_at = now()
  where id = auth.uid()
  returning * into v_profile;

  perform public.ensure_dealer_identity_for_profile(auth.uid());

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

create or replace function public.admin_verify_dealer(
  p_profile_id uuid,
  p_status public.verification_status
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_identity public.dealer_identities%rowtype;
  v_account_status public.account_status;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  v_account_status := case p_status
    when 'verified' then 'approved'::public.account_status
    when 'rejected' then 'rejected'::public.account_status
    when 'pending' then 'pending_review'::public.account_status
    else 'pre_registered'::public.account_status
  end;

  update public.profiles
  set
    verification_status = p_status,
    account_status = v_account_status,
    verified_at = case when p_status = 'verified' then now() else null end,
    contract_established_at = case when p_status = 'verified' then now() else null end,
    updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  if p_status = 'verified' and v_profile.member_type = 'dealer' then
    v_identity := public.ensure_dealer_identity_for_profile(p_profile_id);
    select * into v_profile from public.profiles where id = p_profile_id;

    if v_identity.is_permanently_banned
      or (v_identity.rejoin_blocked_until is not null and v_identity.rejoin_blocked_until > now()) then
      update public.profiles
      set
        is_active = false,
        membership_status = 'suspended',
        account_status = 'suspended'::public.account_status,
        updated_at = now()
      where id = p_profile_id
      returning * into v_profile;
    else
      update public.profiles
      set is_active = true, membership_status = 'active', updated_at = now()
      where id = p_profile_id
      returning * into v_profile;
    end if;
  end if;

  if p_status = 'rejected' then
    update public.profiles
    set contract_established_at = null, updated_at = now()
    where id = p_profile_id;
  end if;

  perform public.write_audit_log('dealer_verification', 'profiles', p_profile_id,
    jsonb_build_object('status', p_status, 'account_status', v_account_status));

  select * into v_profile from public.profiles where id = p_profile_id;
  return v_profile;
end;
$$;

create or replace function public.dealer_has_full_access(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = coalesce(p_user_id, auth.uid())
      and member_type = 'dealer'
      and account_status = 'approved'::public.account_status
      and is_active = true
      and not is_banned
  );
$$;

grant execute on function public.dealer_has_full_access(uuid) to authenticated;
