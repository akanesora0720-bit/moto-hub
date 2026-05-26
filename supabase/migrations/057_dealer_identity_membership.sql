-- 退会・再加盟・trust引継ぎ: dealer_identity（事業実体）単位の信用管理

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'membership_status') then
    create type public.membership_status as enum ('active', 'withdrawn', 'suspended');
  end if;
  if not exists (select 1 from pg_type where typname = 'withdraw_category') then
    create type public.withdraw_category as enum ('normal', 'trust_violation', 'forced');
  end if;
  if not exists (select 1 from pg_type where typname = 'membership_event_type') then
    create type public.membership_event_type as enum (
      'joined',
      'withdrawn',
      'forced_withdrawn',
      'rejoined',
      'rejoin_denied',
      'trust_inherited',
      'identity_matched'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- dealer_identities: 店舗・事業実体（trust の正）
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_identities (
  id uuid primary key default gen_random_uuid(),
  antique_dealer_number text,
  invoice_number text,
  representative_name text,
  store_address text,
  phone text,
  antique_dealer_number_norm text,
  invoice_number_norm text,
  representative_name_norm text,
  store_address_norm text,
  phone_norm text,
  bank_fingerprint text,
  trust_score int not null default 100 check (trust_score >= 0 and trust_score <= 100),
  trust_rank public.trust_rank not null default 'GOLD',
  is_permanently_banned boolean not null default false,
  ban_reason text,
  rejoin_blocked_until timestamptz,
  last_withdraw_category public.withdraw_category,
  withdraw_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dealer_identities_antique_norm_idx
  on public.dealer_identities (antique_dealer_number_norm)
  where antique_dealer_number_norm is not null;
create index if not exists dealer_identities_invoice_norm_idx
  on public.dealer_identities (invoice_number_norm)
  where invoice_number_norm is not null;
create index if not exists dealer_identities_bank_fp_idx
  on public.dealer_identities (bank_fingerprint)
  where bank_fingerprint is not null;
create index if not exists dealer_identities_phone_norm_idx
  on public.dealer_identities (phone_norm)
  where phone_norm is not null;

drop trigger if exists dealer_identities_set_updated_at on public.dealer_identities;
create trigger dealer_identities_set_updated_at
  before update on public.dealer_identities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles: identity link + membership
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists dealer_identity_id uuid references public.dealer_identities (id) on delete set null,
  add column if not exists membership_status public.membership_status not null default 'active',
  add column if not exists withdrawn_at timestamptz;

create index if not exists profiles_dealer_identity_idx
  on public.profiles (dealer_identity_id)
  where dealer_identity_id is not null;

-- ---------------------------------------------------------------------------
-- membership events (退会・再加盟・判定)
-- ---------------------------------------------------------------------------
create table if not exists public.dealer_membership_events (
  id uuid primary key default gen_random_uuid(),
  dealer_identity_id uuid references public.dealer_identities (id) on delete set null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_type public.membership_event_type not null,
  withdraw_category public.withdraw_category,
  trust_score_at_event int,
  rejoin_blocked_until timestamptz,
  note text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dealer_membership_events_identity_idx
  on public.dealer_membership_events (dealer_identity_id, created_at desc);
create index if not exists dealer_membership_events_profile_idx
  on public.dealer_membership_events (profile_id, created_at desc);

alter table public.dealer_identities enable row level security;
alter table public.dealer_membership_events enable row level security;

drop policy if exists dealer_identities_admin on public.dealer_identities;
create policy dealer_identities_admin on public.dealer_identities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists dealer_membership_events_admin on public.dealer_membership_events;
create policy dealer_membership_events_admin on public.dealer_membership_events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists dealer_membership_events_own on public.dealer_membership_events;
create policy dealer_membership_events_own on public.dealer_membership_events
  for select to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Normalization helpers
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone_text(p_input text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_input, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.normalize_address_text(p_input text)
returns text
language sql
immutable
as $$
  select nullif(
    upper(
      regexp_replace(
        regexp_replace(trim(coalesce(p_input, '')), '[\s　]+', '', 'g'),
        '[‐‑‒–—−ー－]', '-', 'g'
      )
    ),
    ''
  );
$$;

create or replace function public.compute_bank_fingerprint(
  p_bank_name text,
  p_branch text,
  p_account_type text,
  p_account_number text,
  p_holder text
)
returns text
language sql
immutable
as $$
  select encode(
    digest(
      upper(
        coalesce(public.normalize_identifier_text(p_bank_name), '') || '|' ||
        coalesce(public.normalize_identifier_text(p_branch), '') || '|' ||
        coalesce(public.normalize_identifier_text(p_account_type), '') || '|' ||
        coalesce(public.normalize_phone_text(p_account_number), '') || '|' ||
        coalesce(public.normalize_identifier_text(p_holder), '')
      ),
      'sha256'
    ),
    'hex'
  );
$$;

-- ---------------------------------------------------------------------------
-- Sync trust: identity ↔ active profile
-- ---------------------------------------------------------------------------
create or replace function public.sync_dealer_identity_trust_to_profile(p_identity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity public.dealer_identities%rowtype;
begin
  select * into v_identity from public.dealer_identities where id = p_identity_id;
  if not found then return; end if;

  update public.profiles
  set trust_score = v_identity.trust_score,
      updated_at = now()
  where dealer_identity_id = p_identity_id
    and membership_status = 'active'
    and is_active = true;
end;
$$;

create or replace function public.sync_profile_trust_to_identity(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if not found or v_profile.dealer_identity_id is null then return; end if;

  update public.dealer_identities
  set trust_score = v_profile.trust_score,
      trust_rank = public.trust_rank_from_score(v_profile.trust_score),
      updated_at = now()
  where id = v_profile.dealer_identity_id;
end;
$$;

-- Patch penalty to identity trust
create or replace function public.apply_dealer_penalty(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_category public.penalty_category,
  p_complaint_id uuid default null,
  p_skip_admin_check boolean default false,
  p_deal_id uuid default null,
  p_dispute_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_old_score int;
  v_identity_id uuid;
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
  if v_row.id is null then raise exception 'dealer not found'; end if;
  v_old_score := v_row.trust_score;
  v_identity_id := v_row.dealer_identity_id;

  update public.profiles
  set trust_score = greatest(0, trust_score - p_points), last_penalty_at = now()
  where id = p_dealer_id returning * into v_row;

  if v_identity_id is not null then
    update public.dealer_identities
    set trust_score = v_row.trust_score,
        trust_rank = public.trust_rank_from_score(v_row.trust_score),
        updated_at = now()
    where id = v_identity_id;
  end if;

  insert into public.penalty_history (dealer_id, penalty_points, reason, category, complaint_id, created_by)
  values (p_dealer_id, p_points, trim(p_reason), p_category, p_complaint_id, auth.uid());

  insert into public.penalty_logs (user_id, reason, score_delta, deal_id, dispute_id, created_by)
  values (p_dealer_id, trim(p_reason), -p_points, p_deal_id, p_dispute_id, auth.uid());

  perform public.write_admin_action('penalty', p_dealer_id, trim(p_reason),
    jsonb_build_object('points', p_points, 'category', p_category, 'new_score', v_row.trust_score));
  perform public.write_audit_log('dealer_penalty', 'profiles', p_dealer_id,
    jsonb_build_object('points', p_points, 'reason', trim(p_reason), 'new_score', v_row.trust_score, 'dealer_identity_id', v_identity_id));

  perform public.notify_credit_badge_change(p_dealer_id, v_old_score, v_row.trust_score);
  perform public.notify_enqueue('credit.penalty',
    jsonb_build_object('body', format('-%s点: %s\n残り %s点', p_points, trim(p_reason), v_row.trust_score)),
    'profiles', p_dealer_id);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity matching
-- ---------------------------------------------------------------------------
create or replace function public.find_related_dealer_identities(
  p_antique text,
  p_invoice text,
  p_representative text,
  p_address text,
  p_phone text,
  p_bank_fp text
)
returns table (
  identity_id uuid,
  match_score int,
  match_reasons text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_antique text := public.normalize_identifier_text(p_antique);
  v_invoice text := public.normalize_identifier_text(p_invoice);
  v_rep text := public.normalize_identifier_text(p_representative);
  v_addr text := public.normalize_address_text(p_address);
  v_phone text := public.normalize_phone_text(p_phone);
begin
  return query
  select
    di.id,
    (
      case when v_antique is not null and di.antique_dealer_number_norm = v_antique then 100 else 0 end +
      case when v_invoice is not null and di.invoice_number_norm = v_invoice then 90 else 0 end +
      case when p_bank_fp is not null and di.bank_fingerprint = p_bank_fp then 85 else 0 end +
      case when v_phone is not null and v_rep is not null
        and di.phone_norm = v_phone and di.representative_name_norm = v_rep then 70 else 0 end +
      case when v_addr is not null and di.store_address_norm = v_addr then 60 else 0 end
    )::int as match_score,
    array_remove(array[
      case when v_antique is not null and di.antique_dealer_number_norm = v_antique then 'antique_dealer_number' end,
      case when v_invoice is not null and di.invoice_number_norm = v_invoice then 'invoice_number' end,
      case when p_bank_fp is not null and di.bank_fingerprint = p_bank_fp then 'bank_account' end,
      case when v_phone is not null and di.phone_norm = v_phone then 'phone' end,
      case when v_rep is not null and di.representative_name_norm = v_rep then 'representative_name' end,
      case when v_addr is not null and di.store_address_norm = v_addr then 'address' end
    ], null) as match_reasons
  from public.dealer_identities di
  where (
    (v_antique is not null and di.antique_dealer_number_norm = v_antique)
    or (v_invoice is not null and di.invoice_number_norm = v_invoice)
    or (p_bank_fp is not null and di.bank_fingerprint = p_bank_fp)
    or (v_phone is not null and di.phone_norm = v_phone)
    or (v_addr is not null and di.store_address_norm = v_addr)
  );
end;
$$;

create or replace function public.pick_best_dealer_identity(
  p_antique text,
  p_invoice text,
  p_representative text,
  p_address text,
  p_phone text,
  p_bank_fp text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_best uuid;
  v_score int := 0;
  r record;
begin
  for r in
    select * from public.find_related_dealer_identities(
      p_antique, p_invoice, p_representative, p_address, p_phone, p_bank_fp
    )
  loop
    if r.match_score > v_score then
      v_score := r.match_score;
      v_best := r.identity_id;
    end if;
  end loop;
  if v_score >= 60 then
    return v_best;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ensure / link identity on onboarding
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
  r record;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'profile not found'; end if;
  if v_profile.member_type <> 'dealer' then raise exception 'dealer only'; end if;

  v_bank_fp := public.compute_bank_fingerprint(
    v_profile.bank_name,
    v_profile.bank_branch,
    v_profile.bank_account_type,
    v_profile.bank_account_number,
    v_profile.bank_account_holder
  );

  if v_profile.dealer_identity_id is not null then
    select * into v_identity from public.dealer_identities where id = v_profile.dealer_identity_id;
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

    select r.match_score, r.match_reasons
    into v_match_score, v_match_reasons
    from public.find_related_dealer_identities(
      v_profile.antique_dealer_number,
      v_profile.invoice_number,
      v_profile.contact_name,
      v_profile.address,
      v_profile.phone,
      v_bank_fp
    ) r
    where r.identity_id = v_match_id
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

  return v_identity;
end;
$$;

grant execute on function public.ensure_dealer_identity_for_profile(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Withdraw
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

  return v_profile;
end;
$$;

create or replace function public.dealer_withdraw(p_reason text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_category public.withdraw_category := 'normal';
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.trust_score < 50 or v_profile.trust_rank = 'RED' then
    v_category := 'trust_violation';
  end if;

  return public._dealer_withdraw_core(auth.uid(), v_category, p_reason, false);
end;
$$;

grant execute on function public.dealer_withdraw(text) to authenticated;

create or replace function public.admin_dealer_withdraw(
  p_profile_id uuid,
  p_category public.withdraw_category,
  p_reason text default null,
  p_permanent boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return public._dealer_withdraw_core(p_profile_id, p_category, p_reason, p_permanent);
end;
$$;

grant execute on function public.admin_dealer_withdraw(uuid, public.withdraw_category, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin review payload
-- ---------------------------------------------------------------------------
create or replace function public.get_dealer_membership_review(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_bank_fp text;
  v_best record;
  v_prior_events int := 0;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_profile from public.profiles where id = p_profile_id;
  if not found then raise exception 'profile not found'; end if;

  v_bank_fp := public.compute_bank_fingerprint(
    v_profile.bank_name, v_profile.bank_branch, v_profile.bank_account_type,
    v_profile.bank_account_number, v_profile.bank_account_holder
  );

  select r.identity_id, r.match_score, r.match_reasons
  into v_best
  from public.find_related_dealer_identities(
    v_profile.antique_dealer_number,
    v_profile.invoice_number,
    v_profile.contact_name,
    v_profile.address,
    v_profile.phone,
    v_bank_fp
  ) r
  order by r.match_score desc
  limit 1;

  if v_best.identity_id is not null then
    select count(*)::int into v_prior_events
    from public.dealer_membership_events e
    where e.dealer_identity_id = v_best.identity_id
      and e.event_type in ('withdrawn', 'forced_withdrawn');
  end if;

  return jsonb_build_object(
    'profile_id', p_profile_id,
    'has_prior_membership', coalesce(v_prior_events, 0) > 0 or v_best.identity_id is not null,
    'trust_inherit_target', v_best.identity_id is not null and coalesce(v_best.match_score, 0) >= 60,
    'match_score', coalesce(v_best.match_score, 0),
    'match_reasons', coalesce(v_best.match_reasons, array[]::text[]),
    'matched_identity_id', v_best.identity_id,
    'rejoin_blocked', (
      select coalesce(di.is_permanently_banned, false)
        or (di.rejoin_blocked_until is not null and di.rejoin_blocked_until > now())
      from public.dealer_identities di
      where di.id = v_best.identity_id
    ),
    'rejoin_blocked_until', (
      select di.rejoin_blocked_until from public.dealer_identities di where di.id = v_best.identity_id
    ),
    'is_permanently_banned', (
      select coalesce(di.is_permanently_banned, false) from public.dealer_identities di where di.id = v_best.identity_id
    ),
    'prior_withdraw_count', v_prior_events,
    'current_trust_score', v_profile.trust_score,
    'inherited_trust_score', (
      select di.trust_score from public.dealer_identities di where di.id = v_best.identity_id
    )
  );
end;
$$;

grant execute on function public.get_dealer_membership_review(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding completion (profile update + identity)
-- ---------------------------------------------------------------------------
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

grant execute on function public.complete_dealer_onboarding(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin verification (activate when allowed)
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
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.profiles
  set
    verification_status = p_status,
    verified_at = case when p_status = 'verified' then now() else null end,
    updated_at = now()
  where id = p_profile_id
  returning * into v_profile;

  if p_status = 'verified' and v_profile.member_type = 'dealer' then
    v_identity := public.ensure_dealer_identity_for_profile(p_profile_id);
    select * into v_profile from public.profiles where id = p_profile_id;

    if v_identity.is_permanently_banned
      or (v_identity.rejoin_blocked_until is not null and v_identity.rejoin_blocked_until > now()) then
      update public.profiles
      set is_active = false, membership_status = 'suspended', updated_at = now()
      where id = p_profile_id
      returning * into v_profile;
    else
      update public.profiles
      set is_active = true, membership_status = 'active', updated_at = now()
      where id = p_profile_id
      returning * into v_profile;
    end if;
  end if;

  perform public.write_audit_log('dealer_verification', 'profiles', p_profile_id,
    jsonb_build_object('status', p_status));

  return v_profile;
end;
$$;

grant execute on function public.admin_verify_dealer(uuid, public.verification_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill existing dealers
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id from public.profiles
    where member_type = 'dealer'
      and dealer_identity_id is null
      and antique_dealer_number is not null
  loop
    begin
      perform public.ensure_dealer_identity_for_profile(r.id);
    exception when others then
      null;
    end;
  end loop;
end;
$$;
