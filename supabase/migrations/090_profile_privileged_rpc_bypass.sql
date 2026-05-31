-- 072 profiles ガード: SECURITY DEFINER RPC からの正当な privileged 更新のみ許可
-- 対象 RPC:
--   complete_dealer_onboarding
--   ensure_dealer_identity_for_profile
--   _dealer_withdraw_core (dealer_withdraw / admin_dealer_withdraw)
--   admin_verify_dealer
--   admin_repair_stuck_dealer_onboarding (運営修復)
-- 注: admin_reject_dealer / admin_update_dealer_status は未定義。審査否認・状態変更は admin_verify_dealer を使用。

-- ---------------------------------------------------------------------------
-- Session-local bypass flag (transaction scoped via set_config is_local)
-- ---------------------------------------------------------------------------
create or replace function public.moto_allow_profile_privileged_update()
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('moto.profile_privileged_update', 'allowed', true);
$$;

create or replace function public.moto_disallow_profile_privileged_update()
returns void
language sql
security definer
set search_path = public
as $$
  select set_config('moto.profile_privileged_update', '', true);
$$;

revoke all on function public.moto_allow_profile_privileged_update() from public;
revoke all on function public.moto_disallow_profile_privileged_update() from public;
grant execute on function public.moto_allow_profile_privileged_update() to service_role;
grant execute on function public.moto_disallow_profile_privileged_update() to service_role;

-- ---------------------------------------------------------------------------
-- Guard: keep P0 self-escalation prevention; honor trusted RPC flag only
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('moto.profile_privileged_update', true), '') = 'allowed' then
    return new;
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.id <> auth.uid() then
    raise exception 'forbidden profile update';
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin update requires admin';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'account_status update requires admin';
  end if;
  if new.member_type is distinct from old.member_type then
    raise exception 'member_type update requires admin';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'is_active update requires admin';
  end if;
  if new.is_banned is distinct from old.is_banned then
    raise exception 'is_banned update requires admin';
  end if;
  if new.ban_reason is distinct from old.ban_reason then
    raise exception 'ban_reason update requires admin';
  end if;
  if new.trust_score is distinct from old.trust_score then
    raise exception 'trust_score update requires admin';
  end if;
  if new.trust_rank is distinct from old.trust_rank then
    raise exception 'trust_rank update requires admin';
  end if;
  if new.last_penalty_at is distinct from old.last_penalty_at then
    raise exception 'penalty update requires admin';
  end if;
  if new.last_recovery_at is distinct from old.last_recovery_at then
    raise exception 'recovery update requires admin';
  end if;
  if new.membership_status is distinct from old.membership_status then
    raise exception 'membership_status update requires admin';
  end if;
  if new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'withdrawn_at update requires admin';
  end if;
  if new.dealer_identity_id is distinct from old.dealer_identity_id then
    raise exception 'dealer_identity update requires admin';
  end if;
  if new.contract_established_at is distinct from old.contract_established_at then
    raise exception 'contract status update requires admin';
  end if;

  if new.verification_status is distinct from old.verification_status then
    if new.verification_status <> 'pending'::public.verification_status then
      raise exception 'verification_status update requires admin';
    end if;
  end if;
  if new.verified_at is distinct from old.verified_at then
    raise exception 'verified_at update requires admin';
  end if;
  if new.verification_note is distinct from old.verification_note then
    raise exception 'verification_note update requires admin';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- ensure_dealer_identity_for_profile
-- ---------------------------------------------------------------------------
create or replace function public.ensure_dealer_identity_for_profile(p_profile_id uuid)
returns public.dealer_identities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_identity public.dealer_identities%rowtype;
  v_bank_fp text;
  v_match_id uuid;
  v_match_reasons text[];
  v_match_score int;
begin
  perform public.moto_allow_profile_privileged_update();

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    perform public.moto_disallow_profile_privileged_update();
    raise exception 'profile not found';
  end if;
  if v_profile.member_type <> 'dealer' then
    perform public.moto_disallow_profile_privileged_update();
    raise exception 'dealer only';
  end if;

  v_bank_fp := public.compute_bank_fingerprint(
    v_profile.bank_name,
    v_profile.bank_branch,
    v_profile.bank_account_type,
    v_profile.bank_account_number,
    v_profile.bank_account_holder
  );

  if v_profile.dealer_identity_id is not null then
    select * into v_identity from public.dealer_identities where id = v_profile.dealer_identity_id;
    perform public.moto_disallow_profile_privileged_update();
    return v_identity;
  end if;

  v_match_id := public.pick_best_dealer_identity(
    v_profile.antique_dealer_number,
    v_profile.invoice_number,
    v_profile.contact_name,
    v_profile.address,
    v_profile.phone,
    v_bank_fp
  );

  if v_match_id is not null then
    select * into v_identity from public.dealer_identities where id = v_match_id for update;

    select fr.match_score, fr.match_reasons
    into v_match_score, v_match_reasons
    from public.find_related_dealer_identities(
      v_profile.antique_dealer_number,
      v_profile.invoice_number,
      v_profile.contact_name,
      v_profile.address,
      v_profile.phone,
      v_bank_fp
    ) fr
    where fr.identity_id = v_match_id
    limit 1;

    if v_identity.is_permanently_banned then
      update public.profiles
      set dealer_identity_id = v_identity.id,
          trust_score = v_identity.trust_score,
          membership_status = 'suspended',
          is_active = false,
          updated_at = now()
      where id = p_profile_id;

      insert into public.dealer_membership_events (dealer_identity_id, profile_id, event_type, note, payload)
      values (v_identity.id, p_profile_id, 'rejoin_denied', '永久拒否',
        jsonb_build_object('match_score', v_match_score, 'match_reasons', v_match_reasons));
      perform public.write_audit_log('rejoin_denied', 'dealer_identities', v_identity.id,
        jsonb_build_object('profile_id', p_profile_id, 'permanent', true));
      perform public.moto_disallow_profile_privileged_update();
      return v_identity;
    end if;

    if v_identity.rejoin_blocked_until is not null and v_identity.rejoin_blocked_until > now() then
      update public.profiles
      set dealer_identity_id = v_identity.id,
          trust_score = v_identity.trust_score,
          membership_status = 'suspended',
          is_active = false,
          updated_at = now()
      where id = p_profile_id;

      insert into public.dealer_membership_events (dealer_identity_id, profile_id, event_type, rejoin_blocked_until, note, payload)
      values (v_identity.id, p_profile_id, 'rejoin_denied', v_identity.rejoin_blocked_until, '再加盟制限期間中',
        jsonb_build_object('match_score', v_match_score, 'match_reasons', v_match_reasons));
      perform public.write_audit_log('rejoin_denied', 'dealer_identities', v_identity.id,
        jsonb_build_object('profile_id', p_profile_id, 'until', v_identity.rejoin_blocked_until));
      perform public.moto_disallow_profile_privileged_update();
      return v_identity;
    end if;

    update public.profiles
    set dealer_identity_id = v_identity.id,
        trust_score = v_identity.trust_score,
        membership_status = 'active',
        is_active = true,
        withdrawn_at = null,
        updated_at = now()
    where id = p_profile_id;

    insert into public.dealer_membership_events (dealer_identity_id, profile_id, event_type, trust_score_at_event, note, payload)
    values (v_identity.id, p_profile_id, 'trust_inherited', v_identity.trust_score, '再加盟・trust引継ぎ',
      jsonb_build_object('match_score', v_match_score, 'match_reasons', v_match_reasons));

    insert into public.dealer_membership_events (dealer_identity_id, profile_id, event_type, trust_score_at_event, note)
    values (v_identity.id, p_profile_id, 'rejoined', v_identity.trust_score, '再加盟');

    perform public.write_audit_log('trust_inherited', 'dealer_identities', v_identity.id,
      jsonb_build_object('profile_id', p_profile_id, 'trust_score', v_identity.trust_score, 'match_reasons', v_match_reasons));
    perform public.write_audit_log('rejoined', 'profiles', p_profile_id,
      jsonb_build_object('dealer_identity_id', v_identity.id));

    perform public.moto_disallow_profile_privileged_update();
    return v_identity;
  end if;

  insert into public.dealer_identities (
    antique_dealer_number, invoice_number, representative_name, store_address, phone,
    antique_dealer_number_norm, invoice_number_norm, representative_name_norm,
    store_address_norm, phone_norm, bank_fingerprint,
    trust_score, trust_rank
  )
  values (
    v_profile.antique_dealer_number,
    v_profile.invoice_number,
    v_profile.contact_name,
    v_profile.address,
    v_profile.phone,
    public.normalize_identifier_text(v_profile.antique_dealer_number),
    public.normalize_identifier_text(v_profile.invoice_number),
    public.normalize_identifier_text(v_profile.contact_name),
    public.normalize_address_text(v_profile.address),
    public.normalize_phone_text(v_profile.phone),
    v_bank_fp,
    v_profile.trust_score,
    v_profile.trust_rank
  )
  returning * into v_identity;

  update public.profiles
  set dealer_identity_id = v_identity.id,
      membership_status = 'active',
      updated_at = now()
  where id = p_profile_id;

  insert into public.dealer_membership_events (dealer_identity_id, profile_id, event_type, trust_score_at_event, note)
  values (v_identity.id, p_profile_id, 'joined', v_identity.trust_score, '新規加盟');

  perform public.write_audit_log('dealer_identity_created', 'dealer_identities', v_identity.id,
    jsonb_build_object('profile_id', p_profile_id));

  perform public.moto_disallow_profile_privileged_update();
  return v_identity;
exception
  when others then
    perform public.moto_disallow_profile_privileged_update();
    raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_dealer_onboarding (087)
-- ---------------------------------------------------------------------------
create or replace function public.complete_dealer_onboarding(p_payload jsonb)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_operator boolean;
  v_body text;
  v_admin_link text;
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

  perform public.moto_allow_profile_privileged_update();
  begin
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
  exception
    when others then
      perform public.moto_disallow_profile_privileged_update();
      raise;
  end;
  perform public.moto_disallow_profile_privileged_update();

  if not v_operator
     and v_profile.account_status = 'pending_review'::public.account_status then
    v_admin_link := format('/admin/workspace?tab=members&focus=%s', v_profile.id);
    v_body := format(
      E'店舗: %s\n屋号: %s\n古物商: %s\n担当: %s\n電話: %s\nメール: %s',
      coalesce(v_profile.store_name, '—'),
      coalesce(v_profile.trade_name, '—'),
      coalesce(v_profile.antique_dealer_number, '—'),
      coalesce(v_profile.contact_name, '—'),
      coalesce(v_profile.phone, '—'),
      coalesce(v_profile.email, '—')
    );

    begin
      perform public.notify_enqueue(
        'dealer.membership_submitted',
        jsonb_build_object(
          'body', v_body,
          'admin_link', v_admin_link
        ),
        'profiles',
        v_profile.id
      );
    exception when others then null;
    end;

    begin
      perform public.notify_all_admins(
        '【運営】新規加盟審査の申請',
        v_body,
        'important',
        v_admin_link,
        'profiles',
        v_profile.id
      );
    exception when others then null;
    end;
  end if;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- _dealer_withdraw_core
-- ---------------------------------------------------------------------------
create or replace function public._dealer_withdraw_core(
  p_profile_id uuid,
  p_category public.withdraw_category,
  p_reason text,
  p_permanent boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_identity public.dealer_identities%rowtype;
  v_block_until timestamptz;
  v_event public.membership_event_type;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'profile not found'; end if;
  if v_profile.member_type <> 'dealer' then raise exception 'dealer only'; end if;
  if v_profile.membership_status = 'withdrawn' then raise exception 'already withdrawn'; end if;

  perform public.moto_allow_profile_privileged_update();
  begin
    perform public.sync_profile_trust_to_identity(p_profile_id);
    perform public.ensure_dealer_identity_for_profile(p_profile_id);

    select * into v_profile from public.profiles where id = p_profile_id;
    select * into v_identity from public.dealer_identities where id = v_profile.dealer_identity_id for update;

    v_block_until := case p_category
      when 'normal' then now() + interval '90 days'
      when 'trust_violation' then now() + interval '365 days'
      when 'forced' then case when p_permanent then null else now() + interval '365 days' end
    end;

    update public.dealer_identities
    set
      trust_score = v_profile.trust_score,
      trust_rank = public.trust_rank_from_score(v_profile.trust_score),
      rejoin_blocked_until = case when p_permanent then null else coalesce(v_block_until, rejoin_blocked_until) end,
      is_permanently_banned = v_identity.is_permanently_banned or p_permanent,
      ban_reason = case when p_permanent then coalesce(p_reason, ban_reason) else ban_reason end,
      last_withdraw_category = p_category,
      withdraw_count = withdraw_count + 1,
      updated_at = now()
    where id = v_identity.id
    returning * into v_identity;

    update public.profiles
    set is_active = false,
        membership_status = 'withdrawn',
        withdrawn_at = now(),
        updated_at = now()
    where id = p_profile_id
    returning * into v_profile;

    v_event := case
      when p_category = 'forced' then 'forced_withdrawn'::public.membership_event_type
      else 'withdrawn'::public.membership_event_type
    end;

    insert into public.dealer_membership_events (
      dealer_identity_id, profile_id, event_type, withdraw_category,
      trust_score_at_event, rejoin_blocked_until, note, payload
    )
    values (
      v_identity.id, p_profile_id, v_event, p_category,
      v_identity.trust_score,
      case when p_permanent then null else v_block_until end,
      p_reason,
      jsonb_build_object('permanent', p_permanent)
    );

    perform public.write_audit_log('dealer_withdrawn', 'profiles', p_profile_id,
      jsonb_build_object(
        'category', p_category,
        'dealer_identity_id', v_identity.id,
        'rejoin_blocked_until', v_block_until,
        'permanent', p_permanent
      ));
  exception
    when others then
      perform public.moto_disallow_profile_privileged_update();
      raise;
  end;
  perform public.moto_disallow_profile_privileged_update();

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_verify_dealer (062) — 他ユーザー profile 更新のためフラグを使用
-- ---------------------------------------------------------------------------
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

  perform public.moto_allow_profile_privileged_update();
  begin
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
  exception
    when others then
      perform public.moto_disallow_profile_privileged_update();
      raise;
  end;
  perform public.moto_disallow_profile_privileged_update();

  perform public.write_audit_log('dealer_verification', 'profiles', p_profile_id,
    jsonb_build_object('status', p_status, 'account_status', v_account_status));

  select * into v_profile from public.profiles where id = p_profile_id;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 運営: 072 ガードにより RPC 失敗した加盟店の審査待ち修復
-- ---------------------------------------------------------------------------
create or replace function public.admin_repair_stuck_dealer_onboarding(
  p_profile_id uuid,
  p_record_policy_acceptances boolean default true,
  p_policy_accepted_at timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_body text;
  v_admin_link text;
  v_accepted_at timestamptz;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'profile not found'; end if;
  if v_profile.member_type <> 'dealer' then raise exception 'dealer only'; end if;
  if v_profile.antique_dealer_doc_path is null or v_profile.invoice_doc_path is null then
    raise exception 'missing membership documents';
  end if;

  v_accepted_at := coalesce(p_policy_accepted_at, v_profile.updated_at, now());

  if p_record_policy_acceptances then
    perform set_config('request.jwt.claim.sub', p_profile_id::text, true);
    perform public.record_policy_acceptance(
      'terms'::public.policy_type,
      'v1',
      'https://app.moto-hub.jp/terms'
    );
    perform public.record_policy_acceptance(
      'privacy'::public.policy_type,
      'v1',
      'https://app.moto-hub.jp/terms#privacy'
    );
    update public.policy_acceptances
    set accepted_at = v_accepted_at
    where user_id = p_profile_id
      and policy_version = 'v1'
      and policy_type in ('terms'::public.policy_type, 'privacy'::public.policy_type);
  end if;

  perform public.moto_allow_profile_privileged_update();
  begin
    update public.profiles
    set
      account_status = 'pending_review'::public.account_status,
      verification_status = 'pending'::public.verification_status,
      profile_completed = true,
      updated_at = now()
    where id = p_profile_id
    returning * into v_profile;

    perform public.ensure_dealer_identity_for_profile(p_profile_id);
    select * into v_profile from public.profiles where id = p_profile_id;
  exception
    when others then
      perform public.moto_disallow_profile_privileged_update();
      raise;
  end;
  perform public.moto_disallow_profile_privileged_update();

  v_admin_link := format('/admin/workspace?tab=members&focus=%s', v_profile.id);
  v_body := format(
    E'店舗: %s\n屋号: %s\n古物商: %s\n担当: %s\n電話: %s\nメール: %s',
    coalesce(v_profile.store_name, '—'),
    coalesce(v_profile.trade_name, '—'),
    coalesce(v_profile.antique_dealer_number, '—'),
    coalesce(v_profile.contact_name, '—'),
    coalesce(v_profile.phone, '—'),
    coalesce(v_profile.email, '—')
  );

  begin
    perform public.notify_enqueue(
      'dealer.membership_submitted',
      jsonb_build_object('body', v_body, 'admin_link', v_admin_link),
      'profiles',
      v_profile.id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_all_admins(
      '【運営】新規加盟審査の申請',
      v_body,
      'important',
      v_admin_link,
      'profiles',
      v_profile.id
    );
  exception when others then null;
  end;

  perform public.write_audit_log(
    'dealer_onboarding_repair',
    'profiles',
    p_profile_id,
    jsonb_build_object(
      'reason', '072_profile_guard_blocked_complete_dealer_onboarding',
      'policy_backfill', p_record_policy_acceptances,
      'policy_accepted_at', v_accepted_at,
      'note', '運営修復: ユーザーは次回ログイン時に規約表示を確認推奨'
    )
  );

  return v_profile;
end;
$$;

grant execute on function public.admin_repair_stuck_dealer_onboarding(uuid, boolean, timestamptz) to authenticated;

-- 対象ユーザー修復（2026-05-31 提出試行・Storage 済み）
do $$
declare
  v_admin_id uuid;
begin
  select p.id into v_admin_id
  from public.profiles p
  where p.is_active = true
    and (p.is_admin = true or p.member_type = 'staff')
  order by p.is_admin desc, p.created_at
  limit 1;

  if v_admin_id is null then
    raise exception 'no admin profile for onboarding repair';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform public.admin_repair_stuck_dealer_onboarding(
    'cff93e3f-bf9e-42bc-bb16-348e29a2e9fe'::uuid,
    true,
    '2026-05-31 08:37:48.188194+00'::timestamptz
  );
end;
$$;
