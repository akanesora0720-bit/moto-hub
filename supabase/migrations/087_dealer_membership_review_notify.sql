-- 加盟店 onboarding 提出時: 運営メール（notification_queue）+ 管理画面 in-app 通知

insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'dealer.membership_submitted',
  'email',
  '[MotoHub] 新規加盟審査の申請',
  '新規の加盟店審査申請が届きました。

{{body}}

管理画面 → ワークスペース → 会員タブで審査してください。
{{admin_link}}',
  true
)
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

-- 運営スタッフ（member_type=staff）も in-app 通知対象に含める
create or replace function public.notify_all_admins(
  p_title text,
  p_body text,
  p_importance public.message_importance default 'important',
  p_link_url text default '/admin/workspace',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id
    from public.profiles
    where is_active = true
      and (is_admin = true or member_type = 'staff')
  loop
    begin
      perform public.insert_user_notification(
        r.id,
        trim(p_title),
        trim(p_body),
        p_importance,
        p_link_url,
        p_entity_type,
        p_entity_id
      );
    exception
      when others then
        raise notice 'notify_all_admins skip %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

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
