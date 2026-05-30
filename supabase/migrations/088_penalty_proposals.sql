-- 減点候補キュー + 運営審査 + 事後復元（trust_score を戻す）

do $$
begin
  if not exists (select 1 from pg_type where typname = 'penalty_proposal_status') then
    create type public.penalty_proposal_status as enum (
      'pending',
      'approved',
      'waived',
      'reduced',
      'deferred'
    );
  end if;
end
$$;

create table if not exists public.penalty_proposals (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.profiles (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  source text not null,
  source_ref jsonb not null default '{}'::jsonb,
  proposed_points int not null check (proposed_points > 0 and proposed_points <= 100),
  proposed_reason text not null,
  auto_rule text not null,
  status public.penalty_proposal_status not null default 'pending',
  final_points int check (final_points is null or (final_points > 0 and final_points <= 100)),
  admin_note text,
  deferred_until date,
  penalty_log_id uuid references public.penalty_logs (id) on delete set null,
  penalty_history_id uuid references public.penalty_history (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists penalty_proposals_active_source_uidx
  on public.penalty_proposals (source, source_ref)
  where status in ('pending', 'deferred', 'approved');

create index if not exists penalty_proposals_pending_idx
  on public.penalty_proposals (status, created_at desc)
  where status = 'pending';

create index if not exists penalty_proposals_dealer_idx
  on public.penalty_proposals (dealer_id, created_at desc);

comment on table public.penalty_proposals is
  '期限超過等の減点候補。承認後に apply_dealer_penalty。免除・事後復元で trust_score を戻せる。';

alter table public.penalty_proposals enable row level security;

drop policy if exists penalty_proposals_admin on public.penalty_proposals;
create policy penalty_proposals_admin on public.penalty_proposals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists penalty_proposals_updated_at on public.penalty_proposals;
create trigger penalty_proposals_updated_at
  before update on public.penalty_proposals
  for each row execute function public.set_updated_at();

alter table public.penalty_logs
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reversal_note text;

comment on column public.penalty_logs.reversed_at is '運営による減点取り消し（事後復元）日時';

-- ---------------------------------------------------------------------------
-- Trust score 加算（減点取り消し・調整）
-- ---------------------------------------------------------------------------
create or replace function public.apply_trust_credit_adjustment(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_deal_id uuid default null,
  p_note text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_old_score int;
  v_new_score int;
  v_identity_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_points is null or p_points <= 0 or p_points > 100 then
    raise exception 'invalid adjustment points';
  end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'reason required'; end if;

  select * into v_row from public.profiles where id = p_dealer_id for update;
  if v_row.id is null then raise exception 'dealer not found'; end if;

  v_old_score := v_row.trust_score;
  v_new_score := least(100, v_row.trust_score + p_points);
  v_identity_id := v_row.dealer_identity_id;

  update public.profiles
  set
    trust_score = v_new_score,
    trust_rank = public.trust_rank_from_score(v_new_score)
  where id = p_dealer_id
  returning * into v_row;

  if v_identity_id is not null then
    update public.dealer_identities
    set trust_score = v_row.trust_score, trust_rank = v_row.trust_rank, updated_at = now()
    where id = v_identity_id;
  end if;

  insert into public.penalty_logs (
    user_id, reason, score_delta, deal_id, created_by, penalty_source
  )
  values (
    p_dealer_id,
    trim(p_reason),
    p_points,
    p_deal_id,
    auth.uid(),
    'manual_penalty'
  );

  perform public.write_admin_action(
    'penalty_restore', p_dealer_id, trim(p_reason),
    jsonb_build_object('points', p_points, 'old_score', v_old_score, 'new_score', v_new_score, 'note', p_note)
  );
  perform public.write_audit_log(
    'dealer_penalty_restore', 'profiles', p_dealer_id,
    jsonb_build_object('points', p_points, 'reason', trim(p_reason), 'note', p_note, 'new_score', v_new_score)
  );

  perform public.notify_credit_badge_change(p_dealer_id, v_old_score, v_row.trust_score);

  return v_row;
end;
$$;

grant execute on function public.apply_trust_credit_adjustment(uuid, int, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 事後復元: 既存 penalty_log を取り消し
-- ---------------------------------------------------------------------------
create or replace function public.admin_restore_penalty(
  p_penalty_log_id uuid,
  p_note text default null,
  p_points int default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log public.penalty_logs%rowtype;
  v_points int;
  v_reason text;
  v_proposal public.penalty_proposals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_log from public.penalty_logs where id = p_penalty_log_id for update;
  if v_log.id is null then raise exception 'penalty log not found'; end if;
  if v_log.reversed_at is not null then raise exception 'already reversed'; end if;
  if coalesce(v_log.score_delta, 0) >= 0 then
    raise exception 'not a penalty entry';
  end if;

  v_points := coalesce(nullif(p_points, 0), abs(v_log.score_delta));
  if v_points <= 0 or v_points > 100 then raise exception 'invalid restore points'; end if;

  v_reason := format('【減点取り消し】%s', v_log.reason);

  perform public.apply_trust_credit_adjustment(
    v_log.user_id, v_points, v_reason, v_log.deal_id, p_note
  );

  update public.penalty_logs
  set reversed_at = now(), reversed_by = auth.uid(), reversal_note = nullif(trim(p_note), '')
  where id = p_penalty_log_id;

  select * into v_proposal
  from public.penalty_proposals
  where penalty_log_id = p_penalty_log_id
  limit 1;

  if v_proposal.id is not null then
    update public.penalty_proposals
    set status = 'waived', admin_note = coalesce(nullif(trim(p_note), ''), admin_note),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_proposal.id;
  end if;

  return (
    select p from public.profiles p where p.id = v_log.user_id
  );
end;
$$;

grant execute on function public.admin_restore_penalty(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 減点候補の作成
-- ---------------------------------------------------------------------------
create or replace function public.create_penalty_proposal(
  p_dealer_id uuid,
  p_deal_id uuid,
  p_source text,
  p_source_ref jsonb,
  p_proposed_points int,
  p_proposed_reason text,
  p_auto_rule text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_deferred boolean;
begin
  if p_proposed_points is null or p_proposed_points <= 0 then
    return null;
  end if;

  select exists (
    select 1 from public.penalty_proposals pp
    where pp.source = p_source
      and pp.source_ref = p_source_ref
      and pp.status = 'deferred'
      and pp.deferred_until is not null
      and pp.deferred_until >= (now() at time zone 'Asia/Tokyo')::date
  ) into v_deferred;
  if v_deferred then return null; end if;

  insert into public.penalty_proposals (
    dealer_id, deal_id, source, source_ref,
    proposed_points, proposed_reason, auto_rule, status
  )
  values (
    p_dealer_id, p_deal_id, p_source, coalesce(p_source_ref, '{}'::jsonb),
    p_proposed_points, trim(p_proposed_reason), trim(p_auto_rule), 'pending'
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    begin
      perform public.notify_all_admins(
        '【運営】減点候補（要審査）',
        format('%s\n-%s点: %s', p_auto_rule, p_proposed_points, p_proposed_reason),
        'important',
        '/admin/credit?tab=penalties',
        'penalty_proposals',
        v_id
      );
    exception when others then null;
    end;

    begin
      perform public.notify_enqueue(
        'penalty.proposal_pending',
        jsonb_build_object(
          'body', format('%s\n-%s点\n%s', p_auto_rule, p_proposed_points, p_proposed_reason),
          'admin_link', '/admin/credit?tab=penalties'
        ),
        'penalty_proposals',
        v_id
      );
    exception when others then null;
    end;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 運営審査（承認・軽減・免除・延期）+ 承認済みの事後免除は復元
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_penalty_proposal(
  p_proposal_id uuid,
  p_action text,
  p_final_points int default null,
  p_note text default null,
  p_deferred_until date default null
)
returns public.penalty_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.penalty_proposals%rowtype;
  v_points int;
  v_profile public.profiles;
  v_hist uuid;
  v_log uuid;
  v_reason text;
  v_ref jsonb;
  v_deal uuid;
  v_date date;
  v_kind text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select * into v_p from public.penalty_proposals where id = p_proposal_id for update;
  if v_p.id is null then raise exception 'proposal not found'; end if;

  if p_action = 'waive' and v_p.status in ('approved', 'reduced') and v_p.penalty_log_id is not null then
    perform public.admin_restore_penalty(v_p.penalty_log_id, coalesce(p_note, '運営免除（事後）'));
    update public.penalty_proposals
    set status = 'waived', admin_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_proposal_id;
    select * into v_p from public.penalty_proposals where id = p_proposal_id;
    return v_p;
  end if;

  if v_p.status not in ('pending', 'deferred') then
    raise exception 'proposal not open for review (status=%)', v_p.status;
  end if;

  if p_action = 'defer' then
    if p_deferred_until is null then raise exception 'deferred_until required'; end if;
    update public.penalty_proposals
    set status = 'deferred', deferred_until = p_deferred_until,
        admin_note = nullif(trim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_proposal_id;
    select * into v_p from public.penalty_proposals where id = p_proposal_id;
    return v_p;
  end if;

  if p_action = 'waive' then
    update public.penalty_proposals
    set status = 'waived', admin_note = nullif(trim(p_note), ''),
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_proposal_id;
    perform public.write_audit_log('penalty_proposal_waived', 'penalty_proposals', p_proposal_id,
      jsonb_build_object('note', p_note));
    select * into v_p from public.penalty_proposals where id = p_proposal_id;
    return v_p;
  end if;

  if p_action not in ('approve', 'reduce') then
    raise exception 'invalid action';
  end if;

  v_points := case
    when p_action = 'reduce' then coalesce(nullif(p_final_points, 0), v_p.proposed_points)
    else v_p.proposed_points
  end;
  if v_points <= 0 or v_points > 100 then raise exception 'invalid final points'; end if;
  if p_action = 'reduce' and v_points > v_p.proposed_points then
    raise exception 'reduced points cannot exceed proposed';
  end if;

  v_reason := v_p.proposed_reason;
  if p_action = 'reduce' and v_points < v_p.proposed_points then
    v_reason := format('%s（軽減: %s→%s点）', v_p.proposed_reason, v_p.proposed_points, v_points);
  end if;

  v_profile := public.apply_dealer_penalty(
    v_p.dealer_id, v_points, v_reason, 'moderate'::public.penalty_category,
    null, true, v_p.deal_id, null, 'auto_penalty'
  );

  select id into v_hist from public.penalty_history
  where dealer_id = v_p.dealer_id order by created_at desc limit 1;

  select id into v_log from public.penalty_logs
  where user_id = v_p.dealer_id order by created_at desc limit 1;

  v_ref := v_p.source_ref;
  v_deal := v_p.deal_id;

  if v_p.source = 'transfer_deadline' and v_deal is not null then
    v_date := (v_ref->>'penalty_date')::date;
    if v_date is not null then
      insert into public.transfer_deadline_penalty_applied (
        deal_id, penalty_date, penalty_points, penalty_history_id
      )
      values (v_deal, v_date, v_points, v_hist)
      on conflict (deal_id, penalty_date) do update
      set penalty_points = excluded.penalty_points, penalty_history_id = excluded.penalty_history_id;
    end if;
  elsif v_p.source = 'payment_deadline' and v_deal is not null then
    v_kind := v_ref->>'kind';
    v_date := (v_ref->>'penalty_date')::date;
    if v_kind is not null and v_date is not null then
      insert into public.payment_deadline_penalty_applied (
        deal_id, kind, penalty_date, penalty_points, penalty_history_id
      )
      values (v_deal, v_kind, v_date, v_points, v_hist)
      on conflict (deal_id, kind, penalty_date) do update
      set penalty_points = excluded.penalty_points, penalty_history_id = excluded.penalty_history_id;
    end if;
  end if;

  update public.penalty_proposals
  set
    status = case when p_action = 'reduce' then 'reduced'::public.penalty_proposal_status else 'approved'::public.penalty_proposal_status end,
    final_points = v_points,
    penalty_log_id = v_log,
    penalty_history_id = v_hist,
    admin_note = nullif(trim(p_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_proposal_id;

  perform public.write_audit_log('penalty_proposal_' || p_action, 'penalty_proposals', p_proposal_id,
    jsonb_build_object('points', v_points, 'note', p_note));

  select * into v_p from public.penalty_proposals where id = p_proposal_id;
  return v_p;
end;
$$;

grant execute on function public.admin_resolve_penalty_proposal(uuid, text, int, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 期限超過 → 候補作成（即減点しない）
-- ---------------------------------------------------------------------------
create or replace function public.apply_transfer_deadline_penalty(
  p_deal_id uuid,
  p_penalty_date date,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_exists boolean;
  v_ref jsonb;
  v_id uuid;
begin
  select exists (
    select 1 from public.transfer_deadline_penalty_applied
    where deal_id = p_deal_id and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  select seller_id into v_seller from public.deals where id = p_deal_id;
  if v_seller is null then return false; end if;

  v_ref := jsonb_build_object('deal_id', p_deal_id, 'penalty_date', p_penalty_date);

  v_id := public.create_penalty_proposal(
    v_seller, p_deal_id, 'transfer_deadline', v_ref, 5, p_reason, 'transfer_deadline_overdue'
  );

  return v_id is not null;
end;
$$;

create or replace function public.apply_payment_deadline_penalty(
  p_deal_id uuid,
  p_kind text,
  p_penalty_date date,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_ref jsonb;
  v_id uuid;
begin
  if p_kind not in ('vehicle_payment', 'platform_fee') then
    raise exception 'invalid penalty kind';
  end if;

  select exists (
    select 1 from public.payment_deadline_penalty_applied
    where deal_id = p_deal_id and kind = p_kind and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  v_ref := jsonb_build_object(
    'deal_id', p_deal_id, 'kind', p_kind, 'penalty_date', p_penalty_date
  );

  v_id := public.create_penalty_proposal(
    p_user_id, p_deal_id, 'payment_deadline', v_ref, 5, p_reason,
    case p_kind when 'vehicle_payment' then 'vehicle_payment_overdue' else 'platform_fee_overdue' end
  );

  return v_id is not null;
end;
$$;

-- 既存 waive RPC: 適用済みならスコア復元
create or replace function public.admin_waive_transfer_penalty(
  p_deal_id uuid,
  p_tier text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  for r in
    select t.penalty_history_id, pl.id as penalty_log_id
    from public.transfer_penalty_applied t
    left join public.penalty_history ph on ph.id = t.penalty_history_id
    left join public.penalty_logs pl on pl.user_id = ph.dealer_id
      and pl.created_at = ph.created_at and pl.reason = ph.reason
    where t.deal_id = p_deal_id and t.tier = p_tier and not t.waived
  loop
    if r.penalty_log_id is not null then
      perform public.admin_restore_penalty(r.penalty_log_id, p_note);
    end if;
  end loop;

  update public.transfer_penalty_applied
  set waived = true, waived_by = auth.uid(), waived_at = now()
  where deal_id = p_deal_id and tier = p_tier;

  perform public.write_audit_log('transfer_penalty_waived', 'deals', p_deal_id,
    jsonb_build_object('tier', p_tier, 'note', p_note));
end;
$$;

create or replace function public.admin_waive_payment_deadline_penalty(
  p_deal_id uuid,
  p_kind text,
  p_penalty_date date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select pl.id into v_log_id
  from public.payment_deadline_penalty_applied p
  join public.penalty_history ph on ph.id = p.penalty_history_id
  join public.penalty_logs pl on pl.user_id = ph.dealer_id and pl.reason = ph.reason
    and pl.created_at >= ph.created_at - interval '1 second'
    and pl.created_at <= ph.created_at + interval '1 second'
  where p.deal_id = p_deal_id and p.kind = p_kind and p.penalty_date = p_penalty_date
    and not p.waived and pl.score_delta < 0 and pl.reversed_at is null
  limit 1;

  if v_log_id is not null then
    perform public.admin_restore_penalty(v_log_id, p_note);
  end if;

  update public.payment_deadline_penalty_applied
  set waived = true, waived_by = auth.uid(), waived_at = now()
  where deal_id = p_deal_id and kind = p_kind and penalty_date = p_penalty_date;

  perform public.write_audit_log(
    'payment_deadline_penalty_waived', 'deals', p_deal_id,
    jsonb_build_object('kind', p_kind, 'penalty_date', p_penalty_date, 'note', p_note)
  );
end;
$$;

create or replace function public.admin_waive_transfer_deadline_penalty(
  p_deal_id uuid,
  p_penalty_date date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  select penalty_history_id into r
  from public.transfer_deadline_penalty_applied
  where deal_id = p_deal_id and penalty_date = p_penalty_date and not waived;

  if found and r.penalty_history_id is not null then
    perform public.admin_restore_penalty(
      (select pl.id from public.penalty_logs pl
       join public.penalty_history ph on ph.dealer_id = pl.user_id
         and ph.created_at = pl.created_at and ph.reason = pl.reason
       where ph.id = r.penalty_history_id limit 1),
      p_note
    );
  end if;

  update public.transfer_deadline_penalty_applied
  set waived = true, waived_by = auth.uid(), waived_at = now()
  where deal_id = p_deal_id and penalty_date = p_penalty_date;

  -- 対応する候補が pending なら免除
  update public.penalty_proposals
  set status = 'waived', admin_note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(), reviewed_at = now()
  where deal_id = p_deal_id
    and source = 'transfer_deadline'
    and source_ref @> jsonb_build_object('penalty_date', p_penalty_date)
    and status in ('pending', 'deferred');

  perform public.write_audit_log(
    'transfer_deadline_penalty_waived', 'deals', p_deal_id,
    jsonb_build_object('penalty_date', p_penalty_date, 'note', p_note)
  );
end;
$$;

grant execute on function public.admin_waive_transfer_deadline_penalty(uuid, date, text) to authenticated;

insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'penalty.proposal_pending',
  'email',
  '[MotoHub] 減点候補（運営審査）',
  '減点候補が作成されました。承認・免除・軽減・延期は管理画面の信用管理で行ってください。

{{body}}

{{admin_link}}',
  true
)
on conflict (event_type) do update
set subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    enabled = excluded.enabled;
