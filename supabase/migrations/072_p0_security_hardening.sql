-- 072: P0 security hardening (pre-launch)
-- - Prevent self privilege escalation on profiles
-- - Block direct disputes INSERT, force submit_dispute RPC path
-- - Restrict compliance job RPC execute permissions
-- - Require approved dealer account for listings/inquiry/deal creation

-- ---------------------------------------------------------------------------
-- P0-1: profiles self escalation guard
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / backend maintenance updates
  if auth.uid() is null then
    return new;
  end if;

  -- admins and staff admins are allowed
  if public.is_admin() then
    return new;
  end if;

  if old.id <> auth.uid() then
    raise exception 'forbidden profile update';
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin update requires admin';
  end if;
  if new.account_status is distinct from old.account_status then
    raise exception 'account_status update requires admin';
  end if;
  if new.member_type is distinct from old.member_type then
    raise exception 'member_type update requires admin';
  end if;
  if new.is_active is distinct from old.is_active then
    raise exception 'is_active update requires admin';
  end if;
  if new.is_banned is distinct from old.is_banned then
    raise exception 'is_banned update requires admin';
  end if;
  if new.ban_reason is distinct from old.ban_reason then
    raise exception 'ban_reason update requires admin';
  end if;
  if new.trust_score is distinct from old.trust_score then
    raise exception 'trust_score update requires admin';
  end if;
  if new.trust_rank is distinct from old.trust_rank then
    raise exception 'trust_rank update requires admin';
  end if;
  if new.last_penalty_at is distinct from old.last_penalty_at then
    raise exception 'penalty update requires admin';
  end if;
  if new.last_recovery_at is distinct from old.last_recovery_at then
    raise exception 'recovery update requires admin';
  end if;
  if new.membership_status is distinct from old.membership_status then
    raise exception 'membership_status update requires admin';
  end if;
  if new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'withdrawn_at update requires admin';
  end if;
  if new.dealer_identity_id is distinct from old.dealer_identity_id then
    raise exception 'dealer_identity update requires admin';
  end if;
  if new.contract_established_at is distinct from old.contract_established_at then
    raise exception 'contract status update requires admin';
  end if;

  if new.verification_status is distinct from old.verification_status then
    -- dealer resubmission ("pending") is allowed, approval/rejection is admin-only
    if new.verification_status <> 'pending'::public.verification_status then
      raise exception 'verification_status update requires admin';
    end if;
  end if;
  if new.verified_at is distinct from old.verified_at then
    raise exception 'verified_at update requires admin';
  end if;
  if new.verification_note is distinct from old.verification_note then
    raise exception 'verification_note update requires admin';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_fields on public.profiles;
create trigger profiles_guard_privileged_fields
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_fields();

-- ---------------------------------------------------------------------------
-- P0-2: disputes must be created through submit_dispute RPC
-- ---------------------------------------------------------------------------
drop policy if exists disputes_insert on public.disputes;

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

  if coalesce(jsonb_typeof(p_images), 'null') <> 'array' then
    raise exception 'images must be an array';
  end if;
  if jsonb_array_length(coalesce(p_images, '[]'::jsonb)) > 10 then
    raise exception 'too many images';
  end if;

  if coalesce(jsonb_typeof(p_evidence), 'null') <> 'array' then
    raise exception 'evidence must be an array';
  end if;
  if jsonb_array_length(coalesce(p_evidence, '[]'::jsonb)) > 5 then
    raise exception 'too many evidence files';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e
    where jsonb_typeof(e) <> 'object'
  ) then
    raise exception 'invalid evidence entry';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb)) e
    where coalesce(e->>'storage_path', '') = ''
      or left(e->>'storage_path', char_length(p_deal_id::text || '/dispute-evidence/')) <> (p_deal_id::text || '/dispute-evidence/')
  ) then
    raise exception 'invalid evidence storage path';
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

-- ---------------------------------------------------------------------------
-- P0-3: compliance RPC execute grants
-- ---------------------------------------------------------------------------
revoke execute on function public.run_transfer_compliance_job() from public;
revoke execute on function public.run_transfer_compliance_job() from anon;
revoke execute on function public.run_transfer_compliance_job() from authenticated;
grant execute on function public.run_transfer_compliance_job() to service_role;

revoke execute on function public.run_payment_deadline_compliance_job() from public;
revoke execute on function public.run_payment_deadline_compliance_job() from anon;
revoke execute on function public.run_payment_deadline_compliance_job() from authenticated;
grant execute on function public.run_payment_deadline_compliance_job() to service_role;

-- ---------------------------------------------------------------------------
-- P0-4: approved dealer restriction on trading entry points
-- ---------------------------------------------------------------------------
drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and (
      public.is_admin()
      or (
        public.dealer_has_full_access(auth.uid())
        and public.my_profile_complete()
      )
    )
  );

drop policy if exists inquiries_insert_buyer on public.inquiries;
create policy inquiries_insert_buyer on public.inquiries
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and (
      public.is_admin()
      or (
        public.dealer_has_full_access(auth.uid())
        and public.my_profile_complete()
      )
    )
    and exists (
      select 1 from public.listings l
      where l.id = listing_id
        and l.status = 'active'
        and l.seller_id <> auth.uid()
    )
  );

create or replace function public.create_active_deal(
  p_listing_id uuid,
  p_buyer_id uuid,
  p_seller_id uuid,
  p_initial_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_listing public.listings;
  v_inquiry public.inquiries;
  v_deal public.deals;
  v_listing_before text;
  v_rates jsonb;
  v_buyer_rate numeric;
  v_seller_rate numeric;
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if p_buyer_id = p_seller_id then
    raise exception 'buyer cannot be seller';
  end if;
  if char_length(trim(coalesce(p_initial_message, ''))) < 5 then
    raise exception 'message too short';
  end if;
  if v_caller <> p_buyer_id and not public.is_admin() then
    raise exception 'buyer mismatch';
  end if;

  select * into v_listing
  from public.listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'listing not found';
  end if;
  if v_listing.seller_id <> p_seller_id then
    raise exception 'seller mismatch';
  end if;
  if v_listing.status <> 'active' then
    raise exception 'listing not available';
  end if;
  if public.listing_has_active_deal(p_listing_id) then
    raise exception 'listing is under negotiation';
  end if;

  if not public.is_admin() then
    if not public.dealer_has_full_access(p_buyer_id) then
      raise exception 'approved dealer account required before inquiring';
    end if;
    if not public.dealer_has_full_access(p_seller_id) then
      raise exception 'seller is not active approved dealer';
    end if;
    if not exists (
      select 1 from public.profiles p
      where p.id = p_buyer_id
        and p.profile_completed = true
        and p.is_active = true
        and not p.is_banned
    ) then
      raise exception 'complete profile before inquiring';
    end if;
  end if;

  v_listing_before := v_listing.status::text;
  v_rates := public.resolve_deal_fee_rates(v_listing.price_ex_tax);
  v_buyer_rate := (v_rates->>'buyer_fee_rate')::numeric;
  v_seller_rate := (v_rates->>'seller_fee_rate')::numeric;

  insert into public.inquiries (listing_id, buyer_id, message, status)
  values (p_listing_id, p_buyer_id, trim(p_initial_message), 'open')
  returning * into v_inquiry;

  insert into public.deals (
    listing_id,
    buyer_id,
    seller_id,
    agreed_price_ex_tax,
    status,
    inquiry_id,
    buyer_fee_rate,
    seller_fee_rate
  )
  values (
    p_listing_id,
    p_buyer_id,
    p_seller_id,
    v_listing.price_ex_tax,
    'negotiating',
    v_inquiry.id,
    v_buyer_rate,
    v_seller_rate
  )
  returning * into v_deal;

  update public.inquiries
  set status = 'closed'
  where id = v_inquiry.id;

  update public.listings
  set status = 'negotiating', updated_at = now()
  where id = p_listing_id;

  perform public.write_status_audit_log(
    'deal_started',
    'listings',
    p_listing_id,
    v_listing_before,
    'negotiating',
    v_caller
  );
  perform public.write_status_audit_log(
    'deal_created',
    'deals',
    v_deal.id,
    null,
    v_deal.status::text,
    v_caller
  );

  perform public.notify_enqueue(
    'inquiry.created',
    jsonb_build_object(
      'body',
      format(
        '[%s %s] %s',
        v_listing.maker,
        v_listing.model,
        left(trim(p_initial_message), 200)
      )
    ),
    'inquiries',
    v_inquiry.id
  );
  perform public.notify_enqueue(
    'deal.created',
    jsonb_build_object('body', format('商談開始 deal=%s', v_deal.id)),
    'deals',
    v_deal.id
  );

  return jsonb_build_object(
    'inquiry_id', v_inquiry.id,
    'deal_id', v_deal.id,
    'fee_tier', v_rates->>'fee_tier'
  );
end;
$$;
