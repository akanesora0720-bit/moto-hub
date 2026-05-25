-- Deal board: pickup/handover only, visible to parties after payment confirmation
-- Emergency seller contact reveal with audit trail

-- ---------------------------------------------------------------------------
-- Board access: parties after payment; admins anytime
-- ---------------------------------------------------------------------------
create or replace function public.deal_status_after_payment(p_status public.deal_status)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'funded',
    'handover_done',
    'transfer_pending',
    'payout_ready',
    'payout_done',
    'completed',
    'dispute'
  );
$$;

create or replace function public.deal_party_board_visible(
  p_status public.deal_status,
  p_seller_payment_confirmed_at timestamptz
)
returns boolean
language sql
immutable
as $$
  select
    p_seller_payment_confirmed_at is not null
    or public.deal_status_after_payment(p_status);
$$;

create or replace function public.deal_board_access_allowed(
  p_deal_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  if p_user_id is null then
    return false;
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    return false;
  end if;

  if exists (
    select 1 from public.profiles pr
    where pr.id = p_user_id
      and (pr.is_admin = true or pr.member_type = 'staff')
  ) then
    return true;
  end if;

  if v_deal.buyer_id <> p_user_id and v_deal.seller_id <> p_user_id then
    return false;
  end if;

  return public.deal_party_board_visible(
    v_deal.status,
    v_deal.seller_payment_confirmed_at
  );
end;
$$;

-- Legacy helper: party-visible payment gate (replaces agreed+ gate for parties)
create or replace function public.deal_status_allows_board(p_status public.deal_status)
returns boolean
language sql
immutable
as $$
  select public.deal_status_after_payment(p_status);
$$;

-- ---------------------------------------------------------------------------
-- emergency_contact_views
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_contact_views (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  viewer_user_id uuid not null references public.profiles (id) on delete cascade,
  viewed_party_dealer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists emergency_contact_views_deal_idx
  on public.emergency_contact_views (deal_id, viewed_at desc);

create index if not exists emergency_contact_views_viewer_idx
  on public.emergency_contact_views (viewer_user_id, viewed_at desc);

alter table public.emergency_contact_views enable row level security;

drop policy if exists emergency_contact_views_admin on public.emergency_contact_views;
drop policy if exists emergency_contact_views_self on public.emergency_contact_views;

create policy emergency_contact_views_admin on public.emergency_contact_views
  for select to authenticated
  using (public.is_admin());

create policy emergency_contact_views_self on public.emergency_contact_views
  for select to authenticated
  using (viewer_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reveal seller emergency contact (buyer; admin for support)
-- ---------------------------------------------------------------------------
create or replace function public.reveal_emergency_seller_contact(
  p_deal_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_viewer uuid := auth.uid();
  v_seller jsonb;
  v_view_id uuid;
begin
  if v_viewer is null then
    raise exception 'login required';
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  if not public.deal_board_access_allowed(p_deal_id, v_viewer) then
    raise exception 'board not available';
  end if;

  if v_deal.buyer_id <> v_viewer
     and not exists (
       select 1 from public.profiles pr
       where pr.id = v_viewer and (pr.is_admin = true or pr.member_type = 'staff')
     ) then
    raise exception 'buyer or admin only';
  end if;

  insert into public.emergency_contact_views (
    deal_id,
    viewer_user_id,
    viewed_party_dealer_id,
    viewed_at,
    reason
  )
  values (
    p_deal_id,
    v_viewer,
    v_deal.seller_id,
    now(),
    nullif(trim(coalesce(p_reason, '')), '')
  )
  returning id into v_view_id;

  perform public.write_status_audit_log(
    'emergency_contact_revealed',
    'deals',
    p_deal_id,
    v_deal.status::text,
    v_deal.status::text,
    v_viewer
  );

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  values (
    v_viewer,
    'emergency_contact_revealed',
    'deals',
    p_deal_id,
    jsonb_build_object(
      'view_id', v_view_id,
      'viewer_user_id', v_viewer,
      'viewed_party_dealer_id', v_deal.seller_id,
      'reason', nullif(trim(coalesce(p_reason, '')), '')
    )
  );

  select jsonb_build_object(
    'store_name', p.store_name,
    'contact_name', p.contact_name,
    'phone', p.phone
  ) into v_seller
  from public.profiles p
  where p.id = v_deal.seller_id;

  return jsonb_build_object(
    'revealed', true,
    'view_id', v_view_id,
    'seller', v_seller
  );
end;
$$;

create or replace function public.get_emergency_seller_contact(p_deal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_viewer uuid := auth.uid();
  v_seller jsonb;
begin
  if v_viewer is null then
    raise exception 'login required';
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  if v_deal.seller_id = v_viewer then
    select jsonb_build_object(
      'revealed', true,
      'store_name', p.store_name,
      'contact_name', p.contact_name,
      'phone', p.phone
    ) into v_seller
    from public.profiles p where p.id = v_deal.seller_id;
    return jsonb_build_object('revealed', true, 'seller', v_seller);
  end if;

  if not exists (
    select 1 from public.emergency_contact_views v
    where v.deal_id = p_deal_id and v.viewer_user_id = v_viewer
  ) and not public.is_admin() then
    return jsonb_build_object('revealed', false);
  end if;

  if not public.deal_board_access_allowed(p_deal_id, v_viewer) then
    return jsonb_build_object('revealed', false);
  end if;

  select jsonb_build_object(
    'store_name', p.store_name,
    'contact_name', p.contact_name,
    'phone', p.phone
  ) into v_seller
  from public.profiles p
  where p.id = v_deal.seller_id;

  return jsonb_build_object('revealed', true, 'seller', v_seller);
end;
$$;

create or replace function public.list_emergency_contact_views_admin(p_limit int default 100)
returns table (
  id uuid,
  deal_id uuid,
  viewer_user_id uuid,
  viewer_store_name text,
  viewed_party_dealer_id uuid,
  seller_store_name text,
  viewed_at timestamptz,
  reason text,
  listing_label text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select
    v.id,
    v.deal_id,
    v.viewer_user_id,
    vp.store_name as viewer_store_name,
    v.viewed_party_dealer_id,
    sp.store_name as seller_store_name,
    v.viewed_at,
    v.reason,
    format('%s %s', l.maker, l.model) as listing_label
  from public.emergency_contact_views v
  join public.deals d on d.id = v.deal_id
  join public.listings l on l.id = d.listing_id
  left join public.profiles vp on vp.id = v.viewer_user_id
  left join public.profiles sp on sp.id = v.viewed_party_dealer_id
  order by v.viewed_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- Board RPCs: payment gate for parties
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
  where public.deal_board_access_allowed(m.deal_id, p_user_id)
    and m.sender_user_id <> p_user_id
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz);
$$;

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
  if not public.deal_board_access_allowed(p_deal_id) then
    raise exception 'board not available until payment is confirmed';
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
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v_deal from public.deals where id = p_deal_id for update;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  if not public.deal_board_access_allowed(p_deal_id) then
    raise exception 'board not available until payment is confirmed';
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
      '引取・引渡し連絡板に投稿がありました',
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
      '引取・引渡し連絡板に投稿がありました',
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
  if not public.deal_board_access_allowed(p_deal_id) then
    raise exception 'board not available';
  end if;

  insert into public.deal_message_reads (deal_id, user_id, last_read_at)
  values (p_deal_id, auth.uid(), now())
  on conflict (deal_id, user_id) do update
  set last_read_at = now();
end;
$$;

grant execute on function public.deal_board_access_allowed(uuid, uuid) to authenticated;
grant execute on function public.deal_party_board_visible(public.deal_status, timestamptz) to authenticated;
grant execute on function public.reveal_emergency_seller_contact(uuid, text) to authenticated;
grant execute on function public.get_emergency_seller_contact(uuid) to authenticated;
grant execute on function public.list_emergency_contact_views_admin(int) to authenticated;
