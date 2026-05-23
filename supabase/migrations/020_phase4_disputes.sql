-- Phase4: 業販市場型 dispute / penalty_logs / 信用バンド更新 / 加盟店統計

do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_category') then
    create type public.dispute_category as enum (
      'doc_delay', 'transfer_delay', 'false_claim', 'defect', 'no_contact', 'fraud'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'dispute_status') then
    create type public.dispute_status as enum (
      'open', 'reviewing', 'resolved', 'rejected'
    );
  end if;
end
$$;

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid not null references public.profiles (id) on delete cascade,
  category public.dispute_category not null,
  message text not null check (char_length(trim(message)) >= 10),
  images jsonb not null default '[]'::jsonb,
  status public.dispute_status not null default 'open',
  resolution text,
  penalty_points int,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists disputes_deal_idx on public.disputes (deal_id, created_at desc);
create index if not exists disputes_status_idx on public.disputes (status, created_at desc);
create index if not exists disputes_target_idx on public.disputes (target_user_id, created_at desc);

create table if not exists public.penalty_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(trim(reason)) >= 3),
  score_delta int not null check (score_delta < 0 and score_delta >= -100),
  deal_id uuid references public.deals (id) on delete set null,
  dispute_id uuid references public.disputes (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists penalty_logs_user_idx
  on public.penalty_logs (user_id, created_at desc);

insert into public.penalty_logs (user_id, reason, score_delta, created_by, created_at)
select ph.dealer_id, ph.reason, -ph.penalty_points, ph.created_by, ph.created_at
from public.penalty_history ph
where not exists (
  select 1 from public.penalty_logs pl
  where pl.user_id = ph.dealer_id and pl.created_at = ph.created_at and pl.reason = ph.reason
);

create or replace function public.trust_rank_from_score(p_score int)
returns public.trust_rank
language sql
immutable
as $$
  select case
    when p_score >= 90 then 'GOLD'::public.trust_rank
    when p_score >= 70 then 'BLUE'::public.trust_rank
    when p_score >= 40 then 'YELLOW'::public.trust_rank
    else 'RED'::public.trust_rank
  end;
$$;

create or replace function public.dispute_default_penalty(p_category public.dispute_category)
returns int
language sql
immutable
as $$
  select case p_category
    when 'doc_delay' then 10
    when 'transfer_delay' then 10
    when 'false_claim' then 30
    when 'defect' then 15
    when 'no_contact' then 10
    when 'fraud' then 50
    else 10
  end;
$$;

create or replace function public.dispute_category_to_penalty_cat(p_category public.dispute_category)
returns public.penalty_category
language sql
immutable
as $$
  select case p_category
    when 'fraud' then 'severe'::public.penalty_category
    when 'false_claim' then 'severe'::public.penalty_category
    when 'defect' then 'moderate'::public.penalty_category
    else 'moderate'::public.penalty_category
  end;
$$;

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
  values (p_dealer_id, p_points, trim(p_reason), p_category, p_complaint_id, auth.uid());

  insert into public.penalty_logs (user_id, reason, score_delta, deal_id, dispute_id, created_by)
  values (p_dealer_id, trim(p_reason), -p_points, p_deal_id, p_dispute_id, auth.uid());

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

create or replace function public.submit_dispute(
  p_deal_id uuid,
  p_category public.dispute_category,
  p_message text,
  p_images jsonb default '[]'::jsonb
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_target uuid;
  v_row public.disputes;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'message too short';
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;

  if v_deal.status not in ('funded', 'handover_done', 'transfer_pending', 'payout_ready', 'payout_done', 'completed', 'dispute') then
    raise exception 'dispute not allowed at this deal stage';
  end if;

  if auth.uid() = v_deal.buyer_id then
    v_target := v_deal.seller_id;
  elsif auth.uid() = v_deal.seller_id then
    v_target := v_deal.buyer_id;
  else
    raise exception 'only deal parties can file dispute';
  end if;

  insert into public.disputes (deal_id, reporter_id, target_user_id, category, message, images)
  values (p_deal_id, auth.uid(), v_target, p_category, trim(p_message), coalesce(p_images, '[]'::jsonb))
  returning * into v_row;

  perform public.notify_enqueue('dispute.created',
    jsonb_build_object('body', format('dispute %s / %s', v_row.id, p_category)),
    'disputes', v_row.id);

  return v_row;
end;
$$;

grant execute on function public.submit_dispute(uuid, public.dispute_category, text, jsonb) to authenticated;

create or replace function public.admin_set_dispute_status(
  p_dispute_id uuid,
  p_status public.dispute_status,
  p_resolution text default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.disputes;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.disputes
  set
    status = p_status,
    resolution = coalesce(trim(p_resolution), resolution),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_dispute_id
  returning * into v_row;

  if v_row.id is null then raise exception 'dispute not found'; end if;
  return v_row;
end;
$$;

grant execute on function public.admin_set_dispute_status(uuid, public.dispute_status, text) to authenticated;

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
    v_d.id
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

  perform public.write_audit_log('dispute_resolved', 'disputes', p_dispute_id,
    jsonb_build_object('penalty', p_penalty_points, 'target', v_d.target_user_id));

  return v_d;
end;
$$;

grant execute on function public.admin_resolve_dispute_with_penalty(uuid, int, text) to authenticated;

create or replace function public.admin_reject_dispute(p_dispute_id uuid, p_resolution text)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.disputes;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.disputes
  set status = 'rejected', resolution = trim(p_resolution),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_dispute_id and status not in ('resolved', 'rejected')
  returning * into v_row;
  if v_row.id is null then raise exception 'dispute not found or closed'; end if;
  return v_row;
end;
$$;

grant execute on function public.admin_reject_dispute(uuid, text) to authenticated;

create or replace function public.get_dealer_dashboard_stats(p_dealer_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(p_dealer_id, auth.uid());
  v_listings int;
  v_completed int;
  v_inspected int;
  v_avg_price numeric;
  v_avg_days numeric;
  v_monthly_sales bigint;
  v_total_deals int;
begin
  if v_id is null then raise exception 'login required'; end if;
  if v_id <> auth.uid() and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select count(*) into v_listings
  from public.listings where seller_id = v_id and status <> 'removed';

  select count(*) into v_completed
  from public.deals
  where seller_id = v_id and status = 'completed';

  select count(*) into v_inspected
  from public.listings
  where seller_id = v_id and status <> 'removed' and inspection_status = true;

  select coalesce(avg(agreed_price_ex_tax), 0) into v_avg_price
  from public.deals
  where seller_id = v_id and status = 'completed';

  select coalesce(avg(
    extract(epoch from (coalesce(d.completed_at, d.updated_at) - l.created_at)) / 86400.0
  ), 0) into v_avg_days
  from public.deals d
  join public.listings l on l.id = d.listing_id
  where d.seller_id = v_id and d.status = 'completed';

  select coalesce(sum(agreed_price_ex_tax), 0) into v_monthly_sales
  from public.deals
  where seller_id = v_id and status = 'completed'
    and completed_at >= date_trunc('month', now());

  select count(*) into v_total_deals
  from public.deals where seller_id = v_id;

  return jsonb_build_object(
    'listing_count', v_listings,
    'completed_count', v_completed,
    'completion_rate', case when v_listings > 0 then round((v_completed::numeric / v_listings) * 100, 1) else 0 end,
    'avg_completed_price', round(v_avg_price),
    'inspected_count', v_inspected,
    'avg_listing_days', round(v_avg_days, 1),
    'monthly_sales_ex_tax', v_monthly_sales
  );
end;
$$;

grant execute on function public.get_dealer_dashboard_stats(uuid) to authenticated;

insert into public.notification_templates (event_type, subject_template, body_template) values
  ('dispute.created', '[MotoHub] 新規dispute', '取引トラブル申告が届きました。\n\n{{body}}')
on conflict (event_type) do update
set subject_template = excluded.subject_template, body_template = excluded.body_template;

-- RLS
alter table public.disputes enable row level security;
alter table public.penalty_logs enable row level security;

create policy disputes_party_select on public.disputes for select to authenticated
  using (
    public.is_admin()
    or reporter_id = auth.uid()
    or target_user_id = auth.uid()
  );

create policy disputes_insert on public.disputes for insert to authenticated
  with check (reporter_id = auth.uid());

create policy disputes_admin_all on public.disputes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy penalty_logs_self on public.penalty_logs for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

create policy penalty_logs_admin on public.penalty_logs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
