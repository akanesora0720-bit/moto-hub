-- 運営向け in-app 通知の link_url を /admin/deals に（加盟店は従来どおり /deals）

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

  v_link := '/admin/workspace?tab=deals';

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
      format('/admin/deals/%s#deal-primary-action', new.id),
      'deals',
      new.id
    );
  end if;

  return new;
end;
$$;

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

  begin
    perform public.issue_platform_fee_invoice(p_deal_id);
  exception when others then
    raise notice 'issue_platform_fee_invoice: %', sqlerrm;
  end;

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

create or replace function public.buyer_report_payment_sent(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_body text;
  v_maker text;
  v_model text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if auth.uid() <> v.buyer_id and not public.is_admin() then
    raise exception 'buyer only';
  end if;
  if v.status <> 'awaiting_payment' then
    raise exception 'deal is not awaiting payment';
  end if;

  if v.buyer_payment_reported_at is not null then
    return v;
  end if;

  update public.deals
  set buyer_payment_reported_at = now(),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  select li.maker, li.model into v_maker, v_model
  from public.listings li where li.id = v.listing_id;

  v_body := format(
    '取引 %s: %s %s — 買い手が振込完了を報告しました。',
    p_deal_id, v_maker, v_model
  );

  begin
    insert into public.deal_alerts (deal_id, alert_type, message)
    values (
      p_deal_id,
      'buyer_payment_reported',
      format('買い手振込報告: %s %s', v_maker, v_model)
    );
  exception when others then null;
  end;

  begin
    perform public.notify_enqueue(
      'deal.buyer_payment_reported',
      jsonb_build_object('body', v_body),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_user_email(
      'deal.buyer_payment_reported',
      v.seller_id,
      format('取引 %s: 買い手が振込完了を報告しました。', p_deal_id),
      'MotoHub: 買い手から振込報告'
    );
  exception when others then null;
  end;

  begin
    perform public.insert_user_notification(
      v.seller_id,
      '買い手が振込完了を報告',
      format('%s %s — 口座を確認し入金確認ボタンを押してください。', v_maker, v_model),
      'important',
      format('/deals/%s#deal-primary-action', p_deal_id),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  begin
    perform public.insert_user_notification(
      v.buyer_id,
      '振込報告を送信しました',
      '売り手の入金確認をお待ちください。',
      'normal',
      format('/deals/%s#deal-primary-action', p_deal_id),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_all_admins(
      '【運営】買い手振込報告',
      format('%s %s — 売り手の入金確認を促してください。', v_maker, v_model),
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
