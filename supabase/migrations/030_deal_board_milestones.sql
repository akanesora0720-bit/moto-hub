-- Deal communication board (async) + formal milestone fields on deals

-- ---------------------------------------------------------------------------
-- Milestone columns (formal records, separate from chat)
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists pickup_completed_at timestamptz,
  add column if not exists documents_shipped_at timestamptz,
  add column if not exists transfer_completed_at timestamptz,
  add column if not exists tracking_number text;

comment on column public.deals.pickup_scheduled_at is '引取予定日時（正式）';
comment on column public.deals.pickup_completed_at is '引取完了日時（正式）';
comment on column public.deals.seller_payment_confirmed_at is '入金確認日時（正式）';
comment on column public.deals.documents_shipped_at is '書類発送日時（正式）';
comment on column public.deals.transfer_deadline_at is '名変期限（正式）';
comment on column public.deals.transfer_completed_at is '名変完了日時（正式）';
comment on column public.deals.tracking_number is '追跡番号（任意）';

-- ---------------------------------------------------------------------------
-- Board visible from agreed onward (not inquiry/negotiating)
-- ---------------------------------------------------------------------------
create or replace function public.deal_status_allows_board(p_status public.deal_status)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'agreed',
    'awaiting_payment',
    'funded',
    'handover_done',
    'transfer_pending',
    'payout_ready',
    'payout_done',
    'completed',
    'dispute'
  );
$$;

create or replace function public.is_deal_participant(p_deal_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.deals d
    where d.id = p_deal_id
      and (d.buyer_id = p_user_id or d.seller_id = p_user_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- deal_messages + per-user read cursor
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'deal_message_sender_role') then
    create type public.deal_message_sender_role as enum ('buyer', 'seller', 'admin');
  end if;
end;
$$;

create table if not exists public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  sender_user_id uuid not null references public.profiles (id) on delete cascade,
  sender_role public.deal_message_sender_role not null,
  message text not null check (char_length(trim(message)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists deal_messages_deal_created_idx
  on public.deal_messages (deal_id, created_at asc);

create table if not exists public.deal_message_reads (
  deal_id uuid not null references public.deals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);

alter table public.deal_messages enable row level security;
alter table public.deal_message_reads enable row level security;

drop policy if exists deal_messages_select on public.deal_messages;
drop policy if exists deal_message_reads_select on public.deal_message_reads;
drop policy if exists deal_message_reads_upsert on public.deal_message_reads;

create policy deal_messages_select on public.deal_messages
  for select to authenticated
  using (
    public.is_deal_participant(deal_id)
    or public.is_admin()
  );

create policy deal_message_reads_select on public.deal_message_reads
  for select to authenticated
  using (user_id = auth.uid());

create policy deal_message_reads_upsert on public.deal_message_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Resolve sender role for a deal message
-- ---------------------------------------------------------------------------
create or replace function public.deal_message_sender_role_for(
  p_deal_id uuid,
  p_user_id uuid default auth.uid()
)
returns public.deal_message_sender_role
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  if public.is_admin() and p_user_id = auth.uid() then
    return 'admin';
  end if;
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.buyer_id = p_user_id then return 'buyer'; end if;
  if v_deal.seller_id = p_user_id then return 'seller'; end if;
  raise exception 'not a deal participant';
end;
$$;

-- ---------------------------------------------------------------------------
-- Unread count (per user; admins count all board-visible deals)
-- ---------------------------------------------------------------------------
create or replace function public.count_unread_deal_messages(p_user_id uuid default auth.uid())
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.deal_messages m
  inner join public.deals d on d.id = m.deal_id
  left join public.deal_message_reads r
    on r.deal_id = m.deal_id and r.user_id = p_user_id
  where public.deal_status_allows_board(d.status)
    and m.sender_user_id <> p_user_id
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    and (
      d.buyer_id = p_user_id
      or d.seller_id = p_user_id
      or exists (
        select 1 from public.profiles pr
        where pr.id = p_user_id
          and (pr.is_admin = true or pr.member_type = 'staff')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- List / post / mark read
-- ---------------------------------------------------------------------------
create or replace function public.list_deal_messages(p_deal_id uuid)
returns table (
  id uuid,
  deal_id uuid,
  sender_user_id uuid,
  sender_role public.deal_message_sender_role,
  sender_label text,
  message text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if not public.deal_status_allows_board(v_deal.status) then
    raise exception 'board not available for this deal status';
  end if;

  return query
  select
    m.id,
    m.deal_id,
    m.sender_user_id,
    m.sender_role,
    case m.sender_role
      when 'buyer' then '買い手'
      when 'seller' then '売り手'
      when 'admin' then '運営'
    end as sender_label,
    m.message,
    m.created_at
  from public.deal_messages m
  where m.deal_id = p_deal_id
  order by m.created_at asc;
end;
$$;

create or replace function public.post_deal_message(
  p_deal_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_role public.deal_message_sender_role;
  v_id uuid;
  v_body text;
  v_notify uuid;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  if not public.deal_status_allows_board(v_deal.status) then
    raise exception 'board not available until deal is agreed';
  end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 1 then
    raise exception 'message required';
  end if;

  v_role := public.deal_message_sender_role_for(p_deal_id);

  insert into public.deal_messages (deal_id, sender_user_id, sender_role, message)
  values (p_deal_id, auth.uid(), v_role, trim(p_message))
  returning id into v_id;

  insert into public.deal_message_reads (deal_id, user_id, last_read_at)
  values (p_deal_id, auth.uid(), now())
  on conflict (deal_id, user_id) do update
  set last_read_at = excluded.last_read_at;

  perform public.write_status_audit_log(
    'deal_message_posted',
    'deals',
    p_deal_id,
    v_deal.status::text,
    v_deal.status::text,
    auth.uid()
  );

  v_body := left(trim(p_message), 120);

  if v_deal.buyer_id <> auth.uid() then
    perform public.insert_user_notification(
      v_deal.buyer_id,
      '取引連絡板に投稿がありました',
      v_body,
      'normal',
      format('/deals/%s', p_deal_id),
      'deal_messages',
      v_id
    );
  end if;
  if v_deal.seller_id <> auth.uid() then
    perform public.insert_user_notification(
      v_deal.seller_id,
      '取引連絡板に投稿がありました',
      v_body,
      'normal',
      format('/deals/%s', p_deal_id),
      'deal_messages',
      v_id
    );
  end if;

  perform public.notify_enqueue(
    'deal.message_posted',
    jsonb_build_object('deal_id', p_deal_id, 'message_id', v_id, 'role', v_role::text),
    'deal_messages',
    v_id
  );

  return v_id;
end;
$$;

create or replace function public.mark_deal_messages_read(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  insert into public.deal_message_reads (deal_id, user_id, last_read_at)
  values (p_deal_id, auth.uid(), now())
  on conflict (deal_id, user_id) do update
  set last_read_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Formal milestones (structured fields)
-- ---------------------------------------------------------------------------
create or replace function public.update_deal_milestones(
  p_deal_id uuid,
  p_pickup_scheduled_at timestamptz default null,
  p_pickup_completed_at timestamptz default null,
  p_documents_shipped_at timestamptz default null,
  p_transfer_completed_at timestamptz default null,
  p_tracking_number text default null,
  p_clear_tracking boolean default false
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.deals where id = p_deal_id for update;
  if v.id is null then raise exception 'deal not found'; end if;
  if not public.deal_status_allows_board(v.status) then
    raise exception 'milestones not editable for this status';
  end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if p_pickup_scheduled_at is not null
     and v.buyer_id <> auth.uid() and not public.is_admin() then
    raise exception 'buyer or admin only for pickup schedule';
  end if;

  if p_pickup_completed_at is not null
     and v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only for pickup completed';
  end if;

  if p_documents_shipped_at is not null
     and v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only for documents shipped';
  end if;

  if p_transfer_completed_at is not null
     and v.buyer_id <> auth.uid()
     and v.seller_id <> auth.uid()
     and not public.is_admin() then
    raise exception 'party or admin only for transfer completed';
  end if;

  v_before := jsonb_build_object(
    'pickup_scheduled_at', v.pickup_scheduled_at,
    'pickup_completed_at', v.pickup_completed_at,
    'documents_shipped_at', v.documents_shipped_at,
    'transfer_completed_at', v.transfer_completed_at,
    'tracking_number', v.tracking_number
  );

  update public.deals
  set
    pickup_scheduled_at = coalesce(p_pickup_scheduled_at, pickup_scheduled_at),
    pickup_completed_at = coalesce(p_pickup_completed_at, pickup_completed_at),
    documents_shipped_at = coalesce(p_documents_shipped_at, documents_shipped_at),
    transfer_completed_at = coalesce(p_transfer_completed_at, transfer_completed_at),
    tracking_number = case
      when p_clear_tracking then null
      when p_tracking_number is not null then nullif(trim(p_tracking_number), '')
      else tracking_number
    end,
    updated_at = now()
  where id = p_deal_id
  returning * into v;

  v_after := jsonb_build_object(
    'pickup_scheduled_at', v.pickup_scheduled_at,
    'pickup_completed_at', v.pickup_completed_at,
    'documents_shipped_at', v.documents_shipped_at,
    'transfer_completed_at', v.transfer_completed_at,
    'tracking_number', v.tracking_number
  );

  perform public.write_status_audit_log(
    'deal_milestones_updated',
    'deals',
    p_deal_id,
    v.status::text,
    v.status::text,
    auth.uid()
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (
    auth.uid(),
    'deal_milestones_updated',
    'deals',
    p_deal_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v;
end;
$$;

-- Handover also records pickup completed
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
  if v.pickup_scheduled_at is null and not public.is_admin() then
    raise exception 'buyer must register pickup schedule before handover';
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
    pickup_completed_at = coalesce(pickup_completed_at, now()),
    status = v_next_status,
    requires_name_transfer = v_requires,
    transfer_deadline_at = case
      when v_requires then public.transfer_deadline_next_friday(now())
      else null
    end,
    updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.notify_deal_status(p_deal_id, v_next_status);
  return v;
end;
$$;

grant execute on function public.deal_status_allows_board(public.deal_status) to authenticated;
grant execute on function public.list_deal_messages(uuid) to authenticated;
grant execute on function public.post_deal_message(uuid, text) to authenticated;
grant execute on function public.mark_deal_messages_read(uuid) to authenticated;
grant execute on function public.count_unread_deal_messages(uuid) to authenticated;
grant execute on function public.update_deal_milestones(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, text, boolean
) to authenticated;
