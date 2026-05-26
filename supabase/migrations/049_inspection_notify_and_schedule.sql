-- MotoHub査定: 運営通知テンプレート + 依頼時の in-app / メール、日程確定時の scheduled_at 自動設定

insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values
  (
    'inspection.requested',
    'email',
    '[MotoHub] 新規 MotoHub査定依頼',
    '新規の MotoHub査定依頼が届きました。

{{body}}

管理画面 → MotoHub査定 で対応してください。',
    true
  ),
  (
    'inspection.completed',
    'email',
    '[MotoHub] MotoHub査定完了',
    'MotoHub査定・出品代行が完了しました。

{{body}}',
    true
  )
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

create or replace function public.create_inspection_request(
  p_vehicle_name text,
  p_storage_location text,
  p_contact_name text,
  p_preferred_at timestamptz default null,
  p_notes text default null
)
returns public.inspection_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.inspection_requests;
  v_body text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not public.is_dealer() then raise exception 'dealer only'; end if;
  if char_length(trim(coalesce(p_vehicle_name, ''))) < 1 then
    raise exception 'vehicle_name required';
  end if;
  if char_length(trim(coalesce(p_storage_location, ''))) < 1 then
    raise exception 'storage_location required';
  end if;
  if char_length(trim(coalesce(p_contact_name, ''))) < 1 then
    raise exception 'contact_name required';
  end if;

  insert into public.inspection_requests (
    dealer_id,
    requested_by,
    vehicle_name,
    storage_location,
    contact_name,
    preferred_at,
    notes,
    status,
    fee_ex_tax
  )
  values (
    auth.uid(),
    auth.uid(),
    trim(p_vehicle_name),
    trim(p_storage_location),
    trim(p_contact_name),
    p_preferred_at,
    nullif(trim(coalesce(p_notes, '')), ''),
    'requested',
    3000
  )
  returning * into v;

  v_body := format('%s @ %s（担当: %s）', v.vehicle_name, v.storage_location, v.contact_name);

  begin
    perform public.notify_enqueue(
      'inspection.requested',
      jsonb_build_object('body', v_body),
      'inspection_requests',
      v.id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_all_admins(
      '【運営】新規 MotoHub査定依頼',
      v_body,
      'important',
      '/admin/inspections',
      'inspection_requests',
      v.id
    );
  exception when others then null;
  end;

  return v;
end;
$$;

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
  v_scheduled timestamptz;
begin
  if not public.is_motohub_inspection_staff() and not public.is_admin() then
    raise exception 'MotoHub staff only';
  end if;

  select * into v from public.inspection_requests where id = p_request_id for update;
  if v.id is null then raise exception 'request not found'; end if;

  v_scheduled := coalesce(p_scheduled_at, v.scheduled_at);
  if p_status = 'scheduled' and v_scheduled is null then
    v_scheduled := coalesce(v.preferred_at, now() + interval '3 days');
  end if;

  update public.inspection_requests
  set
    status = coalesce(p_status, status),
    assigned_staff_id = coalesce(p_assigned_staff_id, assigned_staff_id, auth.uid()),
    scheduled_at = v_scheduled,
    notes = case when p_notes is not null then nullif(trim(p_notes), '') else notes end,
    updated_at = now()
  where id = p_request_id
  returning * into v;

  return v;
end;
$$;
