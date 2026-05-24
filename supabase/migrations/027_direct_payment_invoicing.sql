-- Direct buyer→seller payment, tax-inclusive vehicle price, MotoHub platform fee invoice

-- ---------------------------------------------------------------------------
-- Profiles: bank account + address (required for dealers)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists trade_name text,
  add column if not exists address text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text,
  add column if not exists bank_account_type text default '普通',
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text;

-- ---------------------------------------------------------------------------
-- Deals: payment deadline + seller payment confirmation
-- ---------------------------------------------------------------------------
alter table public.deals
  add column if not exists payment_due_at timestamptz,
  add column if not exists seller_payment_confirmed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Invoice document kind
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists document_kind text not null default 'legacy';

alter table public.invoices
  drop constraint if exists invoices_document_kind_check;

alter table public.invoices
  add constraint invoices_document_kind_check
  check (document_kind in ('legacy', 'payment_instruction', 'platform_fee'));

-- ---------------------------------------------------------------------------
-- Tax helpers
-- ---------------------------------------------------------------------------
create or replace function public.calc_consumption_tax(p_ex_tax int)
returns int
language sql
immutable
as $$
  select round(p_ex_tax * 0.1)::int;
$$;

create or replace function public.calc_vehicle_price_inc_tax(p_ex_tax int)
returns int
language sql
immutable
as $$
  select p_ex_tax + public.calc_consumption_tax(p_ex_tax);
$$;

-- ---------------------------------------------------------------------------
-- Contact reveal: agreed / awaiting_payment から（売り手振込先開示）
-- ---------------------------------------------------------------------------
create or replace function public.deal_contact_reveal_allowed(p_status public.deal_status)
returns boolean
language sql
immutable
as $$
  select p_status in (
    'agreed', 'awaiting_payment',
    'funded', 'handover_done', 'transfer_pending',
    'payout_ready', 'payout_done', 'completed', 'dispute'
  );
$$;

create or replace function public.get_deal_party_contacts(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_buyer jsonb;
  v_seller jsonb;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;
  if auth.uid() not in (v_deal.buyer_id, v_deal.seller_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if not public.deal_contact_reveal_allowed(v_deal.status) then
    return jsonb_build_object('revealed', false);
  end if;

  select jsonb_build_object(
    'store_name', store_name,
    'trade_name', trade_name,
    'contact_name', contact_name,
    'phone', phone,
    'email', email,
    'invoice_number', invoice_number,
    'address', address,
    'prefecture', prefecture
  ) into v_buyer from public.profiles where id = v_deal.buyer_id;

  select jsonb_build_object(
    'store_name', store_name,
    'trade_name', trade_name,
    'contact_name', contact_name,
    'phone', phone,
    'email', email,
    'invoice_number', invoice_number,
    'address', address,
    'prefecture', prefecture,
    'bank_name', bank_name,
    'bank_branch', bank_branch,
    'bank_account_type', bank_account_type,
    'bank_account_number', bank_account_number,
    'bank_account_holder', bank_account_holder
  ) into v_seller from public.profiles where id = v_deal.seller_id;

  return jsonb_build_object('revealed', true, 'buyer', v_buyer, 'seller', v_seller);
end;
$$;

-- ---------------------------------------------------------------------------
-- Billing: payment instruction (buyer) + platform fee invoice (seller)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_deal_billing(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_price int;
  v_vehicle_tax int;
  v_vehicle_inc int;
  v_fee_ex int;
  v_fee_tax int;
  v_fee_inc int;
  v_buyer_doc uuid;
  v_seller_doc uuid;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  v_price := v_deal.agreed_price_ex_tax;
  v_vehicle_tax := public.calc_consumption_tax(v_price);
  v_vehicle_inc := v_price + v_vehicle_tax;
  v_fee_ex := round(v_price * 0.05)::int;
  v_fee_tax := public.calc_consumption_tax(v_fee_ex);
  v_fee_inc := v_fee_ex + v_fee_tax;

  -- Buyer: payment instruction (pay seller directly)
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
  on conflict (deal_id, party) do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_buyer_doc;

  -- Seller: MotoHub platform fee invoice
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
  on conflict (deal_id, party) do update set
    document_kind = excluded.document_kind,
    total_ex_tax = excluded.total_ex_tax,
    total_tax = excluded.total_tax,
    total_inc_tax = excluded.total_inc_tax,
    updated_at = now()
  returning id into v_seller_doc;

  select id into v_buyer_doc from public.invoices where deal_id = p_deal_id and party = 'buyer';
  select id into v_seller_doc from public.invoices where deal_id = p_deal_id and party = 'seller';

  delete from public.invoice_items where invoice_id in (v_buyer_doc, v_seller_doc);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_buyer_doc, 'vehicle_price', '車両代（税抜）', v_price, 0, v_price, 1),
    (v_buyer_doc, 'consumption_tax', '消費税（10%）', v_vehicle_tax, 0, v_vehicle_tax, 2);

  insert into public.invoice_items (invoice_id, item_type, label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order)
  values
    (v_seller_doc, 'seller_fee', 'MotoHub利用手数料（5%・税抜）', v_fee_ex, v_fee_tax, v_fee_inc, 1);

  -- No vehicle escrow payout; remove legacy vehicle remittance rows
  delete from public.payouts where deal_id = p_deal_id;

  return jsonb_build_object(
    'payment_instruction_id', v_buyer_doc,
    'platform_fee_invoice_id', v_seller_doc
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Issue platform fee invoice to seller (after buyer payment confirmed)
-- ---------------------------------------------------------------------------
create or replace function public.issue_platform_fee_invoice(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'issued',
      issued_at = coalesce(issued_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and party = 'seller'
    and document_kind = 'platform_fee'
    and status in ('draft', 'review_pending');

  perform public.notify_user_email(
    'invoice.issued',
    v_deal.seller_id,
    format('取引 %s のMotoHub手数料請求書を発行しました。取引詳細からPDFを確認できます。', p_deal_id)
  );
end;
$$;

grant execute on function public.issue_platform_fee_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seller confirms buyer paid directly
-- ---------------------------------------------------------------------------
create or replace function public.seller_confirm_buyer_payment(p_deal_id uuid)
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

  perform public.issue_platform_fee_invoice(p_deal_id);
  perform public.notify_deal_status(p_deal_id, 'funded');

  return v;
end;
$$;

grant execute on function public.seller_confirm_buyer_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Finalize agreement → awaiting_payment + payment instruction review
-- ---------------------------------------------------------------------------
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
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if not v.seller_intent_confirmed or not v.buyer_intent_confirmed then
    raise exception 'both parties must be confirmed by admin';
  end if;
  if v.status not in ('inquiry', 'negotiating') then
    raise exception 'invalid deal status for agreement';
  end if;

  update public.deals
  set status = 'awaiting_payment',
      payment_due_at = coalesce(payment_due_at, now() + interval '7 days'),
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
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approve: send payment instruction to buyer, notify seller of deal
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_and_send_invoices(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals%rowtype;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v_deal from public.deals where id = p_deal_id;
  if not found then raise exception 'deal not found'; end if;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'issued',
      issued_at = coalesce(issued_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and party = 'buyer'
    and document_kind = 'payment_instruction'
    and status in ('draft', 'review_pending');

  perform public.notify_user_email(
    'invoice.issued',
    v_deal.buyer_id,
    format('取引 %s の入金指示書を発行しました。売り手へ直接お振込みください。', p_deal_id)
  );
  perform public.notify_user_email(
    'deal.agreed',
    v_deal.seller_id,
    format('取引 %s が成約しました。買い手からの入金をご確認ください。', p_deal_id)
  );

  return public.ensure_deal_billing(p_deal_id);
end;
$$;

-- Regenerate billing for active deals
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
