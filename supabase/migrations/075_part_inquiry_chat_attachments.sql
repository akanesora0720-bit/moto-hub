-- 075: パーツ問い合わせチャット（写真添付・一覧 RPC・Storage 参加者アクセス）

alter table public.part_inquiry_messages
  add column if not exists attachment_paths jsonb not null default '[]'::jsonb;

alter table public.part_inquiry_messages
  drop constraint if exists part_inquiry_messages_message_check;

alter table public.part_inquiry_messages
  add constraint part_inquiry_messages_message_check
  check (
    char_length(trim(coalesce(message, ''))) between 1 and 4000
    or jsonb_array_length(coalesce(attachment_paths, '[]'::jsonb)) > 0
  );

create or replace function public.validate_part_inquiry_attachment_paths(
  p_inquiry_id uuid,
  p_paths jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inquiry public.part_inquiries;
  v_path text;
  v_parts text[];
  v_max int := 6;
begin
  if p_paths is null or jsonb_typeof(p_paths) <> 'array' then
    raise exception 'invalid attachment paths';
  end if;
  if jsonb_array_length(p_paths) > v_max then
    raise exception 'too many attachments (max %)', v_max;
  end if;
  if jsonb_array_length(p_paths) = 0 then
    return;
  end if;

  select * into v_inquiry from public.part_inquiries where id = p_inquiry_id;
  if v_inquiry.id is null then
    raise exception 'inquiry not found';
  end if;

  for v_path in
    select trim(both from jsonb_array_elements_text(p_paths))
  loop
    if v_path is null or v_path = '' then
      raise exception 'empty attachment path';
    end if;
    if position('..' in v_path) > 0 then
      raise exception 'invalid attachment path';
    end if;
    v_parts := storage.foldername(v_path);
    if coalesce(array_length(v_parts, 1), 0) < 5 then
      raise exception 'invalid attachment path layout';
    end if;
    if v_parts[3] <> 'chat' or v_parts[4]::uuid <> p_inquiry_id then
      raise exception 'attachment path does not match inquiry';
    end if;
    if v_parts[2]::uuid <> v_inquiry.part_listing_id then
      raise exception 'attachment path does not match listing';
    end if;
    if v_parts[1]::uuid <> v_inquiry.seller_id then
      raise exception 'attachment path does not match seller';
    end if;
  end loop;
end;
$$;

create or replace function public.list_part_inquiry_messages(p_inquiry_id uuid)
returns table (
  id uuid,
  sender_user_id uuid,
  sender_label text,
  message text,
  attachment_paths jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if not public.is_part_inquiry_participant(p_inquiry_id, v_caller)
     and not public.is_admin() then
    raise exception 'party only';
  end if;

  return query
  select
    m.id,
    m.sender_user_id,
    coalesce(
      nullif(trim(p.store_name), ''),
      nullif(trim(p.contact_name), ''),
      split_part(p.email, '@', 1)
    ) as sender_label,
    m.message,
    coalesce(m.attachment_paths, '[]'::jsonb) as attachment_paths,
    m.created_at
  from public.part_inquiry_messages m
  join public.profiles p on p.id = m.sender_user_id
  where m.inquiry_id = p_inquiry_id
  order by m.created_at asc;
end;
$$;

grant execute on function public.list_part_inquiry_messages(uuid) to authenticated;

drop function if exists public.create_part_inquiry(uuid, text);
drop function if exists public.post_part_inquiry_message(uuid, text);

create or replace function public.create_part_inquiry(
  p_part_listing_id uuid,
  p_initial_message text,
  p_attachment_paths jsonb default '[]'::jsonb
)
returns public.part_inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_listing public.part_listings;
  v_inquiry public.part_inquiries;
  v_msg text := trim(coalesce(p_initial_message, ''));
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if not public.dealer_has_full_access(v_caller) then
    raise exception 'approved dealer account required';
  end if;
  if char_length(v_msg) < 5
     and jsonb_array_length(coalesce(p_attachment_paths, '[]'::jsonb)) = 0 then
    raise exception 'message too short';
  end if;

  select * into v_listing
  from public.part_listings
  where id = p_part_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'part listing not found';
  end if;
  if v_listing.seller_id = v_caller then
    raise exception 'cannot inquire your own part';
  end if;
  if v_listing.status not in ('active', 'negotiating') then
    raise exception 'part listing is not available';
  end if;

  insert into public.part_inquiries (part_listing_id, buyer_id, seller_id, status)
  values (p_part_listing_id, v_caller, v_listing.seller_id, 'open')
  on conflict (part_listing_id, buyer_id) do update set
    status = 'open',
    closed_at = null,
    updated_at = now()
  returning * into v_inquiry;

  perform public.validate_part_inquiry_attachment_paths(v_inquiry.id, p_attachment_paths);

  insert into public.part_inquiry_messages (
    inquiry_id,
    sender_user_id,
    message,
    attachment_paths
  )
  values (
    v_inquiry.id,
    v_caller,
    case when char_length(v_msg) >= 1 then v_msg else '（写真）' end,
    coalesce(p_attachment_paths, '[]'::jsonb)
  );

  update public.part_listings
  set status = case when status = 'active' then 'negotiating' else status end,
      updated_at = now()
  where id = p_part_listing_id;

  return v_inquiry;
end;
$$;

create or replace function public.post_part_inquiry_message(
  p_inquiry_id uuid,
  p_message text default '',
  p_attachment_paths jsonb default '[]'::jsonb
)
returns public.part_inquiry_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_inquiry public.part_inquiries;
  v_msg public.part_inquiry_messages;
  v_text text := trim(coalesce(p_message, ''));
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if char_length(v_text) < 1
     and jsonb_array_length(coalesce(p_attachment_paths, '[]'::jsonb)) = 0 then
    raise exception 'message or attachment required';
  end if;

  select * into v_inquiry from public.part_inquiries where id = p_inquiry_id;
  if v_inquiry.id is null then
    raise exception 'inquiry not found';
  end if;
  if v_inquiry.status <> 'open' then
    raise exception 'inquiry is closed';
  end if;
  if not public.is_admin()
     and v_caller <> v_inquiry.buyer_id
     and v_caller <> v_inquiry.seller_id then
    raise exception 'party only';
  end if;

  perform public.validate_part_inquiry_attachment_paths(p_inquiry_id, p_attachment_paths);

  insert into public.part_inquiry_messages (
    inquiry_id,
    sender_user_id,
    message,
    attachment_paths
  )
  values (
    p_inquiry_id,
    v_caller,
    case when char_length(v_text) >= 1 then v_text else '（写真）' end,
    coalesce(p_attachment_paths, '[]'::jsonb)
  )
  returning * into v_msg;

  update public.part_inquiries
  set updated_at = now()
  where id = p_inquiry_id;

  return v_msg;
end;
$$;

grant execute on function public.create_part_inquiry(uuid, text, jsonb) to authenticated;
grant execute on function public.post_part_inquiry_message(uuid, text, jsonb) to authenticated;

create or replace function public.set_part_inquiry_first_message_attachments(
  p_inquiry_id uuid,
  p_attachment_paths jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'login required';
  end if;
  if not public.is_part_inquiry_participant(p_inquiry_id, v_caller) then
    raise exception 'party only';
  end if;
  perform public.validate_part_inquiry_attachment_paths(p_inquiry_id, p_attachment_paths);

  update public.part_inquiry_messages m
  set attachment_paths = coalesce(p_attachment_paths, '[]'::jsonb)
  where m.id = (
    select id
    from public.part_inquiry_messages
    where inquiry_id = p_inquiry_id
    order by created_at asc
    limit 1
  )
  and m.sender_user_id = v_caller;
end;
$$;

grant execute on function public.set_part_inquiry_first_message_attachments(uuid, jsonb) to authenticated;

-- Storage: 商談中の買い手も listing / chat 画像を閲覧・アップロード可
drop policy if exists part_images_storage_select on storage.objects;
create policy part_images_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'part-images'
    and (
      exists (
        select 1
        from public.part_listings l
        where l.id::text = (storage.foldername(name))[2]
          and (storage.foldername(name))[1] = l.seller_id::text
          and (
            l.status in ('active', 'negotiating')
            or l.seller_id = auth.uid()
            or public.is_admin()
            or exists (
              select 1
              from public.part_inquiries i
              where i.part_listing_id = l.id
                and (i.buyer_id = auth.uid() or i.seller_id = auth.uid())
            )
          )
      )
    )
  );

drop policy if exists part_images_storage_insert on storage.objects;
create policy part_images_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'part-images'
    and (
      (
        (storage.foldername(name))[3] is distinct from 'chat'
        and (storage.foldername(name))[1] = auth.uid()::text
        and exists (
          select 1
          from public.part_listings l
          where l.id::text = (storage.foldername(name))[2]
            and l.seller_id = auth.uid()
            and public.dealer_has_full_access(auth.uid())
        )
      )
      or (
        (storage.foldername(name))[3] = 'chat'
        and exists (
          select 1
          from public.part_inquiries i
          join public.part_listings l on l.id = i.part_listing_id
          where l.seller_id::text = (storage.foldername(name))[1]
            and l.id::text = (storage.foldername(name))[2]
            and i.id::text = (storage.foldername(name))[4]
            and i.status = 'open'
            and (i.buyer_id = auth.uid() or i.seller_id = auth.uid())
            and public.dealer_has_full_access(auth.uid())
        )
      )
    )
  );
