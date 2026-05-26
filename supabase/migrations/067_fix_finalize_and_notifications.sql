-- 067: Fix admin_finalize_agreement regression and notification templates

-- Restore payment flow: agreement -> awaiting_payment with business-day deadline
create or replace function public.admin_finalize_agreement(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_auto boolean;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into v from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'deal not found';
  end if;
  if not v.seller_intent_confirmed or not v.buyer_intent_confirmed then
    raise exception 'both parties must be confirmed by admin';
  end if;
  if v.status not in ('inquiry', 'negotiating') then
    raise exception 'invalid deal status for agreement';
  end if;

  update public.deals
  set status = 'awaiting_payment',
      payment_due_at = coalesce(payment_due_at, public.business_day_deadline_ts(now(), 3)),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'review_pending', updated_at = now()
  where deal_id = p_deal_id
    and party = 'buyer'
    and document_kind = 'payment_instruction'
    and status = 'draft';

  perform public.notify_enqueue(
    'invoice.review_pending',
    jsonb_build_object('body', format('deal %s 入金指示書確認待ち', p_deal_id)),
    'deals', p_deal_id
  );

  v_auto := public.get_setting_bool('billing', 'auto_send_invoices', false);
  if v_auto then
    perform public.admin_approve_and_send_invoices(p_deal_id);
  end if;

  perform public.notify_deal_status(p_deal_id, 'awaiting_payment');
  perform public.sync_transaction_record(p_deal_id);
  return v;
end;
$$;

-- Notification template fixes/insertions

-- deal.funded: make subject/body match "入金確認済" wording
update public.notification_templates
set
  subject_template = '[MotoHub] 入金確認済 — 引取予定を登録してください',
  body_template = '売り手が入金を確認しました。引取日時を調整し、MotoHubの取引画面から「引取予定日時」を登録してください。\n\n{{body}}'
where event_type = 'deal.funded';

-- deal.payout_done: avoid legacy "振込完了" wording
update public.notification_templates
set
  subject_template = '[MotoHub] 取引完了処理中',
  body_template = '双方の確認が完了し、運営が取引完了の登録処理を行っています。車両代金の追加振込は不要です。\n\n{{body}}'
where event_type = 'deal.payout_done';

-- Insert missing templates if absent
insert into public.notification_templates (event_type, subject_template, body_template, enabled)
values
  ('deal.agreed', '[MotoHub] 成約のお知らせ', '取引が成約しました。入金指示書の案内に従ってください。\n\n{{body}}', true),
  ('deal.pickup_scheduled', '[MotoHub] 引取予定日時が登録されました', '取引の引取予定日時が登録されました。詳細は取引画面をご確認ください。\n\n{{body}}', true),
  ('deal.message_posted', '[MotoHub] 取引連絡板への投稿', '取引連絡板に新しいメッセージがあります。\n\n{{body}}', true),
  ('payment.deadline_penalty', '[MotoHub] 入金期限超過によるペナルティ', '入金期限を経過したため、信用スコアにペナルティが適用されました。\n\n{{body}}', true)
on conflict (event_type) do update set
  subject_template = excluded.subject_template,
  body_template = excluded.body_template;

-- Reduce duplicate inquiry.created enqueues by letting trg_inquiry_notify own the email
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
      'important',
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

-- Buyer payment report: keep trigger-based admin badge, drop extra notify_all_admins in RPC
create or replace function public.buyer_report_payment_sent(p_deal_id uuid)
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
  if auth.uid() <> v.buyer_id and not public.is_admin() then
    raise exception 'buyer only';
  end if;
  if v.status <> 'awaiting_payment' then
    raise exception 'deal is not awaiting payment';
  end if;

  update public.deals
  set buyer_payment_reported_at = coalesce(buyer_payment_reported_at, now()),
      updated_at = now()
  where id = p_deal_id
  returning * into v;

  perform public.notify_user_email(
    'deal.buyer_payment_reported',
    v.seller_id,
    format('取引 %s について、買い手が振込済みと報告しました。口座着金を確認し、「入金確認」を登録してください。', p_deal_id)
  );

  return v;
end;
$$;
