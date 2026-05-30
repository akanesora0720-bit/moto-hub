-- パーツ発送・引渡し管理 + 週次手数料計上

do $$
begin
  if not exists (select 1 from pg_type where typname = 'part_fulfillment_mode') then
    create type public.part_fulfillment_mode as enum ('shipping', 'direct');
  end if;
end
$$;

alter table public.part_sales
  add column if not exists shipped_at timestamptz,
  add column if not exists handover_at timestamptz,
  add column if not exists buyer_payment_confirmed_at timestamptz,
  add column if not exists fee_accrued_at timestamptz,
  add column if not exists fulfillment_mode public.part_fulfillment_mode;

comment on column public.part_sales.shipped_at is '発送完了日時';
comment on column public.part_sales.handover_at is '引渡し完了日時';

-- ---------------------------------------------------------------------------
-- Part fee accrual
-- ---------------------------------------------------------------------------
create or replace function public.accrue_part_platform_fee(p_part_sale_id uuid)
returns public.platform_fee_accruals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.part_sales;
  v_week_start date;
  v_week_end date;
  v_row public.platform_fee_accruals;
  v_accrued_at timestamptz;
begin
  select * into v_sale from public.part_sales where id = p_part_sale_id;
  if v_sale.id is null then
    raise exception 'part sale not found';
  end if;
  if v_sale.shipped_at is null and v_sale.handover_at is null then
    raise exception 'fulfillment not completed';
  end if;

  select * into v_row
  from public.platform_fee_accruals
  where part_sale_id = p_part_sale_id
    and status in ('pending', 'invoiced')
  limit 1;
  if v_row.id is not null then
    return v_row;
  end if;

  v_accrued_at := coalesce(v_sale.shipped_at, v_sale.handover_at, now());

  select week_start, week_end into v_week_start, v_week_end
  from public.billing_week_bounds_for_ts(v_accrued_at);

  insert into public.platform_fee_accruals (
    accrual_type,
    part_sale_id,
    seller_id,
    agreed_price_ex_tax,
    fee_ex_tax,
    fee_tax,
    fee_inc_tax,
    accrued_at,
    billing_week_start,
    billing_week_end,
    status
  )
  values (
    'part',
    p_part_sale_id,
    v_sale.seller_id,
    v_sale.agreed_price_ex_tax,
    v_sale.seller_fee_ex_tax,
    v_sale.seller_fee_tax,
    v_sale.seller_fee_inc_tax,
    v_accrued_at,
    v_week_start,
    v_week_end,
    case when v_sale.seller_fee_ex_tax <= 0 then 'waived'::public.platform_fee_accrual_status else 'pending'::public.platform_fee_accrual_status end
  )
  returning * into v_row;

  update public.part_sales
  set fee_accrued_at = coalesce(fee_accrued_at, v_accrued_at)
  where id = p_part_sale_id;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- issue_part_sale_invoices: buyer payment instruction only
-- ---------------------------------------------------------------------------
create or replace function public.issue_part_sale_invoices(p_part_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.part_sales;
  v_vehicle_tax int;
  v_vehicle_inc int;
  v_buyer_inv uuid;
begin
  select * into v_sale from public.part_sales where id = p_part_sale_id;
  if v_sale.id is null then
    raise exception 'part sale not found';
  end if;

  v_vehicle_tax := public.calc_consumption_tax(v_sale.agreed_price_ex_tax);
  v_vehicle_inc := v_sale.agreed_price_ex_tax + v_vehicle_tax;

  insert into public.invoices (
    deal_id,
    inspection_request_id,
    billing_month,
    part_sale_id,
    user_id,
    party,
    document_kind,
    status,
    total_ex_tax,
    total_tax,
    total_inc_tax,
    issued_at
  )
  values (
    null,
    null,
    null,
    p_part_sale_id,
    v_sale.buyer_id,
    'buyer',
    'part_payment_instruction',
    'issued',
    v_sale.agreed_price_ex_tax,
    v_vehicle_tax,
    v_vehicle_inc,
    now()
  )
  on conflict (part_sale_id, party) where part_sale_id is not null do update set
    document_kind = excluded.document_kind,
    status = excluded.status,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    issued_at = excluded.issued_at,
    updated_at = now()
  returning id into v_buyer_inv;

  delete from public.invoice_items where invoice_id = v_buyer_inv;
  insert into public.invoice_items (
    invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order
  )
  values (
    v_buyer_inv, 'part_price', 'パーツ代金', v_sale.agreed_price_ex_tax, v_vehicle_tax, v_vehicle_inc, 0
  );

  update public.invoices
  set status = 'cancelled',
      admin_note = coalesce(admin_note, '') || ' 週次請求へ移行のため取消',
      updated_at = now()
  where part_sale_id = p_part_sale_id
    and document_kind = 'part_platform_fee'
    and status in ('draft', 'review_pending', 'issued');

  return jsonb_build_object(
    'buyer_invoice_id', v_buyer_inv,
    'seller_invoice_id', null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Fulfillment RPCs
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
  if v_sale.handover_at is not null then
    return v_sale;
  end if;
  if v_sale.shipped_at is not null then
    raise exception 'already shipped';
  end if;

  update public.part_sales
  set handover_at = now(),
      fulfillment_mode = coalesce(fulfillment_mode, 'direct'::public.part_fulfillment_mode)
  where id = p_part_sale_id
  returning * into v_sale;

  perform public.accrue_part_platform_fee(p_part_sale_id);
  return v_sale;
end;
$$;

create or replace function public.confirm_part_sale_buyer_payment(p_part_sale_id uuid)
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

  update public.part_sales
  set buyer_payment_confirmed_at = coalesce(buyer_payment_confirmed_at, now())
  where id = p_part_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

-- Backfill: sales with fee but no fulfillment — leave for manual; cancel orphan fee invoices done above

do $$
declare
  r record;
begin
  for r in
    select id from public.part_sales
    where (shipped_at is not null or handover_at is not null)
      and fee_accrued_at is null
  loop
    begin
      perform public.accrue_part_platform_fee(r.id);
    exception when others then
      raise notice 'accrue_part %: %', r.id, sqlerrm;
    end;
  end loop;
end;
$$;

grant execute on function public.accrue_part_platform_fee(uuid) to authenticated;
grant execute on function public.mark_part_sale_shipped(uuid) to authenticated;
grant execute on function public.mark_part_sale_handover(uuid) to authenticated;
grant execute on function public.confirm_part_sale_buyer_payment(uuid) to authenticated;
