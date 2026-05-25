-- 034 で partial unique index 化したあと ON CONFLICT (deal_id, party) が失敗する問題を修正
-- 完了済み取引で下書きのまま残った入金指示書は記録上「送信済」に同期（業務は既に進行済みのため）

create or replace function public.ensure_deal_billing(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_price int;
  v_rates jsonb;
  v_seller_rate numeric;
  v_vehicle_tax int;
  v_vehicle_inc int;
  v_fee_ex int;
  v_fee_tax int;
  v_fee_inc int;
  v_fee_label text;
  v_buyer_doc uuid;
  v_seller_doc uuid;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  v_price := v_deal.agreed_price_ex_tax;
  v_rates := public.resolve_deal_fee_rates(v_price);
  v_seller_rate := (v_rates->>'seller_fee_rate')::numeric;

  update public.deals
  set buyer_fee_rate = (v_rates->>'buyer_fee_rate')::numeric,
      seller_fee_rate = v_seller_rate,
      updated_at = now()
  where id = p_deal_id;

  v_vehicle_tax := public.calc_consumption_tax(v_price);
  v_vehicle_inc := v_price + v_vehicle_tax;
  v_fee_ex := round(v_price * v_seller_rate)::int;
  v_fee_tax := public.calc_consumption_tax(v_fee_ex);
  v_fee_inc := v_fee_ex + v_fee_tax;

  if v_fee_ex > 0 then
    v_fee_label := 'MotoHub利用手数料（5%・税抜）';
  else
    v_fee_label := 'MotoHub利用手数料（30,000円以下のため対象外）';
  end if;

  insert into public.invoices (
    deal_id, user_id, party, document_kind, status,
    total_ex_tax, total_tax, total_inc_tax
  )
  values (
    p_deal_id,
    v_deal.buyer_id,
    'buyer',
    'payment_instruction',
    'draft',
    v_price,
    v_vehicle_tax,
    v_vehicle_inc
  )
  on conflict (deal_id, party) where deal_id is not null do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_buyer_doc;

  insert into public.invoices (
    deal_id, user_id, party, document_kind, status,
    total_ex_tax, total_tax, total_inc_tax
  )
  values (
    p_deal_id,
    v_deal.seller_id,
    'seller',
    'platform_fee',
    'draft',
    v_fee_ex,
    v_fee_tax,
    v_fee_inc
  )
  on conflict (deal_id, party) where deal_id is not null do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_seller_doc;

  select id into v_buyer_doc
  from public.invoices
  where deal_id = p_deal_id and party = 'buyer';

  select id into v_seller_doc
  from public.invoices
  where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_doc, v_seller_doc);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_buyer_doc, 'vehicle_price', '車両代（税抜）', v_price, 0, v_price, 1),
    (v_buyer_doc, 'consumption_tax', '消費税（10%）', v_vehicle_tax, 0, v_vehicle_tax, 2);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_seller_doc, 'seller_fee', v_fee_label, v_fee_ex, v_fee_tax, v_fee_inc, 1);

  delete from public.payouts where deal_id = p_deal_id;

  return jsonb_build_object(
    'payment_instruction_id', v_buyer_doc,
    'platform_fee_invoice_id', v_seller_doc,
    'fee_tier', v_rates->>'fee_tier',
    'platform_fee_ex_tax', v_fee_ex
  );
end;
$$;

-- 既に入金待ち以降に進んだ取引の入金指示書（下書きのまま残存）を記録同期
update public.invoices i
set
  status = 'issued',
  issued_at = coalesce(i.issued_at, now()),
  updated_at = now()
from public.deals d
where i.deal_id = d.id
  and i.document_kind = 'payment_instruction'
  and i.status in ('draft', 'review_pending')
  and d.status not in ('awaiting_payment', 'inquiry', 'negotiating', 'agreed', 'cancelled');
