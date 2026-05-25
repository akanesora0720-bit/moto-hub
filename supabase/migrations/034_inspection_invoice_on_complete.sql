-- MotoHub査定: 請求書は査定完了（出品代行完了）時に発行

-- ---------------------------------------------------------------------------
-- invoices: 取引以外（査定依頼）に対応
-- ---------------------------------------------------------------------------
alter table public.invoices
  alter column deal_id drop not null;

alter table public.invoices
  add column if not exists inspection_request_id uuid
    references public.inspection_requests (id) on delete cascade;

alter table public.inspection_requests
  add column if not exists invoice_id uuid references public.invoices (id) on delete set null;

alter table public.invoices
  drop constraint if exists invoices_deal_party_unique;

create unique index if not exists invoices_deal_party_unique
  on public.invoices (deal_id, party)
  where deal_id is not null;

create unique index if not exists invoices_inspection_request_unique
  on public.invoices (inspection_request_id)
  where inspection_request_id is not null;

alter table public.invoices
  drop constraint if exists invoices_source_check;

alter table public.invoices
  add constraint invoices_source_check
  check (
    (deal_id is not null and inspection_request_id is null)
    or (deal_id is null and inspection_request_id is not null)
  );

alter table public.invoices
  drop constraint if exists invoices_document_kind_check;

alter table public.invoices
  add constraint invoices_document_kind_check
  check (document_kind in (
    'legacy', 'payment_instruction', 'platform_fee', 'motohub_inspection'
  ));

-- ---------------------------------------------------------------------------
-- 査定完了時に請求書発行（税抜 fee_ex_tax + 消費税10%）
-- ---------------------------------------------------------------------------
create or replace function public.issue_motohub_inspection_invoice(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.inspection_requests;
  v_inv_id uuid;
  v_tax int;
  v_inc int;
  v_label text;
begin
  select * into v_req from public.inspection_requests where id = p_request_id;
  if v_req.id is null then raise exception 'inspection request not found'; end if;
  if v_req.status <> 'completed' then
    raise exception 'inspection must be completed before invoicing';
  end if;

  if v_req.invoice_id is not null then
    return v_req.invoice_id;
  end if;

  select id into v_inv_id
  from public.invoices
  where inspection_request_id = p_request_id;

  if v_inv_id is not null then
    update public.inspection_requests
    set invoice_id = v_inv_id, updated_at = now()
    where id = p_request_id;
    return v_inv_id;
  end if;

  v_tax := public.calc_consumption_tax(v_req.fee_ex_tax);
  v_inc := v_req.fee_ex_tax + v_tax;
  v_label := format(
    'MotoHub査定サービス（%s・現車確認・出品代行）',
    v_req.vehicle_name
  );

  insert into public.invoices (
    deal_id,
    inspection_request_id,
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
    p_request_id,
    v_req.dealer_id,
    'seller',
    'motohub_inspection',
    'issued',
    v_req.fee_ex_tax,
    v_tax,
    v_inc,
    now()
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
    'adjustment',
    v_label,
    v_req.fee_ex_tax,
    v_tax,
    v_inc,
    1
  );

  update public.inspection_requests
  set invoice_id = v_inv_id, updated_at = now()
  where id = p_request_id;

  perform public.notify_user_email(
    'invoice.issued',
    v_req.dealer_id,
    format(
      'MotoHub査定（%s）の請求書を発行しました（税抜 ¥%s・税込 ¥%s）。査定画面または請求書PDFからご確認ください。',
      v_req.vehicle_name,
      v_req.fee_ex_tax,
      v_inc
    ),
    'MotoHub: 査定サービス請求書'
  );

  return v_inv_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 査定完了 RPC: バッジ付与後に請求書発行
-- ---------------------------------------------------------------------------
create or replace function public.complete_motohub_inspection(
  p_request_id uuid,
  p_listing_id uuid
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_listing public.listings;
  v_staff uuid := auth.uid();
begin
  if not public.is_motohub_inspection_staff() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.status = 'cancelled' then raise exception 'request cancelled'; end if;
  if v.status = 'completed' then raise exception 'already completed'; end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if v_listing.id is null then raise exception 'listing not found'; end if;
  if v_listing.seller_id <> v.dealer_id then
    raise exception 'listing seller must match request dealer';
  end if;

  update public.listings
  set
    inspection_badge_type = 'motohub_inspected',
    inspected_by_staff_id = v_staff,
    inspection_completed_at = now(),
    inspection_status = false,
    updated_at = now()
  where id = p_listing_id;

  update public.inspection_requests
  set
    listing_id = p_listing_id,
    status = 'completed',
    completed_at = now(),
    assigned_staff_id = coalesce(assigned_staff_id, v_staff),
    updated_at = now()
  where id = p_request_id
  returning * into v;

  perform public.write_status_audit_log(
    'motohub_inspection_completed',
    'listings',
    p_listing_id,
    'none',
    'motohub_inspected',
    v_staff
  );

  perform public.issue_motohub_inspection_invoice(p_request_id);

  perform public.notify_user_email(
    'inspection.completed',
    v.dealer_id,
    format(
      'MotoHub査定が完了し出品しました（%s）。「MotoHub査定済」バッジを付与済みです。査定サービス料の請求書を発行しました。',
      v.vehicle_name
    ),
    'MotoHub: 査定・出品代行完了'
  );

  select * into v from public.inspection_requests where id = p_request_id;
  return v;
end;
$$;
