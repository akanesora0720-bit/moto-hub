-- 運営へのアプリ内通知 + 商談開始時は問い合わせが即 closed でも検知できるようにする

create or replace function public.notify_all_admins(
  p_title text,
  p_body text,
  p_importance public.message_importance default 'high',
  p_link_url text default '/admin/workspace',
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id from public.profiles where is_admin = true and is_active = true
  loop
    begin
      perform public.insert_user_notification(
        r.id,
        trim(p_title),
        trim(p_body),
        p_importance,
        p_link_url,
        p_entity_type,
        p_entity_id
      );
    exception
      when others then
        raise notice 'notify_all_admins skip %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- 取引の作成・ステータス変更で運営に通知
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

  v_link := format('/admin/workspace?tab=deals');

  if tg_op = 'INSERT' and new.status in ('inquiry', 'negotiating') then
    perform public.notify_all_admins(
      '【運営】新規商談・問い合わせ',
      format('%s %s — 商談が開始されました。ワークスペースで確認してください。', v_maker, v_model),
      'high',
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
      v_body := format(
        '%s %s — ステータス: %s → %s',
        v_maker, v_model, old.status, new.status
      );
      perform public.notify_all_admins(
        v_title, v_body, 'high', v_link, 'deals', new.id
      );
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.buyer_payment_reported_at is null
     and new.buyer_payment_reported_at is not null then
    perform public.notify_all_admins(
      '【運営】買い手振込報告',
      format('%s %s — 売り手の入金確認を促してください。', v_maker, v_model),
      'high',
      format('/deals/%s', new.id),
      'deals',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists deals_admin_notify on public.deals;
create trigger deals_admin_notify
  after insert or update of status, buyer_payment_reported_at on public.deals
  for each row execute function public.trg_deal_admin_notify();

-- open のまま残る問い合わせ（レガシー）
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
    perform public.notify_enqueue(
      'inquiry.created',
      jsonb_build_object('body', v_body),
      'inquiries',
      new.id
    );
    perform public.notify_all_admins(
      '【運営】新規問い合わせ',
      format('%s %s — %s', l.maker, l.model, left(trim(new.message), 120)),
      'high',
      '/admin/workspace?tab=inquiries',
      'inquiries',
      new.id
    );
  elsif tg_op = 'UPDATE' and old.status = 'open' and new.status = 'closed' then
    perform public.notify_enqueue(
      'inquiry.closed',
      jsonb_build_object('body', format('問い合わせ %s をクローズ', new.id)),
      'inquiries',
      new.id
    );
  end if;
  return new;
end;
$$;

-- deal ステータスメールキューは従来どおり
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
