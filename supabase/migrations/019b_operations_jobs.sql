-- 名変ジョブ・取引通知フック・連絡先RPC・リスクスキャン

-- 名変: 単一ティア減点（二重防止）
create or replace function public.apply_transfer_overdue_penalty(
  p_deal_id uuid,
  p_tier text,
  p_points int,
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
    select 1 from public.transfer_penalty_applied
    where deal_id = p_deal_id and tier = p_tier and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  select seller_id into v_seller from public.deals where id = p_deal_id;
  if v_seller is null then return false; end if;

  perform public.apply_dealer_penalty(v_seller, p_points, p_reason, 'moderate'::public.penalty_category, null, true);

  select id into v_hist from public.penalty_history
  where dealer_id = v_seller order by created_at desc limit 1;

  insert into public.transfer_penalty_applied (deal_id, tier, penalty_points, penalty_history_id)
  values (p_deal_id, p_tier, p_points, v_hist);

  perform public.notify_enqueue('transfer.penalty_applied',
    jsonb_build_object('body', format('取引 %s\n%s', p_deal_id, p_reason)),
    'deals', p_deal_id);
  return true;
end;
$$;

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
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.transfer_penalty_applied
  set waived = true, waived_by = auth.uid(), waived_at = now()
  where deal_id = p_deal_id and tier = p_tier;
  perform public.write_audit_log('transfer_penalty_waived', 'deals', p_deal_id,
    jsonb_build_object('tier', p_tier, 'note', p_note));
end;
$$;

grant execute on function public.admin_waive_transfer_penalty(uuid, text, text) to authenticated;

-- 日次: 名変通知 + 自動減点 + リスク（cron / API から service role で実行）
create or replace function public.run_transfer_compliance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_overdue int := 0;
  v_penalty_3 int := 0;
  v_penalty_7 int := 0;
  v_review_14 int := 0;
  v_soon int := 0;
  v_today int := 0;
  v_days numeric;
  v_body text;
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

    -- 期限3日前（未通知）
    if v_days < 0 and v_days >= -3 and not exists (
      select 1 from public.notification_queue nq
      where nq.event_type = 'transfer.due_soon' and nq.entity_id = r.id
        and nq.created_at > now() - interval '4 days'
    ) then
      v_body := format('%s %s 期限: %s', r.maker, r.model, r.transfer_deadline_at);
      perform public.notify_enqueue('transfer.due_soon',
        jsonb_build_object('body', v_body, 'deal_id', r.id), 'deals', r.id);
      v_soon := v_soon + 1;
    end if;

    -- 期限当日
    if v_days >= -1 and v_days < 0 and not exists (
      select 1 from public.notification_queue nq
      where nq.event_type = 'transfer.due_today' and nq.entity_id = r.id
        and nq.created_at > now() - interval '2 days'
    ) then
      perform public.notify_enqueue('transfer.due_today',
        jsonb_build_object('body', format('%s %s', r.maker, r.model), 'deal_id', r.id),
        'deals', r.id);
      v_today := v_today + 1;
    end if;

    if v_days < 0 then continue; end if;

    update public.deals
    set transfer_overdue = true,
        transfer_overdue_notified_at = coalesce(transfer_overdue_notified_at, now())
    where id = r.id and not transfer_overdue;

    v_overdue := v_overdue + 1;

    perform public.notify_enqueue('transfer.overdue',
      jsonb_build_object('body', format('超過 %.0f日: %s %s', v_days, r.maker, r.model), 'deal_id', r.id),
      'deals', r.id);

    if v_days >= 3 and public.apply_transfer_overdue_penalty(
      r.id, 'overdue_3d', 5,
      format('名変期限超過3日以上（%s %s）', r.maker, r.model)
    ) then v_penalty_3 := v_penalty_3 + 1; end if;

    if v_days >= 7 and public.apply_transfer_overdue_penalty(
      r.id, 'overdue_7d', 10,
      format('名変期限超過7日以上（%s %s）', r.maker, r.model)
    ) then v_penalty_7 := v_penalty_7 + 1; end if;

    if v_days >= 14 then
      if not exists (
        select 1 from public.transfer_penalty_applied where deal_id = r.id and tier = 'overdue_14d'
      ) then
        insert into public.transfer_penalty_applied (deal_id, tier, penalty_points, waived)
        values (r.id, 'overdue_14d', 0, false);
        insert into public.risk_flags (dealer_id, flag_type, severity, message, entity_type, entity_id)
        values (
          r.seller_id,
          'transfer_overdue_14d',
          'high',
          format('名変14日超過・要レビュー Yellow候補: %s %s', r.maker, r.model),
          'deals', r.id
        );
        perform public.notify_enqueue('transfer.review_required',
          jsonb_build_object('body', format('14日超過 %s %s', r.maker, r.model), 'deal_id', r.id),
          'deals', r.id);
        v_review_14 := v_review_14 + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'due_soon', v_soon,
    'due_today', v_today,
    'overdue', v_overdue,
    'penalty_3d', v_penalty_3,
    'penalty_7d', v_penalty_7,
    'review_14d', v_review_14
  );
end;
$$;

-- 取引ステータス通知
create or replace function public.notify_deal_status(p_deal_id uuid, p_status public.deal_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  v_event text;
  v_maker text;
  v_model text;
  v_price int;
begin
  select li.maker, li.model, d.agreed_price_ex_tax
  into v_maker, v_model, v_price
  from public.deals d
  join public.listings li on li.id = d.listing_id
  where d.id = p_deal_id;

  v_body := format('%s %s / %s円', v_maker, v_model, v_price);
  v_event := case p_status
    when 'funded' then 'deal.funded'
    when 'handover_done' then 'deal.handover_done'
    when 'transfer_pending' then 'deal.transfer_pending'
    when 'payout_ready' then 'deal.payout_ready'
    when 'payout_done' then 'deal.payout_done'
    when 'completed' then 'deal.completed'
    else null
  end;
  if v_event is not null then
    perform public.notify_enqueue(v_event, jsonb_build_object('body', v_body), 'deals', p_deal_id);
  end if;
end;
$$;

create or replace function public.admin_advance_deal(p_deal_id uuid, p_status public.deal_status)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;

  update public.deals
  set
    status = p_status,
    funded_at = case when p_status = 'funded' and funded_at is null then now() else funded_at end,
    payout_at = case when p_status = 'payout_done' and payout_at is null then now() else payout_at end,
    completed_at = case when p_status = 'completed' and completed_at is null then now() else completed_at end,
    buyer_confirmed_at = case when p_status in ('cancelled', 'dispute') then null else buyer_confirmed_at end,
    seller_confirmed_at = case when p_status in ('cancelled', 'dispute') then null else seller_confirmed_at end,
    updated_at = now()
  where id = p_deal_id returning * into v;

  if p_status = 'completed' then
    update public.listings set status = 'sold' where id = v.listing_id;
  end if;

  perform public.notify_deal_status(p_deal_id, p_status);
  return v;
end;
$$;

create or replace function public.deal_mark_handover(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_inspection text;
  v_requires boolean;
  v_next_status public.deal_status;
begin
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v.seller_id <> auth.uid() and not public.is_admin() then raise exception 'seller or admin only'; end if;
  if v.status <> 'funded' then raise exception 'status must be funded'; end if;

  select inspection_remaining into v_inspection from public.listings where id = v.listing_id;
  v_requires := coalesce(trim(v_inspection), '') <> '';
  v_next_status := case when v_requires then 'transfer_pending'::public.deal_status else 'handover_done'::public.deal_status end;

  update public.deals
  set
    handover_at = now(),
    requires_name_transfer = v_requires,
    transfer_deadline_at = case when v_requires then public.transfer_deadline_next_friday(now()) else null end,
    status = v_next_status,
    updated_at = now()
  where id = p_deal_id returning * into v;

  perform public.notify_deal_status(p_deal_id, v_next_status);
  return v;
end;
$$;

create or replace function public.admin_create_deal(
  p_listing_id uuid, p_buyer_id uuid, p_agreed_price_ex_tax int,
  p_inquiry_id uuid default null, p_initial_status public.deal_status default 'negotiating'
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select seller_id into v_seller from public.listings where id = p_listing_id;
  if not found then raise exception 'listing not found'; end if;

  insert into public.deals (listing_id, buyer_id, seller_id, agreed_price_ex_tax, status, inquiry_id)
  values (p_listing_id, p_buyer_id, v_seller, p_agreed_price_ex_tax, p_initial_status, p_inquiry_id)
  returning * into v;

  perform public.notify_enqueue('deal.created',
    jsonb_build_object('body', format('取引ID %s 価格 %s', v.id, p_agreed_price_ex_tax)),
    'deals', v.id);
  return v;
end;
$$;

-- deal_try_payout_ready notification
create or replace function public.deal_try_payout_ready(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  select * into v from public.deals where id = p_deal_id for update;
  if v.buyer_confirmed_at is null or v.seller_confirmed_at is null then return; end if;
  if v.status not in ('handover_done', 'transfer_pending') then return; end if;
  update public.deals set status = 'payout_ready', updated_at = now() where id = p_deal_id;
  perform public.notify_deal_status(p_deal_id, 'payout_ready');
end;
$$;

-- Inquiry triggers
create or replace function public.trg_inquiry_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text;
  l record;
begin
  if tg_op = 'INSERT' then
    select maker, model into l from public.listings where id = new.listing_id;
    v_body := format('車両: %s %s\n%s', l.maker, l.model, left(new.message, 500));
    perform public.notify_enqueue('inquiry.created', jsonb_build_object('body', v_body), 'inquiries', new.id);
  elsif tg_op = 'UPDATE' and old.status = 'open' and new.status = 'closed' then
    perform public.notify_enqueue('inquiry.closed',
      jsonb_build_object('body', format('問い合わせ %s をクローズ', new.id)),
      'inquiries', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists inquiries_notify on public.inquiries;
create trigger inquiries_notify
  after insert or update of status on public.inquiries
  for each row execute function public.trg_inquiry_notify();

-- Complaint triggers
create or replace function public.trg_complaint_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_enqueue('complaint.created',
      jsonb_build_object('body', format('種別 %s', new.complaint_type)),
      'complaints', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists complaints_notify on public.complaints;
create trigger complaints_notify
  after insert on public.complaints
  for each row execute function public.trg_complaint_notify();

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
  perform public.apply_dealer_penalty(v_c.seller_id, v_c.penalty_score, v_reason,
    public.penalty_category_for_complaint(v_c.complaint_type), v_c.id, true);
  update public.complaints set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_complaint_id returning * into v_c;
  perform public.write_admin_action('complaint_approved', v_c.seller_id, v_reason,
    jsonb_build_object('complaint_id', p_complaint_id, 'penalty', v_c.penalty_score));
  perform public.notify_enqueue('complaint.approved', jsonb_build_object('body', v_reason), 'complaints', p_complaint_id);
  return v_c;
end;
$$;

create or replace function public.reject_complaint(p_complaint_id uuid)
returns public.complaints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.complaints;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.complaints set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_complaint_id and status = 'pending' returning * into v_c;
  if v_c.id is null then raise exception 'complaint not found or not pending'; end if;
  perform public.notify_enqueue('complaint.rejected',
    jsonb_build_object('body', format('却下 %s', p_complaint_id)), 'complaints', p_complaint_id);
  return v_c;
end;
$$;

create or replace function public.admin_ban_dealer(p_dealer_id uuid, p_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'ban reason required'; end if;
  update public.profiles set is_banned = true, is_active = false, ban_reason = trim(p_reason)
  where id = p_dealer_id returning * into v_row;
  insert into public.ban_history (dealer_id, reason, banned_by) values (p_dealer_id, trim(p_reason), auth.uid());
  perform public.write_admin_action('ban', p_dealer_id, trim(p_reason), '{}'::jsonb);
  perform public.notify_enqueue('credit.ban', jsonb_build_object('body', trim(p_reason)), 'profiles', p_dealer_id);
  return v_row;
end;
$$;

-- funded 以降の連絡先（当事者のみ）
create or replace function public.deal_contact_reveal_allowed(p_status public.deal_status)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'funded', 'handover_done', 'transfer_pending', 'payout_ready', 'payout_done', 'completed', 'dispute'
  );
$$;

create or replace function public.get_deal_party_contacts(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_buyer jsonb;
  v_seller jsonb;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  if auth.uid() not in (v_deal.buyer_id, v_deal.seller_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if not public.deal_contact_reveal_allowed(v_deal.status) then
    return jsonb_build_object('revealed', false);
  end if;

  select jsonb_build_object(
    'store_name', store_name, 'contact_name', contact_name, 'phone', phone, 'email', email
  ) into v_buyer from public.profiles where id = v_deal.buyer_id;

  select jsonb_build_object(
    'store_name', store_name, 'contact_name', contact_name, 'phone', phone, 'email', email
  ) into v_seller from public.profiles where id = v_deal.seller_id;

  return jsonb_build_object('revealed', true, 'buyer', v_buyer, 'seller', v_seller);
end;
$$;

grant execute on function public.get_deal_party_contacts(uuid) to authenticated;

-- リスクスキャン
create or replace function public.run_risk_detection_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select p.id, p.store_name, p.email, count(*) as cnt
    from public.profiles p
    join public.deals d on d.seller_id = p.id
    where d.status = 'transfer_pending' and d.transfer_overdue
    group by p.id, p.store_name, p.email
    having count(*) >= 2
  loop
    if not exists (
      select 1 from public.risk_flags
      where dealer_id = r.id and flag_type = 'transfer_overdue_cluster' and resolved = false
    ) then
      insert into public.risk_flags (dealer_id, flag_type, severity, message)
      values (r.id, 'transfer_overdue_cluster', 'high',
        format('名変超過取引が%d件', r.cnt));
      perform public.notify_enqueue('risk.detected',
        jsonb_build_object('body', format('%s: 名変遅延多発', coalesce(r.store_name, r.email))),
        'profiles', r.id);
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select seller_id as id, count(*) cnt from public.complaints
    where status = 'approved' and created_at > now() - interval '90 days'
    group by seller_id having count(*) >= 3
  loop
    if not exists (
      select 1 from public.risk_flags where dealer_id = r.id and flag_type = 'high_complaint_rate' and resolved = false
    ) then
      insert into public.risk_flags (dealer_id, flag_type, severity, message)
      values (r.id, 'high_complaint_rate', 'medium', format('90日で承認クレーム%d件', r.cnt));
      v_count := v_count + 1;
    end if;
  end loop;

  for r in
    select d.id, d.seller_id, l.maker, l.model
    from public.deals d join public.listings l on l.id = d.listing_id
    where d.status = 'funded' and d.funded_at < now() - interval '14 days'
  loop
    if not exists (
      select 1 from public.risk_flags where entity_id = r.id and flag_type = 'funded_stale' and resolved = false
    ) then
      insert into public.risk_flags (dealer_id, flag_type, severity, message, entity_type, entity_id)
      values (r.seller_id, 'funded_stale', 'medium',
        format('funded放置14日+: %s %s', r.maker, r.model), 'deals', r.id);
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('flags_created', v_count);
end;
$$;

-- RLS
alter table public.notification_queue enable row level security;
alter table public.notification_logs enable row level security;
alter table public.notification_templates enable row level security;
alter table public.risk_flags enable row level security;
alter table public.transfer_penalty_applied enable row level security;

create policy notification_admin on public.notification_queue for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy notification_logs_admin on public.notification_logs for select to authenticated
  using (public.is_admin());
create policy notification_templates_admin on public.notification_templates for select to authenticated
  using (public.is_admin());
create policy risk_flags_admin on public.risk_flags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy transfer_penalty_admin on public.transfer_penalty_applied for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant execute on function public.run_transfer_compliance_job() to authenticated;
grant execute on function public.run_risk_detection_job() to service_role;
