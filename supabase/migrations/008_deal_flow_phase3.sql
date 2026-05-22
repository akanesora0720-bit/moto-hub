-- Phase3: 取引フロー（車両＋書類同時引渡・翌週金曜名変期限・双方確認後振込）

-- ---------------------------------------------------------------------------
-- deal_status 拡張
-- ---------------------------------------------------------------------------
alter table public.deals alter column status drop default;
alter table public.deals alter column status type text using status::text;

drop type if exists public.deal_status;

create type public.deal_status as enum (
  'inquiry',
  'negotiating',
  'agreed',
  'awaiting_payment',
  'funded',
  'handover_done',
  'transfer_pending',
  'payout_ready',
  'payout_done',
  'completed',
  'cancelled',
  'dispute'
);

update public.deals
set status = case
  when status = 'pending' then 'agreed'
  when status = 'completed' then 'completed'
  when status = 'cancelled' then 'cancelled'
  else 'agreed'
end;

alter table public.deals
  alter column status type public.deal_status using status::public.deal_status;

alter table public.deals
  alter column status set default 'inquiry'::public.deal_status;

-- ---------------------------------------------------------------------------
-- deals 追加カラム
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists inquiry_id uuid references public.inquiries (id) on delete set null,
  add column if not exists handover_at timestamptz,
  add column if not exists funded_at timestamptz,
  add column if not exists transfer_deadline_at timestamptz,
  add column if not exists requires_name_transfer boolean not null default false,
  add column if not exists buyer_confirmed_at timestamptz,
  add column if not exists seller_confirmed_at timestamptz,
  add column if not exists payout_at timestamptz,
  add column if not exists transfer_overdue boolean not null default false,
  add column if not exists transfer_overdue_notified_at timestamptz;

create index if not exists deals_status_idx on public.deals (status, updated_at desc);
create index if not exists deals_transfer_deadline_idx
  on public.deals (transfer_deadline_at)
  where status = 'transfer_pending' and transfer_overdue = false;

-- ---------------------------------------------------------------------------
-- 管理警告
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_alert_type') then
    create type public.deal_alert_type as enum ('transfer_overdue', 'transfer_due_soon');
  end if;
end
$$;

create table if not exists public.deal_alerts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  alert_type public.deal_alert_type not null,
  message text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists deal_alerts_open_idx
  on public.deal_alerts (resolved, created_at desc)
  where resolved = false;

alter table public.deal_alerts enable row level security;

drop policy if exists deal_alerts_admin on public.deal_alerts;
create policy deal_alerts_admin on public.deal_alerts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 名変期限: 引渡日（JST）の週の翌週金曜 23:59:59
-- ---------------------------------------------------------------------------
create or replace function public.transfer_deadline_next_friday(p_handover timestamptz)
returns timestamptz
language sql
immutable
as $$
  select (
    (
      date_trunc('week', (p_handover at time zone 'Asia/Tokyo'))::date
      + interval '11 days'
      + time '23:59:59'
    ) at time zone 'Asia/Tokyo'
  );
$$;

-- ---------------------------------------------------------------------------
-- 名変期限チェック（cron / 管理画面から実行）
-- ---------------------------------------------------------------------------
create or replace function public.check_transfer_deadlines()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_overdue int := 0;
  v_soon int := 0;
  r record;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  for r in
    select d.id, d.buyer_id, d.seller_id, d.transfer_deadline_at, l.maker, l.model
    from public.deals d
    join public.listings l on l.id = d.listing_id
    where d.status = 'transfer_pending'
      and d.requires_name_transfer = true
      and d.transfer_deadline_at is not null
      and d.transfer_overdue = false
      and d.transfer_deadline_at < now()
  loop
    update public.deals
    set transfer_overdue = true,
        transfer_overdue_notified_at = coalesce(transfer_overdue_notified_at, now())
    where id = r.id;

    insert into public.deal_alerts (deal_id, alert_type, message)
    values (
      r.id,
      'transfer_overdue',
      format(
        '名変期限超過: %s %s（期限 %s）— 信用減点候補',
        r.maker,
        r.model,
        to_char(r.transfer_deadline_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD HH24:MI')
      )
    );

    v_overdue := v_overdue + 1;
  end loop;

  for r in
    select d.id, l.maker, l.model, d.transfer_deadline_at
    from public.deals d
    join public.listings l on l.id = d.listing_id
    where d.status = 'transfer_pending'
      and d.transfer_overdue = false
      and d.transfer_deadline_at is not null
      and d.transfer_deadline_at between now() and now() + interval '2 days'
      and not exists (
        select 1 from public.deal_alerts a
        where a.deal_id = d.id
          and a.alert_type = 'transfer_due_soon'
          and a.created_at > now() - interval '3 days'
      )
  loop
    insert into public.deal_alerts (deal_id, alert_type, message)
    values (
      r.id,
      'transfer_due_soon',
      format('名変期限間近: %s %s（%s）', r.maker, r.model, to_char(r.transfer_deadline_at at time zone 'Asia/Tokyo', 'MM/DD HH24:MI'))
    );
    v_soon := v_soon + 1;
  end loop;

  return json_build_object('overdue_flagged', v_overdue, 'due_soon_notified', v_soon);
end;
$$;

grant execute on function public.check_transfer_deadlines() to authenticated;

-- ---------------------------------------------------------------------------
-- 双方確認で payout_ready へ
-- ---------------------------------------------------------------------------
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
  if not found then
    raise exception 'deal not found';
  end if;

  if v.status not in ('handover_done', 'transfer_pending') then
    return;
  end if;

  if v.buyer_confirmed_at is null or v.seller_confirmed_at is null then
    return;
  end if;

  update public.deals
  set status = 'payout_ready', updated_at = now()
  where id = p_deal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 買い手: 取引完了確認
-- ---------------------------------------------------------------------------
create or replace function public.deal_buyer_confirm(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v.buyer_id <> auth.uid() then raise exception 'buyer only'; end if;
  if v.status not in ('handover_done', 'transfer_pending') then
    raise exception 'invalid status for buyer confirm';
  end if;

  update public.deals
  set buyer_confirmed_at = coalesce(buyer_confirmed_at, now()), updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.deal_try_payout_ready(p_deal_id);
  select * into v from public.deals where id = p_deal_id;
  return v;
end;
$$;

grant execute on function public.deal_buyer_confirm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 売り手: 取引完了確認
-- ---------------------------------------------------------------------------
create or replace function public.deal_seller_confirm(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v.seller_id <> auth.uid() then raise exception 'seller only'; end if;
  if v.status not in ('handover_done', 'transfer_pending') then
    raise exception 'invalid status for seller confirm';
  end if;

  update public.deals
  set seller_confirmed_at = coalesce(seller_confirmed_at, now()), updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.deal_try_payout_ready(p_deal_id);
  select * into v from public.deals where id = p_deal_id;
  return v;
end;
$$;

grant execute on function public.deal_seller_confirm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 売り手: 車両＋書類引渡完了
-- ---------------------------------------------------------------------------
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
  if v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only';
  end if;
  if v.status <> 'funded' then
    raise exception 'status must be funded';
  end if;

  select inspection_remaining into v_inspection
  from public.listings where id = v.listing_id;

  v_requires := coalesce(trim(v_inspection), '') <> '';

  if v_requires then
    v_next_status := 'transfer_pending';
  else
    v_next_status := 'handover_done';
  end if;

  update public.deals
  set
    handover_at = now(),
    requires_name_transfer = v_requires,
    transfer_deadline_at = case
      when v_requires then public.transfer_deadline_next_friday(now())
      else null
    end,
    status = v_next_status,
    updated_at = now()
  where id = p_deal_id
  returning * into v;

  return v;
end;
$$;

grant execute on function public.deal_mark_handover(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 管理: ステータス進行
-- ---------------------------------------------------------------------------
create or replace function public.admin_advance_deal(p_deal_id uuid, p_status public.deal_status)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

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
  where id = p_deal_id
  returning * into v;

  if p_status = 'completed' then
    update public.listings set status = 'sold' where id = v.listing_id;
  end if;

  return v;
end;
$$;

grant execute on function public.admin_advance_deal(uuid, public.deal_status) to authenticated;

-- ---------------------------------------------------------------------------
-- 管理: 取引作成
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_deal(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_agreed_price_ex_tax int,
  p_inquiry_id uuid default null,
  p_initial_status public.deal_status default 'negotiating'
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
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select seller_id into v_seller from public.listings where id = p_listing_id;
  if not found then raise exception 'listing not found'; end if;

  insert into public.deals (
    listing_id, buyer_id, seller_id, agreed_price_ex_tax,
    status, inquiry_id
  )
  values (
    p_listing_id, p_buyer_id, v_seller, p_agreed_price_ex_tax,
    p_initial_status, p_inquiry_id
  )
  returning * into v;

  return v;
end;
$$;

grant execute on function public.admin_create_deal(uuid, uuid, int, uuid, public.deal_status) to authenticated;
