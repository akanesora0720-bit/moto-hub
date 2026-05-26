-- 名変完了報告: 車検証 / 記録事項の添付（買い手アップロード → 売り手確認）

do $$
begin
  create type public.deal_transfer_document_kind as enum (
    'shaken_sho',
    'inspection_record'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.deal_transfer_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  document_kind public.deal_transfer_document_kind not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size int not null check (byte_size > 0 and byte_size <= 10485760),
  uploaded_by uuid not null references auth.users (id),
  uploaded_at timestamptz not null default now(),
  seller_acknowledged_at timestamptz,
  seller_acknowledged_by uuid references auth.users (id),
  constraint deal_transfer_documents_storage_path_unique unique (storage_path)
);

create index if not exists deal_transfer_documents_deal_idx
  on public.deal_transfer_documents (deal_id, uploaded_at desc);

comment on table public.deal_transfer_documents is '名変後の車検証・記録事項（取引当事者のみ閲覧）';

alter table public.deal_transfer_documents enable row level security;

drop policy if exists deal_transfer_documents_select on public.deal_transfer_documents;
create policy deal_transfer_documents_select on public.deal_transfer_documents
  for select to authenticated
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id
        and (
          d.buyer_id = auth.uid()
          or d.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: deal-docs/{deal_id}/{document_id}.{ext}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('deal-docs', 'deal-docs', false)
on conflict (id) do nothing;

create or replace function public.deal_doc_path_deal_id(p_object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_object_name, '/', 1), '')::uuid;
$$;

drop policy if exists deal_docs_select on storage.objects;
create policy deal_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deal-docs'
    and exists (
      select 1 from public.deals d
      where d.id = public.deal_doc_path_deal_id(name)
        and (
          d.buyer_id = auth.uid()
          or d.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists deal_docs_insert on storage.objects;
create policy deal_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deal-docs'
    and exists (
      select 1 from public.deals d
      where d.id = public.deal_doc_path_deal_id(name)
        and d.buyer_id = auth.uid()
        and d.status = 'transfer_pending'
        and d.requires_name_transfer = true
    )
  );

drop policy if exists deal_docs_delete on storage.objects;
create policy deal_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'deal-docs'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.deal_transfer_documents doc
        join public.deals d on d.id = doc.deal_id
        where doc.storage_path = name
          and doc.uploaded_by = auth.uid()
          and doc.seller_acknowledged_at is null
          and d.buyer_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.list_deal_transfer_documents(p_deal_id uuid)
returns setof public.deal_transfer_documents
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not public.is_deal_participant(p_deal_id) and not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select *
  from public.deal_transfer_documents
  where deal_id = p_deal_id
  order by uploaded_at desc;
end;
$$;

create or replace function public.register_deal_transfer_document(
  p_deal_id uuid,
  p_document_id uuid,
  p_document_kind public.deal_transfer_document_kind,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_byte_size int
)
returns public.deal_transfer_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.deals%rowtype;
  v_doc public.deal_transfer_documents;
  v_title text;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v from public.deals where id = p_deal_id for update;
  if v.id is null then raise exception 'deal not found'; end if;

  if v.buyer_id <> auth.uid() and not public.is_admin() then
    raise exception 'buyer or admin only';
  end if;
  if v.status <> 'transfer_pending' or not v.requires_name_transfer then
    raise exception 'transfer proof only while name transfer is pending';
  end if;

  if (select count(*) from public.deal_transfer_documents where deal_id = p_deal_id) >= 3 then
    raise exception 'maximum 3 documents per deal';
  end if;

  if p_storage_path is null
     or split_part(p_storage_path, '/', 1) <> p_deal_id::text
     or split_part(p_storage_path, '/', 2) not like p_document_id::text || '.%'
     or public.deal_doc_path_deal_id(p_storage_path) is distinct from p_deal_id then
    raise exception 'invalid storage path';
  end if;

  if p_mime_type not in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ) then
    raise exception 'unsupported mime type';
  end if;

  insert into public.deal_transfer_documents (
    id,
    deal_id,
    document_kind,
    storage_path,
    original_filename,
    mime_type,
    byte_size,
    uploaded_by
  )
  values (
    p_document_id,
    p_deal_id,
    p_document_kind,
    p_storage_path,
    left(trim(p_original_filename), 255),
    p_mime_type,
    p_byte_size,
    auth.uid()
  )
  returning * into v_doc;

  v_title := case p_document_kind
    when 'shaken_sho' then '【MotoHub】名変後の車検証が届きました'
    else '【MotoHub】名変後の記録事項が届きました'
  end;

  begin
    perform public.insert_user_notification(
      v.seller_id,
      v_title,
      '買い手が名義変更後の書類をアップロードしました。取引詳細の「名変」で内容をご確認ください。',
      'important',
      format('/deals/%s#deal-transfer-proof', p_deal_id),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  begin
    perform public.notify_enqueue(
      'deal.transfer_proof_uploaded',
      jsonb_build_object(
        'body',
        format('取引 %s — 名変後書類がアップロードされました。', p_deal_id)
      ),
      'deals',
      p_deal_id
    );
  exception when others then null;
  end;

  return v_doc;
end;
$$;

create or replace function public.seller_acknowledge_transfer_document(p_document_id uuid)
returns public.deal_transfer_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.deal_transfer_documents;
  v public.deals%rowtype;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v_doc from public.deal_transfer_documents where id = p_document_id for update;
  if v_doc.id is null then raise exception 'document not found'; end if;

  select * into v from public.deals where id = v_doc.deal_id;
  if v.seller_id <> auth.uid() and not public.is_admin() then
    raise exception 'seller or admin only';
  end if;

  update public.deal_transfer_documents
  set
    seller_acknowledged_at = coalesce(seller_acknowledged_at, now()),
    seller_acknowledged_by = coalesce(seller_acknowledged_by, auth.uid())
  where id = p_document_id
  returning * into v_doc;

  begin
    perform public.insert_user_notification(
      v.buyer_id,
      '【MotoHub】売り手が名変書類を確認しました',
      '売り手がアップロードいただいた名義変更後の書類を確認しました。',
      'normal',
      format('/deals/%s#deal-transfer-proof', v.id),
      'deals',
      v.id
    );
  exception when others then null;
  end;

  return v_doc;
end;
$$;

create or replace function public.delete_deal_transfer_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.deal_transfer_documents;
begin
  if auth.uid() is null then raise exception 'login required'; end if;

  select * into v_doc from public.deal_transfer_documents where id = p_document_id for update;
  if v_doc.id is null then raise exception 'document not found'; end if;

  if v_doc.seller_acknowledged_at is not null and not public.is_admin() then
    raise exception 'cannot delete after seller acknowledged';
  end if;

  if v_doc.uploaded_by <> auth.uid() and not public.is_admin() then
    raise exception 'uploader or admin only';
  end if;

  delete from public.deal_transfer_documents where id = p_document_id;
end;
$$;

insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'deal.transfer_proof_uploaded',
  'email',
  '[MotoHub] 名変後書類のアップロード',
  '買い手が名義変更後の書類をアップロードしました。

{{body}}

取引詳細でご確認ください。',
  true
)
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

grant execute on function public.list_deal_transfer_documents(uuid) to authenticated;
grant execute on function public.register_deal_transfer_document(
  uuid, uuid, public.deal_transfer_document_kind, text, text, text, int
) to authenticated;
grant execute on function public.seller_acknowledge_transfer_document(uuid) to authenticated;
grant execute on function public.delete_deal_transfer_document(uuid) to authenticated;
