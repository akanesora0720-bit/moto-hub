-- 取引記録書: 成約（agreed）以降の取引についてスナップショットを保存

create table if not exists public.transaction_records (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  vehicle_id uuid not null references public.listings (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,
  buyer_id uuid not null references public.profiles (id) on delete restrict,
  contracted_at timestamptz not null,
  vehicle_name text not null,
  manufacturer text not null,
  displacement int,
  model_year int,
  mileage int,
  vin text not null default '',
  registration_number text not null default '',
  sale_price_ex_tax int not null,
  sale_price_inc_tax int not null,
  platform_fee_ex_tax int not null default 0,
  platform_fee_inc_tax int not null default 0,
  seller_snapshot_json jsonb not null default '{}'::jsonb,
  buyer_snapshot_json jsonb not null default '{}'::jsonb,
  vehicle_snapshot_json jsonb not null default '{}'::jsonb,
  handover_due_at timestamptz,
  handover_completed_at timestamptz,
  documents_status text not null default '',
  payment_status text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_records_deal_id_unique unique (deal_id)
);

create index if not exists transaction_records_contracted_at_idx
  on public.transaction_records (contracted_at desc);

create index if not exists transaction_records_vehicle_name_idx
  on public.transaction_records (vehicle_name);

create index if not exists transaction_records_seller_idx
  on public.transaction_records (seller_id, contracted_at desc);

create index if not exists transaction_records_buyer_idx
  on public.transaction_records (buyer_id, contracted_at desc);

comment on table public.transaction_records is
  'MotoHub業者間取引の記録（売買契約書ではなく補助資料）。成約時点のスナップショットを保持。';

drop trigger if exists transaction_records_set_updated_at on public.transaction_records;
create trigger transaction_records_set_updated_at
  before update on public.transaction_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.transaction_record_viewer_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and not p.is_banned
      and (
        public.is_admin()
        or (
          p.member_type = 'dealer'
          and p.account_status = 'approved'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Snapshot builders
-- ---------------------------------------------------------------------------
create or replace function public.build_profile_snapshot(p_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.profiles%rowtype;
begin
  select * into v from public.profiles where id = p_profile_id;
  if v.id is null then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'store_name', v.store_name,
    'trade_name', v.trade_name,
    'contact_name', v.contact_name,
    'antique_dealer_number', v.antique_dealer_number,
    'invoice_number', v.invoice_number,
    'prefecture', v.prefecture,
    'address', v.address,
    'phone', v.phone,
    'email', v.email
  );
end;
$$;

create or replace function public.derive_transaction_payment_status(p_deal public.deals)
returns text
language plpgsql
stable
set search_path = public
as $$
begin
  if p_deal.status = 'completed' then
    return '完了';
  end if;
  if p_deal.seller_payment_confirmed_at is not null
     or p_deal.status in ('funded', 'handover_done', 'transfer_pending', 'payout_ready', 'payout_done') then
    return '入金確認済（買い手→売り手直接振込）';
  end if;
  if p_deal.buyer_payment_reported_at is not null then
    return '振込報告済・売り手確認待ち';
  end if;
  if p_deal.status = 'awaiting_payment' then
    return '入金待ち';
  end if;
  if p_deal.status in ('agreed', 'inquiry', 'negotiating') then
    return '合意済・入金前';
  end if;
  return '—';
end;
$$;

create or replace function public.derive_transaction_documents_status(p_deal_id uuid, p_deal public.deals)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doc_count int;
begin
  select count(*)::int into v_doc_count
  from public.deal_transfer_documents
  where deal_id = p_deal_id;

  if p_deal.pickup_completed_at is not null then
    if not coalesce(p_deal.requires_name_transfer, false) then
      return '車両・書類引渡済';
    end if;
    if p_deal.transfer_completed_at is not null then
      return '名義変更完了';
    end if;
    if v_doc_count > 0 then
      return format('名変後書類 %s 件提出済', v_doc_count);
    end if;
    return '引渡済・名義変更手続き中';
  end if;

  if p_deal.pickup_scheduled_at is not null then
    return '引取予定登録済・引渡前';
  end if;

  return '引渡前';
end;
$$;

-- ---------------------------------------------------------------------------
-- Upsert from deal
-- ---------------------------------------------------------------------------
create or replace function public.sync_transaction_record(p_deal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals%rowtype;
  v_listing public.listings%rowtype;
  v_rates jsonb;
  v_fee_ex int;
  v_fee_tax int;
  v_vehicle_tax int;
  v_contracted_at timestamptz;
  v_existing public.transaction_records%rowtype;
  v_record_id uuid;
  v_reg text;
begin
  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then
    return null;
  end if;

  if v_deal.status in ('inquiry', 'negotiating', 'cancelled') then
    delete from public.transaction_records where deal_id = p_deal_id;
    return null;
  end if;

  select * into v_listing from public.listings where id = v_deal.listing_id;
  if v_listing.id is null then
    raise exception 'listing not found for deal %', p_deal_id;
  end if;

  select * into v_existing from public.transaction_records where deal_id = p_deal_id;

  v_contracted_at := coalesce(v_existing.contracted_at, now());

  v_rates := public.resolve_deal_fee_rates(v_deal.agreed_price_ex_tax);
  v_fee_ex := round(v_deal.agreed_price_ex_tax * (v_rates->>'seller_fee_rate')::numeric)::int;
  v_fee_tax := public.calc_consumption_tax(v_fee_ex);
  v_vehicle_tax := public.calc_consumption_tax(v_deal.agreed_price_ex_tax);

  v_reg := coalesce(nullif(trim(v_listing.model_designation), ''), '');

  insert into public.transaction_records (
    deal_id,
    vehicle_id,
    seller_id,
    buyer_id,
    contracted_at,
    vehicle_name,
    manufacturer,
    displacement,
    model_year,
    mileage,
    vin,
    registration_number,
    sale_price_ex_tax,
    sale_price_inc_tax,
    platform_fee_ex_tax,
    platform_fee_inc_tax,
    seller_snapshot_json,
    buyer_snapshot_json,
    vehicle_snapshot_json,
    handover_due_at,
    handover_completed_at,
    documents_status,
    payment_status,
    notes
  )
  values (
    p_deal_id,
    v_deal.listing_id,
    v_deal.seller_id,
    v_deal.buyer_id,
    v_contracted_at,
    trim(v_listing.maker || ' ' || v_listing.model),
    v_listing.maker,
    v_listing.displacement_cc,
    v_listing.year,
    v_listing.mileage,
    coalesce(v_listing.frame_number, ''),
    v_reg,
    v_deal.agreed_price_ex_tax,
    v_deal.agreed_price_ex_tax + v_vehicle_tax,
    v_fee_ex,
    v_fee_ex + v_fee_tax,
    public.build_profile_snapshot(v_deal.seller_id),
    public.build_profile_snapshot(v_deal.buyer_id),
    jsonb_build_object(
      'maker', v_listing.maker,
      'model', v_listing.model,
      'vehicle_class', v_listing.vehicle_class,
      'condition_comment', v_listing.condition_comment,
      'inspection_remaining', v_listing.inspection_remaining,
      'model_designation', v_listing.model_designation,
      'engine_model', v_listing.engine_model
    ),
    v_deal.pickup_scheduled_at,
    v_deal.pickup_completed_at,
    public.derive_transaction_documents_status(p_deal_id, v_deal),
    public.derive_transaction_payment_status(v_deal),
    coalesce(v_existing.notes, '')
  )
  on conflict (deal_id) do update set
    platform_fee_ex_tax = excluded.platform_fee_ex_tax,
    platform_fee_inc_tax = excluded.platform_fee_inc_tax,
    handover_due_at = excluded.handover_due_at,
    handover_completed_at = excluded.handover_completed_at,
    documents_status = excluded.documents_status,
    payment_status = excluded.payment_status,
    updated_at = now()
  returning id into v_record_id;

  return v_record_id;
end;
$$;

create or replace function public.trg_deals_sync_transaction_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_transaction_record(new.id);
  return new;
end;
$$;

drop trigger if exists deals_sync_transaction_record on public.deals;
create trigger deals_sync_transaction_record
  after insert or update on public.deals
  for each row
  execute function public.trg_deals_sync_transaction_record();

-- admin_finalize_agreement: ensure record exists right after 成約
create or replace function public.admin_finalize_agreement(p_deal_id uuid)
returns public.deals
language plpgsql
security definer
set search_path = public
as $$
declare v public.deals%rowtype;
        v_auto boolean;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into v from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal not found'; end if;
  if not v.seller_intent_confirmed or not v.buyer_intent_confirmed then
    raise exception 'both parties must be confirmed by admin';
  end if;
  if v.status not in ('inquiry', 'negotiating') then raise exception 'invalid deal status for agreement'; end if;

  update public.deals set status = 'agreed', updated_at = now()
  where id = p_deal_id returning * into v;

  perform public.ensure_deal_billing(p_deal_id);

  update public.invoices
  set status = 'review_pending', updated_at = now()
  where deal_id = p_deal_id and status = 'draft';

  perform public.notify_enqueue(
    'invoice.review_pending',
    jsonb_build_object('body', format('deal %s 請求書確認待ち', p_deal_id)),
    'deals', p_deal_id
  );

  v_auto := public.get_setting_bool('billing', 'auto_send_invoices', false);
  if v_auto then
    perform public.admin_approve_and_send_invoices(p_deal_id);
  end if;

  perform public.notify_deal_status(p_deal_id, 'agreed');
  perform public.sync_transaction_record(p_deal_id);
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin search
-- ---------------------------------------------------------------------------
create or replace function public.admin_search_transaction_records(
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_limit int default 100
)
returns setof public.transaction_records
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  return query
  select tr.*
  from public.transaction_records tr
  where (p_from is null or tr.contracted_at::date >= p_from)
    and (p_to is null or tr.contracted_at::date <= p_to)
    and (
      v_q is null
      or tr.deal_id::text ilike '%' || v_q || '%'
      or tr.vehicle_name ilike '%' || v_q || '%'
      or tr.manufacturer ilike '%' || v_q || '%'
      or tr.seller_snapshot_json->>'store_name' ilike '%' || v_q || '%'
      or tr.buyer_snapshot_json->>'store_name' ilike '%' || v_q || '%'
      or tr.seller_snapshot_json->>'trade_name' ilike '%' || v_q || '%'
      or tr.buyer_snapshot_json->>'trade_name' ilike '%' || v_q || '%'
    )
  order by tr.contracted_at desc
  limit v_limit;
end;
$$;

grant execute on function public.admin_search_transaction_records(text, date, date, int) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.transaction_records enable row level security;

drop policy if exists transaction_records_select on public.transaction_records;
create policy transaction_records_select on public.transaction_records
  for select
  to authenticated
  using (
    public.transaction_record_viewer_allowed()
    and (
      public.is_admin()
      or seller_id = auth.uid()
      or buyer_id = auth.uid()
    )
  );

-- Backfill existing 成約済み取引
do $$
declare
  r record;
begin
  for r in
    select id from public.deals
    where status not in ('inquiry', 'negotiating', 'cancelled')
  loop
    perform public.sync_transaction_record(r.id);
  end loop;
end;
$$;
