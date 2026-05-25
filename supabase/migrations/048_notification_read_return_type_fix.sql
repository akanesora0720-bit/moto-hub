-- 047 が途中で失敗した場合用: mark_notification_read の戻り値変更のみ

drop function if exists public.mark_notification_read(uuid);

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  update public.user_notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.dismiss_notification(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  delete from public.user_notifications
  where id = p_notification_id
    and user_id = auth.uid();

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.dismiss_notification(uuid) to authenticated;

create or replace function public.dismiss_read_notifications()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  delete from public.user_notifications
  where user_id = auth.uid()
    and read_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.dismiss_read_notifications() to authenticated;
