-- Buyer reports vehicle payment sent (notifies seller + ops; seller still confirms → funded)

alter table public.deals
  add column if not exists buyer_payment_reported_at timestamptz;

comment on column public.deals.buyer_payment_reported_at is '買い手が車両代金の振込完了を報告した日時';

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
    '取引 %s: %s %s — 買い手が車両代金の振込完了を報告しました。売り手の口座入金を確認し、取引画面で「入金を確認」を押してください。',
    p_deal_id, v_maker, v_model
  );

  perform public.notify_enqueue(
    'deal.buyer_payment_reported',
    jsonb_build_object('body', v_body),
    'deals',
    p_deal_id
  );

  perform public.notify_user_email(
    'deal.buyer_payment_reported',
    v.seller_id,
    format(
      '取引 %s（%s %s）: 買い手が振込完了を報告しました。口座入金をご確認のうえ、MotoHubの取引画面で「買い手からの入金を確認」を押してください。',
      p_deal_id, v_maker, v_model
    ),
    'MotoHub: 買い手から振込報告がありました'
  );

  perform public.insert_user_notification(
    v.seller_id,
    '買い手が振込完了を報告',
    format('%s %s — 口座入金を確認し、取引画面で入金確認ボタンを押してください。', v_maker, v_model),
    'high',
    format('/deals/%s', p_deal_id),
    'deals',
    p_deal_id
  );

  perform public.insert_user_notification(
    v.buyer_id,
    '振込報告を送信しました',
    '売り手の入金確認をお待ちください。確認後、引取予定日時の登録へ進みます。',
    'normal',
    format('/deals/%s', p_deal_id),
    'deals',
    p_deal_id
  );

  return v;
end;
$$;

grant execute on function public.buyer_report_payment_sent(uuid) to authenticated;

insert into public.notification_templates (event_type, channel, subject_template, body_template) values
  ('deal.buyer_payment_reported', 'email', '[MotoHub] 買い手振込報告', '買い手が車両代金の振込完了を報告しました。\n\n{{body}}\n\n管理画面で取引を確認してください。')
on conflict (event_type) do update
set subject_template = excluded.subject_template,
    body_template = excluded.body_template,
    enabled = true;
