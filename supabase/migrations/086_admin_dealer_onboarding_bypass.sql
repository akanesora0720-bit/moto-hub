-- 運営者（is_admin / staff）が加盟店 onboarding しても pending_review に落とさない。
-- 既に誤って pending_review になった運営者は approved に復旧。

create or replace function public.complete_dealer_onboarding(p_payload jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_operator boolean;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  if coalesce((p_payload->>'terms_accepted')::boolean, false) is not true then
    raise exception '利用規約への同意が必要です';
  end if;
  if coalesce((p_payload->>'privacy_accepted')::boolean, false) is not true then
    raise exception 'プライバシーポリシーへの同意が必要です';
  end if;

  select (p.is_admin = true or p.member_type = 'staff')
  into v_operator
  from public.profiles p
  where p.id = auth.uid();

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
    account_status = case
      when v_operator then 'approved'::public.account_status
      else 'pending_review'::public.account_status
    end,
    verification_status = case
      when v_operator then 'verified'::public.verification_status
      else 'pending'::public.verification_status
    end,
    updated_at = now()
  where id = auth.uid()
  returning * into v_profile;

  perform public.ensure_dealer_identity_for_profile(auth.uid());

  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end;
$$;

-- 運営者が審査フローに巻き込まれた既存行の復旧
update public.profiles
set
  account_status = 'approved'::public.account_status,
  verification_status = 'verified'::public.verification_status,
  updated_at = now()
where (is_admin = true or member_type = 'staff')
  and member_type = 'dealer'
  and account_status in ('pending_review', 'pre_registered')
  and profile_completed = true;
