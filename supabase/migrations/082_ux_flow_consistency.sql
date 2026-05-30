-- UX整合: 通知リンク・引渡/マイルストーン迂回防止・パーツ発送・入金確認

-- ---------------------------------------------------------------------------
-- 運営: 取引ステータス通知 → 取引詳細へ直リンク
-- ---------------------------------------------------------------------------
create or replace function public.trg_deal_admin_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_maker text;
  v_model text;
  v_title text;
  v_body text;
  v_link text;
begin
  select li.maker, li.model into v_maker, v_model
  from public.listings li where li.id = new.listing_id;

  v_link := format('/admin/deals/%s#deal-primary-action', new.id);

  if tg_op = 'INSERT' and new.status in ('inquiry', 'negotiating') then
    perform public.notify_all_admins(
      '【運営】新規商談・問い合わせ',
      format('%s %s — 商談が開始されました。', v_maker, v_model),
      'important',
      '/admin/workspace?tab=inquiries',
      'deals',
      new.id
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    v_title := case new.status
      when 'awaiting_payment' then '【運営】成約・入金待ち'
      when 'funded' then '【運営】入金確認済'
      when 'handover_done' then '【運営】引渡完了'
      when 'transfer_pending' then '【運営】名変待ち'
      when 'payout_ready' then '【運営】取引完了操作待ち'
      when 'payout_done' then '【運営】完了登録待ち'
      when 'completed' then '【運営】取引完了'
      when 'cancelled' then '【運営】取引取消'
      else null
    end;
    if v_title is not null then
      v_body := format('%s %s — %s → %s', v_maker, v_model, old.status, new.status);
      perform public.notify_all_admins(v_title, v_body, 'important', v_link, 'deals', new.id);
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.buyer_payment_reported_at is null
     and new.buyer_payment_reported_at is not null then
    perform public.notify_all_admins(
      '【運営】買い手振込報告',
      format('%s %s — 売り手の入金確認を促してください。', v_maker, v_model),
      'important',
      v_link,
      'deals',
      new.id
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 引取予定通知 → #deal-pickup
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
    raise exception 'pickup_scheduled_at required';
  end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if auth.uid() <> v.buyer_id and not public.is_admin() then
    raise exception 'buyer only';
  end if;
  if v.status <> 'funded' and not public.is_admin() then
    raise exception 'deal must be funded';
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
    format('/deals/%s#deal-pickup', p_deal_id),
    'deals',
    p_deal_id
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- 売り手入金確認: 買い手の振込報告必須
-- ---------------------------------------------------------------------------
create or replace function public.seller_confirm_buyer_payment(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_maker text;
  v_model text;
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
  if v.buyer_payment_reported_at is null and not public.is_admin() then
    raise exception 'buyer must report payment before seller confirmation';
  end if;

  update public.deals
  set status = 'funded',
      funded_at = coalesce(funded_at, now()),
      seller_payment_confirmed_at = now(),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  select li.maker, li.model into v_maker, v_model
  from public.listings li where li.id = v.listing_id;

  perform public.notify_deal_status(p_deal_id, 'funded');

  begin
    perform public.notify_user_email(
      'deal.funded',
      v.buyer_id,
      format(
        '取引 %s: 売り手が入金を確認しました。引取予定日時を入力してください。',
        p_deal_id
      ),
      'MotoHub: 引取予定日時の入力をお願いします'
    );
  exception when others then null;
  end;

  begin
    perform public.insert_user_notification(
      v.buyer_id,
      '入金確認済 — 引取予定日時を入力',
      '売り手が入金を確認しました。取引画面から引取予定日時を登録してください。',
      'important',
      format('/deals/%s#deal-pickup', p_deal_id),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_all_admins(
      '【運営】売り手が入金確認',
      format('%s %s — 引取・引渡フェーズへ進行中', v_maker, v_model),
      'important',
      format('/admin/deals/%s#deal-primary-action', p_deal_id),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- マイルストーン: 当事者は引渡完了日時の手入力不可（deal_mark_handover を使用）
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
  v_had_pickup boolean;
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

  if p_pickup_scheduled_at is not null and not public.is_admin() then
    raise exception 'use buyer_set_pickup_schedule for pickup schedule';
  end if;

  if p_pickup_completed_at is not null and not public.is_admin() then
    raise exception 'use deal_mark_handover for handover completion';
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

  v_had_pickup := v.pickup_completed_at is not null;

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

  if not v_had_pickup and v.pickup_completed_at is not null then
    perform public.accrue_vehicle_platform_fee(p_deal_id);
  end if;

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
    v_before::text,
    v_after::text,
    auth.uid()
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- パーツ: 入金確認後のみ発送・引渡
-- ---------------------------------------------------------------------------
create or replace function public.mark_part_sale_shipped(p_part_sale_id uuid)
returns public.part_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.part_sales;
begin
  select * into v_sale from public.part_sales where id = p_part_sale_id for update;
  if v_sale.id is null then raise exception 'part sale not found'; end if;
  if not public.is_admin() and v_sale.seller_id <> auth.uid() then
    raise exception 'seller or admin only';
  end if;
  if v_sale.buyer_payment_confirmed_at is null and not public.is_admin() then
    raise exception 'confirm buyer payment before shipping';
  end if;
  if v_sale.shipped_at is not null then
    return v_sale;
  end if;
  if v_sale.handover_at is not null then
    raise exception 'already handover completed';
  end if;

  update public.part_sales
  set shipped_at = now(),
      fulfillment_mode = coalesce(fulfillment_mode, 'shipping'::public.part_fulfillment_mode)
  where id = p_part_sale_id
  returning * into v_sale;

  perform public.accrue_part_platform_fee(p_part_sale_id);
  return v_sale;
end;
$$;

create or replace function public.mark_part_sale_handover(p_part_sale_id uuid)
returns public.part_sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.part_sales;
begin
  select * into v_sale from public.part_sales where id = p_part_sale_id for update;
  if v_sale.id is null then raise exception 'part sale not found'; end if;
  if not public.is_admin() and v_sale.seller_id <> auth.uid() then
    raise exception 'seller or admin only';
  end if;
  if v_sale.buyer_payment_confirmed_at is null and not public.is_admin() then
    raise exception 'confirm buyer payment before handover';
  end if;
  if v_sale.handover_at is not null then
    return v_sale;
  end if;
  if v_sale.shipped_at is not null then
    raise exception 'already shipped';
  end if;

  update public.part_sales
  set handover_at = now(),
      fulfillment_mode = coalesce(fulfillment_mode, 'handover'::public.part_fulfillment_mode)
  where id = p_part_sale_id
  returning * into v_sale;

  perform public.accrue_part_platform_fee(p_part_sale_id);
  return v_sale;
end;
$$;
