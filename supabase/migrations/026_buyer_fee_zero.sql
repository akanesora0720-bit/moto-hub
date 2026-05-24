-- Buyer fee 0% / Seller fee 5% — enforce on all deals and regenerate invoices

alter table public.deals
  alter column buyer_fee_rate set default 0,
  alter column seller_fee_rate set default 0.05;

update public.deals
set buyer_fee_rate = 0,
    seller_fee_rate = 0.05
where buyer_fee_rate is distinct from 0
   or seller_fee_rate is distinct from 0.05;

create or replace function public.ensure_deal_billing(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_buyer_fee int := 0;
  v_seller_fee int;
  v_buyer_tax int := 0;
  v_seller_tax int;
  v_buyer_inv uuid;
  v_seller_inv uuid;
  v_price int;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  v_price := v_deal.agreed_price_ex_tax;
  v_seller_fee := round(v_price * 0.05)::int;
  v_seller_tax := round(v_seller_fee * 0.1)::int;

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id,
    v_deal.buyer_id,
    'buyer',
    'draft',
    v_price,
    0,
    v_price
  )
  on conflict (deal_id, party) do update set
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_buyer_inv;

  insert into public.invoices (deal_id, user_id, party, status, total_ex_tax, total_tax, total_inc_tax)
  values (
    p_deal_id,
    v_deal.seller_id,
    'seller',
    'draft',
    v_price - v_seller_fee,
    v_seller_tax,
    v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id, party) do update set
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_seller_inv;

  select id into v_buyer_inv from public.invoices where deal_id = p_deal_id and party = 'buyer';
  select id into v_seller_inv from public.invoices where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_inv, v_seller_inv);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_buyer_inv, 'vehicle_price', '落札価格（税抜）', v_price, 0, v_price, 1);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_seller_inv, 'vehicle_price', '成約価格（税抜）', v_price, 0, v_price, 1),
    (v_seller_inv, 'seller_fee', '売り手手数料（5%）', -v_seller_fee, -v_seller_tax, -(v_seller_fee + v_seller_tax), 2);

  insert into public.payouts (deal_id, seller_id, gross_vehicle_price, seller_fee_ex_tax, seller_fee_tax, payout_amount)
  values (
    p_deal_id,
    v_deal.seller_id,
    v_price,
    v_seller_fee,
    v_seller_tax,
    v_price - v_seller_fee - v_seller_tax
  )
  on conflict (deal_id) do update set
    gross_vehicle_price = excluded.gross_vehicle_price,
    seller_fee_ex_tax = excluded.seller_fee_ex_tax,
    seller_fee_tax = excluded.seller_fee_tax,
    payout_amount = excluded.payout_amount;

  return jsonb_build_object('buyer_invoice_id', v_buyer_inv, 'seller_invoice_id', v_seller_inv);
end;
$$;

-- Regenerate billing for non-cancelled deals
do $$
declare
  r record;
begin
  for r in
    select id from public.deals
    where status not in ('cancelled')
  loop
    perform public.ensure_deal_billing(r.id);
  end loop;
end;
$$;
