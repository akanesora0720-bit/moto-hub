-- 方針: 期限超過は基本どおり自動減点。取引完了までの経緯に応じて運営が事後調整（復元）可能。

create or replace function public.apply_transfer_deadline_penalty(
  p_deal_id uuid,
  p_penalty_date date,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_exists boolean;
  v_hist uuid;
begin
  select exists (
    select 1 from public.transfer_deadline_penalty_applied
    where deal_id = p_deal_id and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  select seller_id into v_seller from public.deals where id = p_deal_id;
  if v_seller is null then return false; end if;

  perform public.apply_dealer_penalty(
    v_seller, 5, p_reason, 'moderate'::public.penalty_category,
    null, true, p_deal_id, null, 'auto_penalty'
  );

  select id into v_hist
  from public.penalty_history
  where dealer_id = v_seller
  order by created_at desc
  limit 1;

  insert into public.transfer_deadline_penalty_applied (
    deal_id, penalty_date, penalty_points, penalty_history_id
  )
  values (p_deal_id, p_penalty_date, 5, v_hist);

  perform public.notify_enqueue(
    'transfer.penalty_applied',
    jsonb_build_object('body', format('取引 %s\n%s', p_deal_id, p_reason)),
    'deals', p_deal_id
  );

  return true;
end;
$$;

create or replace function public.apply_payment_deadline_penalty(
  p_deal_id uuid,
  p_kind text,
  p_penalty_date date,
  p_user_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_hist uuid;
begin
  if p_kind not in ('vehicle_payment', 'platform_fee') then
    raise exception 'invalid penalty kind';
  end if;

  select exists (
    select 1 from public.payment_deadline_penalty_applied
    where deal_id = p_deal_id and kind = p_kind and penalty_date = p_penalty_date and not waived
  ) into v_exists;
  if v_exists then return false; end if;

  perform public.apply_dealer_penalty(
    p_user_id, 5, p_reason, 'moderate'::public.penalty_category,
    null, true, p_deal_id, null, 'auto_penalty'
  );

  select id into v_hist
  from public.penalty_history
  where dealer_id = p_user_id
  order by created_at desc
  limit 1;

  insert into public.payment_deadline_penalty_applied (
    deal_id, kind, penalty_date, penalty_points, penalty_history_id
  )
  values (p_deal_id, p_kind, p_penalty_date, 5, v_hist);

  perform public.notify_enqueue(
    'payment.deadline_penalty',
    jsonb_build_object('body', format('取引 %s\n%s', p_deal_id, p_reason), 'kind', p_kind),
    'deals', p_deal_id
  );

  return true;
end;
$$;

alter table public.deals
  add column if not exists penalty_adjustment_note text;

comment on column public.deals.penalty_adjustment_note is
  '運営: 当該取引の減点調整・経緯メモ（自動減点後の最終判断用）';

create or replace function public.admin_set_deal_penalty_note(
  p_deal_id uuid,
  p_note text
)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;

  update public.deals
  set penalty_adjustment_note = nullif(trim(p_note), '')
  where id = p_deal_id
  returning * into v_deal;

  if v_deal.id is null then raise exception 'deal not found'; end if;

  perform public.write_audit_log(
    'deal_penalty_note', 'deals', p_deal_id, jsonb_build_object('note', p_note)
  );

  return v_deal;
end;
$$;

grant execute on function public.admin_set_deal_penalty_note(uuid, text) to authenticated;
