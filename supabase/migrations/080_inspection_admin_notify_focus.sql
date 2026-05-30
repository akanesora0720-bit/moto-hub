-- 査定依頼通知のリンクを該当行へ直接誘導

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
  v_admin_link text;
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
  v_admin_link := format('/admin/inspections?focus=%s', v.id);

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
      v_admin_link,
      'inspection_requests',
      v.id
    );
  exception when others then null;
  end;

  return v;
end;
$$;
