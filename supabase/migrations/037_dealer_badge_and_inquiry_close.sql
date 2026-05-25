-- Fix stale 商談 badge: unread only on actionable deals; close inquiries when deal ends

-- ---------------------------------------------------------------------------
-- Unread deal board: exclude terminal / admin-wait statuses
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
    and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    and d.status in (
      'inquiry',
      'negotiating',
      'awaiting_payment',
      'funded',
      'handover_done',
      'transfer_pending',
      'dispute'
    );
$$;

-- ---------------------------------------------------------------------------
-- Close open inquiries when all linked deals are completed or cancelled
-- ---------------------------------------------------------------------------
update public.inquiries i
set status = 'closed',
    updated_at = now()
where i.status = 'open'
  and (
    not exists (select 1 from public.deals d where d.inquiry_id = i.id)
    or not exists (
      select 1 from public.deals d
      where d.inquiry_id = i.id
        and d.status not in ('completed', 'cancelled')
    )
  );

create or replace function public.close_inquiry_if_deal_terminal(p_inquiry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_inquiry_id is null then return; end if;
  if exists (
    select 1 from public.deals d
    where d.inquiry_id = p_inquiry_id
      and d.status not in ('completed', 'cancelled')
  ) then
    return;
  end if;
  update public.inquiries
  set status = 'closed', updated_at = now()
  where id = p_inquiry_id and status = 'open';
end;
$$;

-- admin_advance_deal: close inquiry on completed / cancelled
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

  if p_status in ('completed', 'cancelled') then
    perform public.close_inquiry_if_deal_terminal(v.inquiry_id);
    perform public.sync_listing_status_from_deals(v.listing_id);
  end if;

  perform public.notify_deal_status(p_deal_id, p_status);
  return v;
end;
$$;

-- Any deal → completed / cancelled closes inquiry when no other active deal
create or replace function public.trg_deals_close_inquiry_on_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('completed', 'cancelled')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.close_inquiry_if_deal_terminal(new.inquiry_id);
  end if;
  return new;
end;
$$;

drop trigger if exists deals_close_inquiry_on_terminal on public.deals;
create trigger deals_close_inquiry_on_terminal
  after insert or update of status on public.deals
  for each row
  execute function public.trg_deals_close_inquiry_on_terminal();
