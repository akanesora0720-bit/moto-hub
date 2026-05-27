-- 月額会費: RED帯の請求発行時に「利用停止審査」通知を追加

create or replace function public.issue_monthly_membership_invoices(p_billing_month date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_billing_month)::date;
  v_fee_ex int;
  v_tax int;
  v_inc int;
  v_issue_day int;
  v_due_day int;
  v_y int := extract(year from v_month)::int;
  v_m int := extract(month from v_month)::int;
  v_issued_at timestamptz;
  v_due_at timestamptz;
  v_label text;
  v_created int := 0;
  v_skipped int := 0;
  r record;
  v_inv_id uuid;
begin
  v_issue_day := public.get_billing_int_setting('monthly_membership_issue_day', 20);
  v_due_day := public.get_billing_int_setting('monthly_membership_due_day', 26);
  v_issued_at := make_timestamptz(v_y, v_m, v_issue_day, 0, 0, 0, 'Asia/Tokyo');
  v_due_at := make_timestamptz(v_y, v_m, v_due_day, 23, 59, 59, 'Asia/Tokyo');

  for r in
    select p.id, p.email, p.store_name, p.trust_rank
    from public.profiles p
    where p.member_type = 'dealer'
      and p.account_status = 'approved'::public.account_status
      and p.is_active = true
      and not p.is_banned
  loop
    if exists (
      select 1 from public.invoices i
      where i.user_id = r.id
        and i.document_kind = 'monthly_membership'
        and i.billing_month = v_month
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_fee_ex := public.monthly_membership_fee_ex_tax_for_rank(r.trust_rank);
    if v_fee_ex <= 0 then
      raise exception 'invalid fee for rank %', r.trust_rank;
    end if;

    v_tax := public.calc_consumption_tax(v_fee_ex);
    v_inc := v_fee_ex + v_tax;
    v_label := format(
      'MotoHub加盟店 月額会費（%s年%s月分・%s）',
      v_y,
      v_m,
      public.trust_rank_label_ja(r.trust_rank)
    );

    insert into public.invoices (
      deal_id,
      inspection_request_id,
      billing_month,
      billing_trust_rank,
      user_id,
      party,
      document_kind,
      status,
      total_ex_tax,
      total_tax,
      total_inc_tax,
      issued_at,
      payment_due_at
    )
    values (
      null,
      null,
      v_month,
      r.trust_rank,
      r.id,
      'seller',
      'monthly_membership',
      'issued',
      v_fee_ex,
      v_tax,
      v_inc,
      v_issued_at,
      v_due_at
    )
    returning id into v_inv_id;

    insert into public.invoice_items (
      invoice_id,
      item_type,
      label,
      amount_ex_tax,
      tax_amount,
      amount_inc_tax,
      sort_order
    )
    values (
      v_inv_id,
      'membership_fee',
      v_label,
      v_fee_ex,
      v_tax,
      v_inc,
      0
    );

    perform public.insert_user_notification(
      r.id,
      '月額会費の請求書を発行しました',
      format(
        '%s年%s月分（%s）· 税込 %s円 · お支払期限 %s月%s日まで',
        v_y,
        v_m,
        public.trust_rank_label_ja(r.trust_rank),
        v_inc,
        v_m,
        v_due_day
      ),
      'important',
      '/my/payments'
    );

    perform public.notify_enqueue(
      'membership.invoice_issued',
      jsonb_build_object(
        'body', format(
          '%s · %s年%s月分（%s）税込%s円 · 支払期限 %s月%s日',
          coalesce(r.store_name, r.email),
          v_y,
          v_m,
          public.trust_rank_label_ja(r.trust_rank),
          v_inc,
          v_m,
          v_due_day
        )
      ),
      'invoices',
      v_inv_id
    );

    if r.trust_rank = 'RED'::public.trust_rank then
      perform public.notify_enqueue(
        'membership.red_review_required',
        jsonb_build_object(
          'body', format(
            'RED帯の月額請求を発行しました。利用停止審査を検討してください。\n\n加盟店: %s\n対象月: %s年%s月\n税抜: %s円（税込 %s円）\n請求ID: %s',
            coalesce(r.store_name, r.email),
            v_y,
            v_m,
            v_fee_ex,
            v_inc,
            v_inv_id
          )
        ),
        'invoices',
        v_inv_id
      );
    end if;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'billing_month', v_month,
    'created', v_created,
    'skipped_existing', v_skipped,
    'due_at', v_due_at
  );
end;
$$;

insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'membership.red_review_required',
  'email',
  '[MotoHub] RED帯: 利用停止審査の検討',
  'RED帯の加盟店で月額会費の請求書を発行しました。利用停止審査を検討してください。\n\n{{body}}',
  true
)
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

