-- 入金期限超過: 1営業日ごとに trust -5（二重防止・免除可）

create table if not exists public.payment_deadline_penalty_applied (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  kind text not null check (kind in ('vehicle_payment', 'platform_fee')),
  penalty_date date not null,
  penalty_points int not null default 5,
  penalty_history_id uuid references public.penalty_history (id) on delete set null,
  waived boolean not null default false,
  waived_by uuid references public.profiles (id) on delete set null,
  waived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (deal_id, kind, penalty_date)
);

create index if not exists payment_deadline_penalty_deal_idx
  on public.payment_deadline_penalty_applied (deal_id, kind, penalty_date);

alter table public.payment_deadline_penalty_applied enable row level security;

drop policy if exists payment_deadline_penalty_admin on public.payment_deadline_penalty_applied;
create policy payment_deadline_penalty_admin on public.payment_deadline_penalty_applied
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

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
    p_user_id,
    5,
    p_reason,
    'moderate'::public.penalty_category,
    null,
    true,
    p_deal_id,
    null
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
    'deals',
    p_deal_id
  );

  return true;
end;
$$;

create or replace function public.admin_waive_payment_deadline_penalty(
  p_deal_id uuid,
  p_kind text,
  p_penalty_date date,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  update public.payment_deadline_penalty_applied
  set waived = true, waived_by = auth.uid(), waived_at = now()
  where deal_id = p_deal_id and kind = p_kind and penalty_date = p_penalty_date;
  perform public.write_audit_log(
    'payment_deadline_penalty_waived',
    'deals',
    p_deal_id,
    jsonb_build_object('kind', p_kind, 'penalty_date', p_penalty_date, 'note', p_note)
  );
end;
$$;

grant execute on function public.admin_waive_payment_deadline_penalty(uuid, text, date, text) to authenticated;

-- Count business days strictly after deadline date (JST calendar days, weekends excluded)
create or replace function public.count_overdue_business_days(
  p_deadline_ts timestamptz,
  p_as_of date default (now() at time zone 'Asia/Tokyo')::date
)
returns int
language plpgsql
stable
as $$
declare
  v_start date;
  v_day date;
  v_count int := 0;
begin
  if p_deadline_ts is null then
    return 0;
  end if;
  v_start := (p_deadline_ts at time zone 'Asia/Tokyo')::date;
  if p_as_of <= v_start then
    return 0;
  end if;
  v_day := v_start + 1;
  while v_day <= p_as_of loop
    if public.is_business_day(v_day) then
      v_count := v_count + 1;
    end if;
    v_day := v_day + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.run_payment_deadline_compliance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_overdue_days int;
  v_day date;
  v_applied_vehicle int := 0;
  v_applied_platform int := 0;
  v_reason text;
begin
  -- 車両代金（買い手）: awaiting_payment かつ未確認
  for r in
    select d.id, d.buyer_id, d.payment_due_at, l.maker, l.model
    from public.deals d
    join public.listings l on l.id = d.listing_id
    where d.status = 'awaiting_payment'
      and d.payment_due_at is not null
      and d.seller_payment_confirmed_at is null
  loop
    v_overdue_days := public.count_overdue_business_days(r.payment_due_at, v_today);
    if v_overdue_days <= 0 then
      continue;
    end if;

    v_day := ((r.payment_due_at at time zone 'Asia/Tokyo')::date) + 1;
    while v_day <= v_today loop
      if public.is_business_day(v_day) then
        v_reason := format(
          '車両代金入金期限超過（%s %s）%s',
          r.maker,
          r.model,
          v_day
        );
        if public.apply_payment_deadline_penalty(
          r.id,
          'vehicle_payment',
          v_day,
          r.buyer_id,
          v_reason
        ) then
          v_applied_vehicle := v_applied_vehicle + 1;
        end if;
      end if;
      v_day := v_day + 1;
    end loop;
  end loop;

  -- MotoHub手数料（売り手）: 請求発行後・未払い
  for r in
    select d.id, d.seller_id, d.platform_fee_due_at, d.platform_fee_paid_at, l.maker, l.model
    from public.deals d
    join public.listings l on l.id = d.listing_id
    where d.platform_fee_due_at is not null
      and d.platform_fee_paid_at is null
      and exists (
        select 1 from public.invoices i
        where i.deal_id = d.id
          and i.document_kind = 'platform_fee'
          and i.status in ('issued', 'review_pending')
          and i.total_inc_tax > 0
      )
  loop
    v_overdue_days := public.count_overdue_business_days(r.platform_fee_due_at, v_today);
    if v_overdue_days <= 0 then
      continue;
    end if;

    v_day := ((r.platform_fee_due_at at time zone 'Asia/Tokyo')::date) + 1;
    while v_day <= v_today loop
      if public.is_business_day(v_day) then
        v_reason := format(
          'MotoHub手数料支払期限超過（%s %s）%s',
          r.maker,
          r.model,
          v_day
        );
        if public.apply_payment_deadline_penalty(
          r.id,
          'platform_fee',
          v_day,
          r.seller_id,
          v_reason
        ) then
          v_applied_platform := v_applied_platform + 1;
        end if;
      end if;
      v_day := v_day + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'vehicle_penalties_applied', v_applied_vehicle,
    'platform_penalties_applied', v_applied_platform
  );
end;
$$;

grant execute on function public.run_payment_deadline_compliance_job() to authenticated;
