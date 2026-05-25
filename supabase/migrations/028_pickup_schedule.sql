-- Buyer pickup schedule after seller confirms payment

alter table public.deals
  add column if not exists pickup_scheduled_at timestamptz;

-- ---------------------------------------------------------------------------
-- Buyer sets / updates pickup datetime (after funded, before handover)
-- ---------------------------------------------------------------------------
create or replace function public.buyer_set_pickup_schedule(
  p_deal_id uuid,
  p_pickup_scheduled_at timestamptz
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_pickup_scheduled_at is null then
    raise exception 'pickup schedule required';
  end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if auth.uid() <> v.buyer_id and not public.is_admin() then
    raise exception 'buyer only';
  end if;
  if v.status <> 'funded' then
    raise exception 'pickup schedule can only be set while awaiting handover';
  end if;

  update public.deals
  set pickup_scheduled_at = p_pickup_scheduled_at,
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.notify_user_email(
    'deal.pickup_scheduled',
    v.seller_id,
    format(
      '取引 %s の買い手が引取予定日時を登録しました: %s',
      p_deal_id,
      to_char(p_pickup_scheduled_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')
    ),
    'MotoHub: 引取予定日時の登録'
  );

  insert into public.user_notifications (user_id, title, body, link_url, entity_type, entity_id)
  values (
    v.seller_id,
    '引取予定日時が登録されました',
    format('引取予定: %s', to_char(p_pickup_scheduled_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI')),
    format('/deals/%s', p_deal_id),
    'deals',
    p_deal_id
  );

  return v;
end;
$$;

grant execute on function public.buyer_set_pickup_schedule(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Seller payment confirm → prompt buyer to schedule pickup
-- ---------------------------------------------------------------------------
create or replace function public.seller_confirm_buyer_payment(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if auth.uid() <> v.seller_id and not public.is_admin() then
    raise exception 'seller only';
  end if;
  if v.status <> 'awaiting_payment' then
    raise exception 'deal is not awaiting payment';
  end if;

  update public.deals
  set status = 'funded',
      funded_at = coalesce(funded_at, now()),
      seller_payment_confirmed_at = now(),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.issue_platform_fee_invoice(p_deal_id);
  perform public.notify_deal_status(p_deal_id, 'funded');

  perform public.notify_user_email(
    'deal.funded',
    v.buyer_id,
    format(
      '取引 %s: 売り手が入金を確認しました。売り手と引取日時を調整のうえ、MotoHubの取引画面から「引取予定日時」を入力してください。',
      p_deal_id
    ),
    'MotoHub: 引取予定日時の入力をお願いします'
  );

  insert into public.user_notifications (user_id, title, body, link_url, entity_type, entity_id)
  values (
    v.buyer_id,
    '入金確認済 — 引取予定日時を入力',
    '売り手が入金を確認しました。売り手と日時を調整し、取引画面から引取予定日時を登録してください。',
    format('/deals/%s', p_deal_id),
    'deals',
    p_deal_id
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Handover requires pickup schedule
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
