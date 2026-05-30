-- Moto-Hub査定: 日程調整（希望日時 ↔ スタッフ提案 ↔ 加盟店承諾のキャッチボール）

do $$
begin
  alter type public.inspection_request_status add value if not exists 'awaiting_dealer';
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter type public.inspection_request_status add value if not exists 'awaiting_staff';
exception
  when duplicate_object then null;
end $$;

alter table public.inspection_requests
  add column if not exists schedule_proposed_at timestamptz,
  add column if not exists schedule_proposed_note text,
  add column if not exists schedule_proposed_by text check (schedule_proposed_by in ('staff', 'dealer')),
  add column if not exists schedule_confirmed_at timestamptz;

comment on column public.inspection_requests.schedule_proposed_at is '日程調整中の提案日時（承諾待ち）';
comment on column public.inspection_requests.schedule_proposed_by is '提案者: staff | dealer';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public._inspection_finalize_schedule(
  p_row public.inspection_requests,
  p_at timestamptz
)
returns public.inspection_requests
language plpgsql
as $$
declare
  v public.inspection_requests;
begin
  if p_at is null then
    raise exception 'schedule time required';
  end if;

  update public.inspection_requests
  set
    status = 'scheduled',
    scheduled_at = p_at,
    schedule_confirmed_at = now(),
    schedule_proposed_at = null,
    schedule_proposed_note = null,
    schedule_proposed_by = null,
    updated_at = now()
  where id = p_row.id
  returning * into v;

  return v;
end;
$$;

create or replace function public._inspection_notify_dealer_schedule(
  p_request public.inspection_requests,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_user_notification(
    p_request.dealer_id,
    p_title,
    p_body,
    'important',
    format('/inspections?focus=%s', p_request.id),
    'inspection_requests',
    p_request.id
  );
exception
  when others then
    raise notice 'inspection dealer notify skip: %', sqlerrm;
end;
$$;

create or replace function public._inspection_notify_staff_schedule(
  p_request public.inspection_requests,
  p_title text,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_all_admins(
    p_title,
    p_body,
    'important',
    format('/admin/inspections?focus=%s', p_request.id),
    'inspection_requests',
    p_request.id
  );
exception
  when others then
    raise notice 'inspection staff notify skip: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: 日程を提案（希望日時での対応可 / 別日時）
-- ---------------------------------------------------------------------------
create or replace function public.staff_propose_inspection_schedule(
  p_request_id uuid,
  p_proposed_at timestamptz,
  p_note text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_note text;
  v_when text;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;
  if p_proposed_at is null then
    raise exception 'proposed_at required';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.status in ('completed', 'cancelled', 'in_progress', 'scheduled') then
    raise exception 'cannot propose schedule in status %', v.status;
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');
  v_when := to_char(p_proposed_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI');

  update public.inspection_requests
  set
    status = 'awaiting_dealer',
    schedule_proposed_at = p_proposed_at,
    schedule_proposed_by = 'staff',
    schedule_proposed_note = v_note,
    assigned_staff_id = coalesce(assigned_staff_id, auth.uid()),
    updated_at = now()
  where id = p_request_id
  returning * into v;

  perform public._inspection_notify_dealer_schedule(
    v,
    '【Moto-Hub査定】日程のご提案',
    format(
      '%s の査定日時案: %s%s。アプリの Moto-Hub査定 画面から承諾または別日時のご提示をお願いします。',
      v.vehicle_name,
      v_when,
      case when v_note is not null then E'\n' || v_note else '' end
    )
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: 加盟店からの再提案を確定
-- ---------------------------------------------------------------------------
create or replace function public.staff_confirm_dealer_inspection_schedule(
  p_request_id uuid
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_when text;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.status <> 'awaiting_staff' or v.schedule_proposed_by <> 'dealer' then
    raise exception 'no dealer counter proposal to confirm';
  end if;
  if v.schedule_proposed_at is null then
    raise exception 'proposed_at missing';
  end if;

  v := public._inspection_finalize_schedule(v, v.schedule_proposed_at);
  v_when := to_char(v.scheduled_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI');

  perform public._inspection_notify_dealer_schedule(
    v,
    '【Moto-Hub査定】日程が確定しました',
    format('%s の査定日時: %s', v.vehicle_name, v_when)
  );

  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dealer: 承諾 / 別日時の再提案
-- ---------------------------------------------------------------------------
create or replace function public.dealer_respond_inspection_schedule(
  p_request_id uuid,
  p_action text,
  p_counter_at timestamptz default null,
  p_note text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_note text;
  v_when text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.dealer_id <> auth.uid() then raise exception 'not your request'; end if;

  if p_action = 'accept' then
    if v.status <> 'awaiting_dealer' or v.schedule_proposed_by <> 'staff' then
      raise exception 'no staff proposal to accept';
    end if;
    if v.schedule_proposed_at is null then
      raise exception 'proposed_at missing';
    end if;

    v := public._inspection_finalize_schedule(v, v.schedule_proposed_at);
    v_when := to_char(v.scheduled_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI');

    perform public._inspection_notify_staff_schedule(
      v,
      '【運営】査定日程が確定',
      format('%s — 加盟店が承諾しました（%s）', v.vehicle_name, v_when)
    );

    return v;
  end if;

  if p_action = 'counter' then
    if v.status not in ('awaiting_dealer', 'requested') then
      raise exception 'cannot counter in status %', v.status;
    end if;
    if p_counter_at is null then
      raise exception 'counter_at required';
    end if;

    v_note := nullif(trim(coalesce(p_note, '')), '');
    v_when := to_char(p_counter_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD HH24:MI');

    update public.inspection_requests
    set
      status = 'awaiting_staff',
      preferred_at = p_counter_at,
      schedule_proposed_at = p_counter_at,
      schedule_proposed_by = 'dealer',
      schedule_proposed_note = v_note,
      updated_at = now()
    where id = p_request_id
    returning * into v;

    perform public._inspection_notify_staff_schedule(
      v,
      '【運営】査定日程の再提案（加盟店）',
      format(
        '%s — 加盟店から別日時: %s%s',
        v.vehicle_name,
        v_when,
        case when v_note is not null then E'\n' || v_note else '' end
      )
    );

    return v;
  end if;

  raise exception 'invalid action';
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: 査定開始（日程確定後のみ）
-- ---------------------------------------------------------------------------
create or replace function public.staff_start_inspection(
  p_request_id uuid
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;
  if v.status <> 'scheduled' or v.scheduled_at is null then
    raise exception 'schedule must be confirmed first';
  end if;

  update public.inspection_requests
  set
    status = 'in_progress',
    assigned_staff_id = coalesce(assigned_staff_id, auth.uid()),
    updated_at = now()
  where id = p_request_id
  returning * into v;

  return v;
end;
$$;

-- staff_update: 直接 scheduled へは提案フローを経由（後方互換で日時のみ更新は許可）
create or replace function public.staff_update_inspection_request(
  p_request_id uuid,
  p_status public.inspection_request_status default null,
  p_assigned_staff_id uuid default null,
  p_scheduled_at timestamptz default null,
  p_notes text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;

  if p_status = 'scheduled' and v.status not in ('scheduled', 'in_progress', 'completed') then
    raise exception 'use staff_propose_inspection_schedule or staff_confirm_dealer_inspection_schedule';
  end if;

  update public.inspection_requests
  set
    status = coalesce(p_status, status),
    assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id, auth.uid()),
    scheduled_at = coalesce(p_scheduled_at, scheduled_at),
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    updated_at = now()
  where id = p_request_id
  returning * into v;

  return v;
end;
$$;

grant execute on function public.staff_propose_inspection_schedule(uuid, timestamptz, text) to authenticated;
grant execute on function public.staff_confirm_dealer_inspection_schedule(uuid) to authenticated;
grant execute on function public.dealer_respond_inspection_schedule(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.staff_start_inspection(uuid) to authenticated;
