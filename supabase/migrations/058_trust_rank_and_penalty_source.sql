-- trust_rank 閾値変更（GOLD 80+ / BLUE 60–79 / YELLOW 40–59 / RED 0–39）
-- 自動減点 vs 手動減点の区分、期限超過は営業日ごとに -5

do $$
begin
  if not exists (select 1 from pg_type where typname = 'penalty_source') then
    create type public.penalty_source as enum ('auto_penalty', 'manual_penalty');
  end if;
end
$$;

create or replace function public.trust_rank_from_score(p_score int)
returns public.trust_rank
language sql
immutable
as $$
  select case
    when coalesce(p_score, 0) >= 80 then 'GOLD'::public.trust_rank
    when coalesce(p_score, 0) >= 60 then 'BLUE'::public.trust_rank
    when coalesce(p_score, 0) >= 40 then 'YELLOW'::public.trust_rank
    else 'RED'::public.trust_rank
  end;
$$;

alter table public.penalty_logs
  add column if not exists penalty_source public.penalty_source not null default 'manual_penalty';

alter table public.penalty_history
  add column if not exists penalty_source public.penalty_source not null default 'manual_penalty';

comment on column public.penalty_logs.penalty_source is 'auto_penalty=期限超過等の自動 / manual_penalty=運営裁量';
comment on column public.penalty_history.penalty_source is 'auto_penalty=期限超過等の自動 / manual_penalty=運営裁量';

-- 既存の自動減点らしき理由を auto に寄せる（推定）
update public.penalty_logs
set penalty_source = 'auto_penalty'
where penalty_source = 'manual_penalty'
  and (
    reason like '%期限超過%'
    or reason like '%入金期限%'
    or reason like '%手数料支払%'
    or reason like '%名変期限%'
    or reason like '%引渡%'
  );

update public.penalty_history ph
set penalty_source = 'auto_penalty'
from public.penalty_logs pl
where pl.user_id = ph.dealer_id
  and pl.created_at = ph.created_at
  and pl.reason = ph.reason
  and pl.penalty_source = 'auto_penalty';

create or replace function public.apply_dealer_penalty(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_category public.penalty_category,
  p_complaint_id uuid default null,
  p_skip_admin_check boolean default false,
  p_deal_id uuid default null,
  p_dispute_id uuid default null,
  p_penalty_source public.penalty_source default 'manual_penalty'
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
  v_source public.penalty_source := coalesce(p_penalty_source, 'manual_penalty');
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
  set
    trust_score = greatest(0, trust_score - p_points),
    trust_rank = public.trust_rank_from_score(greatest(0, trust_score - p_points)),
    last_penalty_at = now()
  where id = p_dealer_id
  returning * into v_row;

  if v_identity_id is not null then
    update public.dealer_identities
    set
      trust_score = v_row.trust_score,
      trust_rank = v_row.trust_rank,
      updated_at = now()
    where id = v_identity_id;
  end if;

  insert into public.penalty_history (
    dealer_id, penalty_points, reason, category, complaint_id, created_by, penalty_source
  )
  values (
    p_dealer_id, p_points, trim(p_reason), p_category, p_complaint_id, auth.uid(), v_source
  );

  insert into public.penalty_logs (
    user_id, reason, score_delta, deal_id, dispute_id, created_by, penalty_source
  )
  values (
    p_dealer_id, trim(p_reason), -p_points, p_deal_id, p_dispute_id, auth.uid(), v_source
  );

  perform public.write_admin_action(
    'penalty', p_dealer_id, trim(p_reason),
    jsonb_build_object(
      'points', p_points,
      'category', p_category,
      'new_score', v_row.trust_score,
      'penalty_source', v_source
    )
  );
  perform public.write_audit_log(
    'dealer_penalty', 'profiles', p_dealer_id,
    jsonb_build_object(
      'points', p_points,
      'reason', trim(p_reason),
      'new_score', v_row.trust_score,
      'dealer_identity_id', v_identity_id,
      'penalty_source', v_source
    )
  );

  perform public.notify_credit_badge_change(p_dealer_id, v_old_score, v_row.trust_score);
  perform public.notify_enqueue(
    'credit.penalty',
    jsonb_build_object(
      'body', format('-%s点: %s\n残り %s点', p_points, trim(p_reason), v_row.trust_score)
    ),
    'profiles', p_dealer_id
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
  return public.apply_dealer_penalty(
    p_dealer_id, p_points, p_reason, p_category,
    null, false, null, null, 'manual_penalty'
  );
end;
$$;

-- 入金期限超過（既存・auto 明示）
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
  v_hist uuid;
begin
  if p_kind not in ('vehicle_payment', 'platform_fee') then
    raise exception 'invalid penalty kind';
  end if;

  select exists (
    select 1 from public.payment_deadline_penalty_applied
    where deal_id = p_deal_id and kind = p_kind and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  perform public.apply_dealer_penalty(
    p_user_id, 5, p_reason, 'moderate'::public.penalty_category,
    null, true, p_deal_id, null, 'auto_penalty'
  );

  select id into v_hist
  from public.penalty_history
  where dealer_id = p_user_id
  order by created_at desc
  limit 1;

  insert into public.payment_deadline_penalty_applied (
    deal_id, kind, penalty_date, penalty_points, penalty_history_id
  )
  values (p_deal_id, p_kind, p_penalty_date, 5, v_hist);

  perform public.notify_enqueue(
    'payment.deadline_penalty',
    jsonb_build_object('body', format('取引 %s\n%s', p_deal_id, p_reason), 'kind', p_kind),
    'deals', p_deal_id
  );

  return true;
end;
$$;

-- 名変期限: 営業日ごと -5（旧 3日/7日ティア廃止）
create table if not exists public.transfer_deadline_penalty_applied (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  penalty_date date not null,
  penalty_points int not null default 5,
  penalty_history_id uuid references public.penalty_history (id) on delete set null,
  waived boolean not null default false,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (deal_id, penalty_date)
);

create index if not exists transfer_deadline_penalty_deal_idx
  on public.transfer_deadline_penalty_applied (deal_id, penalty_date);

alter table public.transfer_deadline_penalty_applied enable row level security;

drop policy if exists transfer_deadline_penalty_admin on public.transfer_deadline_penalty_applied;
create policy transfer_deadline_penalty_admin on public.transfer_deadline_penalty_applied
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
  v_hist uuid;
begin
  select exists (
    select 1 from public.transfer_deadline_penalty_applied
    where deal_id = p_deal_id and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  select seller_id into v_seller from public.deals where id = p_deal_id;
  if v_seller is null then return false; end if;

  perform public.apply_dealer_penalty(
    v_seller, 5, p_reason, 'moderate'::public.penalty_category,
    null, true, p_deal_id, null, 'auto_penalty'
  );

  select id into v_hist
  from public.penalty_history
  where dealer_id = v_seller
  order by created_at desc
  limit 1;

  insert into public.transfer_deadline_penalty_applied (
    deal_id, penalty_date, penalty_points, penalty_history_id
  )
  values (p_deal_id, p_penalty_date, 5, v_hist);

  perform public.notify_enqueue(
    'transfer.penalty_applied',
    jsonb_build_object('body', format('取引 %s\n%s', p_deal_id, p_reason)),
    'deals', p_deal_id
  );
  return true;
end;
$$;

create or replace function public.run_transfer_compliance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_day date;
  v_applied int := 0;
  v_overdue int := 0;
  v_review_14 int := 0;
  v_soon int := 0;
  v_today_notify int := 0;
  v_days numeric;
  v_reason text;
begin
  for r in
    select d.id, d.seller_id, d.transfer_deadline_at, l.maker, l.model
    from public.deals d
    join public.listings l on l.id = d.listing_id
    where d.status = 'transfer_pending'
      and d.requires_name_transfer = true
      and d.transfer_deadline_at is not null
  loop
    v_days := extract(epoch from (now() - r.transfer_deadline_at)) / 86400.0;

    if v_days < 0 and v_days >= -3 and not exists (
      select 1 from public.notification_queue nq
      where nq.event_type = 'transfer.due_soon' and nq.entity_id = r.id
        and nq.created_at > now() - interval '4 days'
    ) then
      perform public.notify_enqueue(
        'transfer.due_soon',
        jsonb_build_object(
          'body', format('%s %s 期限: %s', r.maker, r.model, r.transfer_deadline_at),
          'deal_id', r.id
        ),
        'deals', r.id
      );
      v_soon := v_soon + 1;
    end if;

    if v_days >= -1 and v_days < 0 and not exists (
      select 1 from public.notification_queue nq
      where nq.event_type = 'transfer.due_today' and nq.entity_id = r.id
        and nq.created_at > now() - interval '2 days'
    ) then
      perform public.notify_enqueue(
        'transfer.due_today',
        jsonb_build_object('body', format('%s %s', r.maker, r.model), 'deal_id', r.id),
        'deals', r.id
      );
      v_today_notify := v_today_notify + 1;
    end if;

    if public.count_overdue_business_days(r.transfer_deadline_at, v_today) <= 0 then
      continue;
    end if;

    update public.deals
    set
      transfer_overdue = true,
      transfer_overdue_notified_at = coalesce(transfer_overdue_notified_at, now())
    where id = r.id and not transfer_overdue;

    v_overdue := v_overdue + 1;

    perform public.notify_enqueue(
      'transfer.overdue',
      jsonb_build_object(
        'body', format('名変期限超過: %s %s', r.maker, r.model),
        'deal_id', r.id
      ),
      'deals', r.id
    );

    v_day := ((r.transfer_deadline_at at time zone 'Asia/Tokyo')::date) + 1;
    while v_day <= v_today loop
      if public.is_business_day(v_day) then
        v_reason := format('名義変更期限超過（%s %s）%s', r.maker, r.model, v_day);
        if public.apply_transfer_deadline_penalty(r.id, v_day, v_reason) then
          v_applied := v_applied + 1;
        end if;
      end if;
      v_day := v_day + 1;
    end loop;

    if v_days >= 14 and not exists (
      select 1 from public.transfer_penalty_applied
      where deal_id = r.id and tier = 'overdue_14d'
    ) then
      insert into public.transfer_penalty_applied (deal_id, tier, penalty_points, waived)
      values (r.id, 'overdue_14d', 0, false);
      insert into public.risk_flags (
        dealer_id, flag_type, severity, message, entity_type, entity_id
      )
      values (
        r.seller_id,
        'transfer_overdue_14d',
        'high',
        format('名変14日超過・要レビュー: %s %s', r.maker, r.model),
        'deals', r.id
      );
      perform public.notify_enqueue(
        'transfer.review_required',
        jsonb_build_object('body', format('14日超過 %s %s', r.maker, r.model), 'deal_id', r.id),
        'deals', r.id
      );
      v_review_14 := v_review_14 + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'overdue', v_overdue,
    'penalties_applied', v_applied,
    'due_soon', v_soon,
    'due_today', v_today_notify,
    'review_14d', v_review_14
  );
end;
$$;

-- dispute 解決時の減点は運営裁量（手動）
create or replace function public.admin_resolve_dispute_with_penalty(
  p_dispute_id uuid,
  p_penalty_points int,
  p_resolution text
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.disputes;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_penalty_points is null or p_penalty_points <= 0 or p_penalty_points > 100 then
    raise exception 'invalid penalty';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if v_d.id is null then raise exception 'dispute not found'; end if;
  if v_d.status in ('resolved', 'rejected') then raise exception 'already closed'; end if;

  v_reason := format('dispute(%s): %s', v_d.category, coalesce(trim(p_resolution), '運営判断'));

  perform public.apply_dealer_penalty(
    v_d.target_user_id,
    p_penalty_points,
    v_reason,
    public.dispute_category_to_penalty_cat(v_d.category),
    null,
    true,
    v_d.deal_id,
    v_d.id,
    'manual_penalty'
  );

  update public.disputes
  set
    status = 'resolved',
    resolution = trim(p_resolution),
    penalty_points = p_penalty_points,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_dispute_id
  returning * into v_d;

  perform public.write_audit_log(
    'dispute_resolved', 'disputes', p_dispute_id,
    jsonb_build_object('penalty', p_penalty_points, 'target', v_d.target_user_id)
  );

  return v_d;
end;
$$;

-- クレーム承認減点も手動
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
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v_c from public.complaints where id = p_complaint_id for update;
  if v_c.id is null then raise exception 'complaint not found'; end if;
  if v_c.status <> 'pending' then raise exception 'already reviewed'; end if;
  v_reason := format('クレーム承認: %s', v_c.complaint_type::text);
  perform public.apply_dealer_penalty(
    v_c.seller_id, v_c.penalty_score, v_reason,
    public.penalty_category_for_complaint(v_c.complaint_type),
    v_c.id, true, null, null, 'manual_penalty'
  );
  update public.complaints
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_complaint_id
  returning * into v_c;
  perform public.write_admin_action(
    'complaint_approved', v_c.seller_id, v_reason,
    jsonb_build_object('complaint_id', p_complaint_id, 'penalty', v_c.penalty_score)
  );
  perform public.notify_enqueue(
    'complaint.approved', jsonb_build_object('body', v_reason), 'complaints', p_complaint_id
  );
  return v_c;
end;
$$;

-- 閾値変更に伴い全員の trust_rank を再計算
update public.profiles
set trust_rank = public.trust_rank_from_score(trust_score)
where member_type = 'dealer';

update public.dealer_identities di
set
  trust_rank = public.trust_rank_from_score(di.trust_score),
  updated_at = now()
where exists (select 1 from public.profiles p where p.dealer_identity_id = di.id);
