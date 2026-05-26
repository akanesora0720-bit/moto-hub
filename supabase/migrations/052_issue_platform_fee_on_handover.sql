-- 手数料請求書（platform_fee）の発行タイミングを「入金確認」→「引渡完了」へ変更
--
-- - seller_confirm_buyer_payment: funded へ進めるが、手数料請求書は issued にしない
-- - deal_mark_handover: 引渡完了時に手数料請求書を issued（または対象外なら cancelled）

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

  update public.deals
  set status = 'funded',
      funded_at = coalesce(funded_at, now()),
      seller_payment_confirmed_at = now(),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  select li.maker, li.model into v_maker, v_model
  from public.listings li where li.id = v.listing_id;

  -- 手数料請求書の発行（issued）は引渡完了時に行う

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
      format('/deals/%s#deal-primary-action', p_deal_id),
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

  -- 引渡完了時に手数料請求書を発行（対象外なら cancelled）
  begin
    perform public.issue_platform_fee_invoice(p_deal_id);
  exception when others then
    raise notice 'issue_platform_fee_invoice: %', sqlerrm;
  end;

  perform public.notify_deal_status(p_deal_id, v_next_status);
  return v;
end;
$$;

