-- 入金確認・取引進行後も resolved=false のまま残る deal_alerts を自動解消

create or replace function public.resolve_stale_deal_alerts_for_deal(p_deal_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.deal_alerts a
  set resolved = true
  from public.deals d
  where a.deal_id = p_deal_id
    and d.id = p_deal_id
    and a.resolved = false
    and (
      (
        a.alert_type = 'buyer_payment_reported'
        and (
          d.seller_payment_confirmed_at is not null
          or d.funded_at is not null
          or d.status <> 'awaiting_payment'
        )
      )
      or (
        a.alert_type in ('transfer_overdue', 'transfer_due_soon')
        and (
          d.status <> 'transfer_pending'
          or d.transfer_completed_at is not null
          or not coalesce(d.requires_name_transfer, false)
        )
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.trg_deals_resolve_stale_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.resolve_stale_deal_alerts_for_deal(new.id);
  return new;
end;
$$;

drop trigger if exists deals_resolve_stale_alerts on public.deals;
create trigger deals_resolve_stale_alerts
  after update of status, seller_payment_confirmed_at, funded_at, transfer_completed_at
  on public.deals
  for each row
  execute function public.trg_deals_resolve_stale_alerts();

-- seller 入金確認時にも明示的に解消
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

  perform public.resolve_stale_deal_alerts_for_deal(p_deal_id);

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

-- 既存の陳腐化アラートを一括解消
update public.deal_alerts a
set resolved = true
from public.deals d
where a.deal_id = d.id
  and a.resolved = false
  and (
    (
      a.alert_type = 'buyer_payment_reported'
      and (
        d.seller_payment_confirmed_at is not null
        or d.funded_at is not null
        or d.status <> 'awaiting_payment'
      )
    )
    or (
      a.alert_type in ('transfer_overdue', 'transfer_due_soon')
      and (
        d.status <> 'transfer_pending'
        or d.transfer_completed_at is not null
        or not coalesce(d.requires_name_transfer, false)
      )
    )
  );

grant execute on function public.resolve_stale_deal_alerts_for_deal(uuid) to authenticated;
