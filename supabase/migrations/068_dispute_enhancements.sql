-- 068: Dispute enhancements — types, evidence, admin resolution, comments

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'dispute_type') then
    create type public.dispute_type as enum (
      'vehicle_defect',
      'document_issue',
      'payment_issue',
      'cancellation_request',
      'suspected_fraud'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'defect_severity') then
    create type public.defect_severity as enum ('minor', 'major', 'critical');
  end if;
  if not exists (select 1 from pg_type where typname = 'dispute_requested_outcome') then
    create type public.dispute_requested_outcome as enum (
      'continue',
      'discount',
      'cancel',
      'consult'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'dispute_fee_handling') then
    create type public.dispute_fee_handling as enum (
      'charge',
      'waive',
      'partial',
      'pending'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- disputes columns
-- ---------------------------------------------------------------------------
alter table public.disputes
  add column if not exists dispute_type public.dispute_type,
  add column if not exists defect_severity public.defect_severity,
  add column if not exists requested_outcome public.dispute_requested_outcome default 'consult',
  add column if not exists cancellation_reason text,
  add column if not exists admin_decision text,
  add column if not exists seller_penalty_points int check (seller_penalty_points is null or (seller_penalty_points >= 0 and seller_penalty_points <= 100)),
  add column if not exists buyer_penalty_points int check (buyer_penalty_points is null or (buyer_penalty_points >= 0 and buyer_penalty_points <= 100)),
  add column if not exists fee_handling public.dispute_fee_handling not null default 'pending',
  add column if not exists fraud_suspected boolean not null default false,
  add column if not exists admin_notes text,
  add column if not exists evidence jsonb not null default '[]'::jsonb;

-- Backfill dispute_type from legacy category
update public.disputes
set dispute_type = case category
  when 'defect' then 'vehicle_defect'::public.dispute_type
  when 'doc_delay' then 'document_issue'::public.dispute_type
  when 'transfer_delay' then 'document_issue'::public.dispute_type
  when 'no_contact' then 'payment_issue'::public.dispute_type
  when 'false_claim' then 'cancellation_request'::public.dispute_type
  when 'fraud' then 'suspected_fraud'::public.dispute_type
  else 'vehicle_defect'::public.dispute_type
end
where dispute_type is null;

-- Legacy penalty_points -> seller_penalty_points (target was usually at-fault party)
update public.disputes
set seller_penalty_points = penalty_points
where penalty_points is not null and seller_penalty_points is null;

-- ---------------------------------------------------------------------------
-- dispute_comments
-- ---------------------------------------------------------------------------
create table if not exists public.dispute_comments (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 1),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists dispute_comments_dispute_idx
  on public.dispute_comments (dispute_id, created_at asc);

alter table public.dispute_comments enable row level security;

create policy dispute_comments_select on public.dispute_comments
  for select to authenticated
  using (
    public.is_admin()
    or (
      not is_internal
      and exists (
        select 1 from public.disputes d
        where d.id = dispute_id
          and (d.reporter_id = auth.uid() or d.target_user_id = auth.uid())
      )
    )
  );

create policy dispute_comments_insert on public.dispute_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.disputes d
        where d.id = dispute_id
          and (d.reporter_id = auth.uid() or d.target_user_id = auth.uid())
          and d.status in ('open', 'reviewing')
          and not is_internal
      )
      or (public.is_admin() and is_internal)
    )
  );

create policy dispute_comments_admin on public.dispute_comments
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.dispute_type_to_category(p_type public.dispute_type)
returns public.dispute_category
language sql
immutable
as $$
  select case p_type
    when 'vehicle_defect' then 'defect'::public.dispute_category
    when 'document_issue' then 'doc_delay'::public.dispute_category
    when 'payment_issue' then 'no_contact'::public.dispute_category
    when 'cancellation_request' then 'false_claim'::public.dispute_category
    when 'suspected_fraud' then 'fraud'::public.dispute_category
  end;
$$;

create or replace function public.dispute_type_default_penalty(
  p_type public.dispute_type,
  p_severity public.defect_severity default null
)
returns int
language sql
immutable
as $$
  select case
    when p_type = 'suspected_fraud' then 50
    when p_type = 'cancellation_request' then 15
    when p_type = 'vehicle_defect' and p_severity = 'critical' then 30
    when p_type = 'vehicle_defect' and p_severity = 'major' then 20
    when p_type = 'vehicle_defect' then 15
    when p_type = 'document_issue' then 10
    when p_type = 'payment_issue' then 10
    else 10
  end;
$$;

create or replace function public.dispute_deal_id_from_evidence_path(p_object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_object_name, '/', 1), '')::uuid;
$$;

-- Storage: {deal_id}/dispute-evidence/{evidence_id}.{ext}
drop policy if exists deal_docs_dispute_evidence_select on storage.objects;
create policy deal_docs_dispute_evidence_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deal-docs'
    and name ~ '^[^/]+/dispute-evidence/'
    and exists (
      select 1 from public.deals d
      where d.id = public.dispute_deal_id_from_evidence_path(name)
        and (d.buyer_id = auth.uid() or d.seller_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists deal_docs_dispute_evidence_insert on storage.objects;
create policy deal_docs_dispute_evidence_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deal-docs'
    and name ~ '^[^/]+/dispute-evidence/'
    and exists (
      select 1 from public.deals d
      where d.id = public.dispute_deal_id_from_evidence_path(name)
        and (d.buyer_id = auth.uid() or d.seller_id = auth.uid())
        and d.status in (
          'funded', 'handover_done', 'transfer_pending',
          'payout_ready', 'payout_done', 'completed', 'dispute'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- submit_dispute (extended; backward compatible)
-- ---------------------------------------------------------------------------
create or replace function public.submit_dispute(
  p_deal_id uuid,
  p_category public.dispute_category,
  p_message text,
  p_images jsonb default '[]'::jsonb,
  p_dispute_type public.dispute_type default null,
  p_defect_severity public.defect_severity default null,
  p_requested_outcome public.dispute_requested_outcome default 'consult',
  p_cancellation_reason text default null,
  p_evidence jsonb default '[]'::jsonb
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal public.deals;
  v_target uuid;
  v_row public.disputes;
  v_type public.dispute_type;
  v_cat public.dispute_category;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 10 then
    raise exception 'message too short';
  end if;

  select * into v_deal from public.deals where id = p_deal_id;
  if v_deal.id is null then raise exception 'deal not found'; end if;

  if v_deal.status not in (
    'funded', 'handover_done', 'transfer_pending',
    'payout_ready', 'payout_done', 'completed', 'dispute'
  ) then
    raise exception 'dispute not allowed at this deal stage';
  end if;

  if auth.uid() = v_deal.buyer_id then
    v_target := v_deal.seller_id;
  elsif auth.uid() = v_deal.seller_id then
    v_target := v_deal.buyer_id;
  else
    raise exception 'only deal parties can file dispute';
  end if;

  v_type := coalesce(p_dispute_type, case p_category
    when 'defect' then 'vehicle_defect'::public.dispute_type
    when 'doc_delay' then 'document_issue'::public.dispute_type
    when 'transfer_delay' then 'document_issue'::public.dispute_type
    when 'no_contact' then 'payment_issue'::public.dispute_type
    when 'false_claim' then 'cancellation_request'::public.dispute_type
    when 'fraud' then 'suspected_fraud'::public.dispute_type
    else 'vehicle_defect'::public.dispute_type
  end);
  v_cat := public.dispute_type_to_category(v_type);

  insert into public.disputes (
    deal_id, reporter_id, target_user_id, category, message, images,
    dispute_type, defect_severity, requested_outcome, cancellation_reason, evidence
  )
  values (
    p_deal_id, auth.uid(), v_target, v_cat, trim(p_message), coalesce(p_images, '[]'::jsonb),
    v_type, p_defect_severity, coalesce(p_requested_outcome, 'consult'::public.dispute_requested_outcome),
    nullif(trim(coalesce(p_cancellation_reason, '')), ''), coalesce(p_evidence, '[]'::jsonb)
  )
  returning * into v_row;

  -- Note: submitting a dispute does NOT forcibly change deal status.
  -- Admin can decide whether to keep progressing, pause, or move to dispute status.

  perform public.notify_enqueue(
    'dispute.created',
    jsonb_build_object(
      'body',
      format('dispute %s / %s / outcome=%s', v_row.id, v_type, coalesce(p_requested_outcome::text, 'consult'))
    ),
    'disputes', v_row.id
  );

  perform public.notify_all_admins(
    '【運営】トラブル報告',
    format('取引 %s — %s（%s）', p_deal_id, v_type, coalesce(p_requested_outcome::text, 'consult')),
    'important',
    format('/admin/disputes/%s', v_row.id),
    'disputes',
    v_row.id
  );

  return v_row;
end;
$$;

grant execute on function public.submit_dispute(
  uuid, public.dispute_category, text, jsonb,
  public.dispute_type, public.defect_severity, public.dispute_requested_outcome, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Party / admin comments
-- ---------------------------------------------------------------------------
create or replace function public.post_dispute_comment(
  p_dispute_id uuid,
  p_body text,
  p_internal boolean default false
)
returns public.dispute_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.disputes;
  v_row public.dispute_comments;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if char_length(trim(coalesce(p_body, ''))) < 1 then raise exception 'empty comment'; end if;

  select * into v_d from public.disputes where id = p_dispute_id;
  if v_d.id is null then raise exception 'dispute not found'; end if;

  if p_internal and not public.is_admin() then
    raise exception 'internal comments are admin only';
  end if;

  if not public.is_admin() then
    if v_d.status not in ('open', 'reviewing') then
      raise exception 'dispute is closed';
    end if;
    if auth.uid() not in (v_d.reporter_id, v_d.target_user_id) then
      raise exception 'not a party';
    end if;
  end if;

  insert into public.dispute_comments (dispute_id, author_id, body, is_internal)
  values (p_dispute_id, auth.uid(), trim(p_body), coalesce(p_internal, false))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.post_dispute_comment(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin finalize dispute (penalties, fee, decision)
-- ---------------------------------------------------------------------------
create or replace function public.admin_finalize_dispute(
  p_dispute_id uuid,
  p_status public.dispute_status,
  p_admin_decision text,
  p_admin_notes text default null,
  p_cancellation_reason text default null,
  p_seller_penalty_points int default 0,
  p_buyer_penalty_points int default 0,
  p_fee_handling public.dispute_fee_handling default 'pending',
  p_fraud_suspected boolean default false,
  p_deal_status public.deal_status default null
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.disputes;
  v_deal public.deals;
  v_reason text;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_status not in ('resolved', 'rejected') then
    raise exception 'status must be resolved or rejected';
  end if;
  if trim(coalesce(p_admin_decision, '')) = '' then
    raise exception 'admin_decision required';
  end if;

  select * into v_d from public.disputes where id = p_dispute_id for update;
  if v_d.id is null then raise exception 'dispute not found'; end if;
  if v_d.status in ('resolved', 'rejected') then raise exception 'already closed'; end if;

  select * into v_deal from public.deals where id = v_d.deal_id;

  if coalesce(p_seller_penalty_points, 0) > 0 then
    v_reason := format('dispute(%s/%s): %s', v_d.dispute_type, v_d.id, trim(p_admin_decision));
    perform public.apply_dealer_penalty(
      v_deal.seller_id, p_seller_penalty_points, v_reason,
      case when p_seller_penalty_points >= 30 then 'severe'::public.penalty_category
           when p_seller_penalty_points >= 15 then 'moderate'::public.penalty_category
           else 'minor'::public.penalty_category end,
      null, true, v_d.deal_id, v_d.id, 'manual_penalty'
    );
  end if;

  if coalesce(p_buyer_penalty_points, 0) > 0 then
    v_reason := format('dispute(%s/%s): %s', v_d.dispute_type, v_d.id, trim(p_admin_decision));
    perform public.apply_dealer_penalty(
      v_deal.buyer_id, p_buyer_penalty_points, v_reason,
      case when p_buyer_penalty_points >= 30 then 'severe'::public.penalty_category
           when p_buyer_penalty_points >= 15 then 'moderate'::public.penalty_category
           else 'minor'::public.penalty_category end,
      null, true, v_d.deal_id, v_d.id, 'manual_penalty'
    );
  end if;

  if p_fee_handling = 'waive' then
    update public.invoices
    set status = 'cancelled', updated_at = now()
    where deal_id = v_d.deal_id
      and document_kind = 'platform_fee'
      and status in ('draft', 'review_pending', 'issued');
  elsif p_fee_handling = 'charge' then
    null; -- leave invoice as-is
  end if;

  update public.disputes
  set
    status = p_status,
    resolution = trim(p_admin_decision),
    admin_decision = trim(p_admin_decision),
    admin_notes = nullif(trim(coalesce(p_admin_notes, '')), ''),
    cancellation_reason = coalesce(nullif(trim(coalesce(p_cancellation_reason, '')), ''), cancellation_reason),
    seller_penalty_points = coalesce(p_seller_penalty_points, 0),
    buyer_penalty_points = coalesce(p_buyer_penalty_points, 0),
    penalty_points = coalesce(p_seller_penalty_points, 0) + coalesce(p_buyer_penalty_points, 0),
    fee_handling = coalesce(p_fee_handling, fee_handling),
    fraud_suspected = p_fraud_suspected,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_dispute_id
  returning * into v_d;

  if p_deal_status is not null then
    perform public.admin_advance_deal(v_d.deal_id, p_deal_status);
  end if;

  perform public.write_audit_log(
    'dispute_finalized', 'disputes', p_dispute_id,
    jsonb_build_object(
      'status', p_status,
      'seller_penalty', p_seller_penalty_points,
      'buyer_penalty', p_buyer_penalty_points,
      'fee_handling', p_fee_handling,
      'fraud_suspected', p_fraud_suspected
    )
  );

  return v_d;
end;
$$;

grant execute on function public.admin_finalize_dispute(
  uuid, public.dispute_status, text, text, text,
  int, int, public.dispute_fee_handling, boolean, public.deal_status
) to authenticated;

-- Keep legacy RPCs working (delegate to admin_finalize_dispute where sensible)
create or replace function public.admin_resolve_dispute_with_penalty(
  p_dispute_id uuid,
  p_penalty_points int,
  p_resolution text
)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_d public.disputes;
  v_seller_id uuid;
  v_seller_pts int := 0;
  v_buyer_pts int := 0;
begin
  select * into v_d from public.disputes where id = p_dispute_id;
  if v_d.id is null then raise exception 'dispute not found'; end if;

  select seller_id into v_seller_id from public.deals where id = v_d.deal_id;

  if v_seller_id = v_d.target_user_id then
    v_seller_pts := p_penalty_points;
  else
    v_buyer_pts := p_penalty_points;
  end if;

  return public.admin_finalize_dispute(
    p_dispute_id,
    'resolved'::public.dispute_status,
    coalesce(trim(p_resolution), '運営判断'),
    null, null,
    v_seller_pts,
    v_buyer_pts,
    'pending'::public.dispute_fee_handling,
    false,
    null
  );
end;
$$;

create or replace function public.admin_reject_dispute(p_dispute_id uuid, p_resolution text)
returns public.disputes
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.admin_finalize_dispute(
    p_dispute_id,
    'rejected'::public.dispute_status,
    coalesce(trim(p_resolution), '事実確認の結果却下'),
    null, null, 0, 0,
    'pending'::public.dispute_fee_handling,
    false, null
  );
end;
$$;

-- Dispute history counts for admin risk review
create or replace function public.get_dealer_dispute_stats(p_dealer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_as_reporter int;
  v_as_target int;
  v_defect int;
  v_cancel int;
  v_fraud int;
  v_resolved_penalty int;
begin
  if not public.is_admin() and auth.uid() <> p_dealer_id then
    raise exception 'forbidden';
  end if;

  select count(*) into v_as_reporter from public.disputes where reporter_id = p_dealer_id;
  select count(*) into v_as_target from public.disputes where target_user_id = p_dealer_id;
  select count(*) into v_defect from public.disputes
    where (reporter_id = p_dealer_id or target_user_id = p_dealer_id)
      and dispute_type = 'vehicle_defect';
  select count(*) into v_cancel from public.disputes
    where (reporter_id = p_dealer_id or target_user_id = p_dealer_id)
      and dispute_type = 'cancellation_request';
  select count(*) into v_fraud from public.disputes
    where (reporter_id = p_dealer_id or target_user_id = p_dealer_id)
      and (dispute_type = 'suspected_fraud' or fraud_suspected = true);
  select count(*) into v_resolved_penalty from public.disputes
    where target_user_id = p_dealer_id
      and status = 'resolved'
      and coalesce(seller_penalty_points, penalty_points, 0) + coalesce(buyer_penalty_points, 0) > 0;

  return jsonb_build_object(
    'as_reporter', v_as_reporter,
    'as_target', v_as_target,
    'vehicle_defect', v_defect,
    'cancellation_request', v_cancel,
    'fraud_related', v_fraud,
    'resolved_with_penalty', v_resolved_penalty
  );
end;
$$;

grant execute on function public.get_dealer_dispute_stats(uuid) to authenticated;
