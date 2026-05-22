-- Phase: 運営自動化（通知基盤・名変自動減点・リスクフラグ）

-- ---------------------------------------------------------------------------
-- Notification enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('email', 'slack', 'discord', 'line');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pending', 'processing', 'sent', 'failed', 'cancelled');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------
create table if not exists public.notification_templates (
  event_type text primary key,
  channel public.notification_channel not null default 'email',
  subject_template text not null,
  body_template text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Queue + logs
-- ---------------------------------------------------------------------------
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  event_type text not null references public.notification_templates (event_type),
  channel public.notification_channel not null default 'email',
  payload jsonb not null default '{}'::jsonb,
  entity_type text,
  entity_id uuid,
  status public.notification_status not null default 'pending',
  retry_count int not null default 0,
  max_retries int not null default 5,
  next_retry_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists notification_queue_pending_idx
  on public.notification_queue (status, next_retry_at)
  where status in ('pending', 'failed');

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.notification_queue (id) on delete set null,
  event_type text not null,
  channel public.notification_channel not null,
  recipient text not null,
  subject text,
  body text,
  status public.notification_status not null,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_logs_created_idx
  on public.notification_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Transfer penalty dedup + manual waive
-- ---------------------------------------------------------------------------
create table if not exists public.transfer_penalty_applied (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  tier text not null check (tier in ('overdue_3d', 'overdue_7d', 'overdue_14d')),
  penalty_points int not null,
  waived boolean not null default false,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  penalty_history_id uuid references public.penalty_history (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint transfer_penalty_applied_unique unique (deal_id, tier)
);

-- ---------------------------------------------------------------------------
-- Risk flags
-- ---------------------------------------------------------------------------
create table if not exists public.risk_flags (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references public.profiles (id) on delete cascade,
  flag_type text not null,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  message text not null,
  entity_type text,
  entity_id uuid,
  resolved boolean not null default false,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists risk_flags_open_idx
  on public.risk_flags (resolved, created_at desc)
  where resolved = false;

-- ---------------------------------------------------------------------------
-- Enqueue helper
-- ---------------------------------------------------------------------------
create or replace function public.notify_enqueue(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_channel public.notification_channel default 'email'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (
    select 1 from public.notification_templates t
    where t.event_type = p_event_type and t.enabled
  ) then
    return null;
  end if;

  insert into public.notification_queue (event_type, channel, payload, entity_type, entity_id)
  values (p_event_type, p_channel, coalesce(p_payload, '{}'::jsonb), p_entity_type, p_entity_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed templates
-- ---------------------------------------------------------------------------
insert into public.notification_templates (event_type, subject_template, body_template) values
  ('inquiry.created', '[MotoHub] 新規問い合わせ', '新規問い合わせが届きました。\n\n{{body}}\n\n管理画面で確認してください。'),
  ('inquiry.closed', '[MotoHub] 問い合わせクローズ', '問い合わせをクローズしました。\n\n{{body}}'),
  ('deal.created', '[MotoHub] 取引作成', '取引が作成されました。\n\n{{body}}'),
  ('deal.funded', '[MotoHub] 入金確認', '取引が funded になりました。\n\n{{body}}'),
  ('deal.handover_done', '[MotoHub] 引渡完了', '引渡が完了しました。\n\n{{body}}'),
  ('deal.transfer_pending', '[MotoHub] 名変待ち', '名義変更待ちになりました。\n\n{{body}}'),
  ('deal.payout_ready', '[MotoHub] 振込準備完了', '双方確認済み・振込準備完了。\n\n{{body}}'),
  ('deal.payout_done', '[MotoHub] 振込完了', '振込完了。\n\n{{body}}'),
  ('deal.completed', '[MotoHub] 取引完了', '取引が完了しました。\n\n{{body}}'),
  ('transfer.due_soon', '[MotoHub] 名変期限3日前', '名変期限が近づいています。\n\n{{body}}'),
  ('transfer.due_today', '[MotoHub] 名変期限当日', '本日が名変期限です。\n\n{{body}}'),
  ('transfer.overdue', '[MotoHub] 名変期限超過', '名変期限を超過しました。\n\n{{body}}'),
  ('transfer.penalty_applied', '[MotoHub] 名変超過減点', '名変超過により自動減点しました。\n\n{{body}}'),
  ('transfer.review_required', '[MotoHub] 名変14日超過・要レビュー', '名変14日超過。運営レビューとYellow候補。\n\n{{body}}'),
  ('complaint.created', '[MotoHub] 新規クレーム', 'クレームが申請されました。\n\n{{body}}'),
  ('complaint.approved', '[MotoHub] クレーム承認', 'クレーム承認・減点実行。\n\n{{body}}'),
  ('complaint.rejected', '[MotoHub] クレーム却下', 'クレーム却下。\n\n{{body}}'),
  ('credit.badge_yellow', '[MotoHub] Yellow落ち', '加盟店がYellow帯に入りました。\n\n{{body}}'),
  ('credit.badge_red', '[MotoHub] Red落ち', '加盟店がRed帯に入りました。\n\n{{body}}'),
  ('credit.ban', '[MotoHub] BAN', '加盟店をBANしました。\n\n{{body}}'),
  ('credit.penalty', '[MotoHub] 信用減点', '信用減点が記録されました。\n\n{{body}}'),
  ('risk.detected', '[MotoHub] リスク検知', 'リスクフラグが発生しました。\n\n{{body}}')
on conflict (event_type) do update
set subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    enabled = excluded.enabled;

-- ---------------------------------------------------------------------------
-- Credit badge notifications (called from apply_dealer_penalty)
-- ---------------------------------------------------------------------------
create or replace function public.notify_credit_badge_change(
  p_dealer_id uuid,
  p_old_score int,
  p_new_score int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.trust_rank;
  v_new public.trust_rank;
  v_store text;
begin
  v_old := public.trust_rank_from_score(p_old_score);
  v_new := public.trust_rank_from_score(p_new_score);
  if v_old = v_new then return; end if;

  select coalesce(store_name, email) into v_store from public.profiles where id = p_dealer_id;

  if v_new = 'YELLOW' and v_old <> 'YELLOW' then
    perform public.notify_enqueue(
      'credit.badge_yellow',
      jsonb_build_object('body', format('店舗: %s\n旧: %s点(%s) → 新: %s点(%s)', v_store, p_old_score, v_old, p_new_score, v_new)),
      'profiles', p_dealer_id
    );
  end if;
  if v_new = 'RED' and v_old <> 'RED' then
    perform public.notify_enqueue(
      'credit.badge_red',
      jsonb_build_object('body', format('店舗: %s\n旧: %s点(%s) → 新: %s点(%s)', v_store, p_old_score, v_old, p_new_score, v_new)),
      'profiles', p_dealer_id
    );
  end if;
end;
$$;

-- Patch apply_dealer_penalty to notify
create or replace function public.apply_dealer_penalty(
  p_dealer_id uuid,
  p_points int,
  p_reason text,
  p_category public.penalty_category,
  p_complaint_id uuid default null,
  p_skip_admin_check boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
  v_old_score int;
  v_history_id uuid;
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

  update public.profiles
  set trust_score = greatest(0, trust_score - p_points), last_penalty_at = now()
  where id = p_dealer_id returning * into v_row;

  insert into public.penalty_history (dealer_id, penalty_points, reason, category, complaint_id, created_by)
  values (p_dealer_id, p_points, trim(p_reason), p_category, p_complaint_id, auth.uid())
  returning id into v_history_id;

  perform public.write_admin_action('penalty', p_dealer_id, trim(p_reason),
    jsonb_build_object('points', p_points, 'category', p_category, 'new_score', v_row.trust_score));
  perform public.write_audit_log('dealer_penalty', 'profiles', p_dealer_id,
    jsonb_build_object('points', p_points, 'reason', trim(p_reason), 'new_score', v_row.trust_score));
  perform public.notify_credit_badge_change(p_dealer_id, v_old_score, v_row.trust_score);
  perform public.notify_enqueue('credit.penalty',
    jsonb_build_object('body', format('-%s点: %s\n残り %s点', p_points, trim(p_reason), v_row.trust_score)),
    'profiles', p_dealer_id);

  return v_row;
end;
$$;
