-- 取引書類の Storage 保管・通知（署名URLダウンロード。メールはリンクのみ）

do $$
begin
  create type public.deal_generated_document_kind as enum (
    'sales_certificate',
    'invoice',
    'receipt',
    'contract',
    'vehicle_inspection',
    'name_transfer'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.deal_generated_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  document_kind public.deal_generated_document_kind not null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  byte_size int not null check (byte_size > 0 and byte_size <= 15728640),
  source_type text not null,
  source_id uuid not null,
  title text not null,
  notified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint deal_generated_documents_storage_path_unique unique (storage_path),
  constraint deal_generated_documents_source_unique unique (source_type, source_id, document_kind)
);

create index if not exists deal_generated_documents_deal_idx
  on public.deal_generated_documents (deal_id, created_at desc);

create index if not exists deal_generated_documents_kind_idx
  on public.deal_generated_documents (document_kind, created_at desc);

comment on table public.deal_generated_documents is
  '取引関連の生成PDF（請求書・販売証明・領収・契約等）。vehicle_inspection / name_transfer は将来の書類種別用。';

alter table public.deal_generated_documents enable row level security;

drop policy if exists deal_generated_documents_select on public.deal_generated_documents;
create policy deal_generated_documents_select on public.deal_generated_documents
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

-- Storage: deal-generated-docs/{deal_id}/{kind}/{document_id}.pdf
insert into storage.buckets (id, name, public, file_size_limit)
values ('deal-generated-docs', 'deal-generated-docs', false, 15728640)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit;

create or replace function public.deal_generated_doc_path_deal_id(p_object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(p_object_name, '/', 1), '')::uuid;
$$;

drop policy if exists deal_generated_docs_select on storage.objects;
create policy deal_generated_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deal-generated-docs'
    and exists (
      select 1 from public.deals d
      where d.id = public.deal_generated_doc_path_deal_id(name)
        and (
          d.buyer_id = auth.uid()
          or d.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 通知（当事者 + メールキュー）
-- ---------------------------------------------------------------------------
insert into public.notification_templates (event_type, channel, subject_template, body_template, enabled)
values (
  'dealer.document_ready',
  'email',
  '[MotoHub] {{subject}}',
  E'{{body}}\n\nダウンロードはこちら:\n{{download_url}}\n\n※リンクの有効期限があります。再取得はアプリの「通知」または取引詳細の「書類」タブから可能です。',
  true
)
on conflict (event_type) do update
set
  channel = excluded.channel,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  enabled = excluded.enabled;

create or replace function public.notify_deal_document_ready(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.deal_generated_documents%rowtype;
  v_deal public.deals%rowtype;
  v_user uuid;
  v_download_path text;
  v_body text;
begin
  select * into v_doc from public.deal_generated_documents where id = p_document_id;
  if v_doc.id is null then
    raise exception 'document not found';
  end if;

  select * into v_deal from public.deals where id = v_doc.deal_id;
  if v_deal.id is null then
    raise exception 'deal not found';
  end if;

  if v_doc.notified_at is not null then
    return;
  end if;

  v_download_path := format('/api/deal-documents/%s/download', v_doc.id);
  v_body := format(
    E'取引書類が用意されました。\n種別: %s\nファイル: %s',
    v_doc.title,
    v_doc.file_name
  );

  foreach v_user in array array[v_deal.buyer_id, v_deal.seller_id]
  loop
    begin
      perform public.insert_user_notification(
        v_user,
        format('【書類】%s', v_doc.title),
        v_body,
        'important',
        v_download_path,
        'deal_generated_document',
        v_doc.id
      );
      perform public.notify_enqueue(
        'dealer.document_ready',
        jsonb_build_object(
          'body', v_body,
          'subject', format('【書類】%s', v_doc.title),
          'download_url', v_download_path,
          'recipient_email', (select email from public.profiles where id = v_user),
          'user_id', v_user
        ),
        'deal_generated_documents',
        v_doc.id,
        'email'::public.notification_channel
      );
    exception
      when others then
        raise notice 'notify_deal_document_ready skip %: %', v_user, sqlerrm;
    end;
  end loop;

  update public.deal_generated_documents
  set notified_at = now()
  where id = p_document_id;
end;
$$;

revoke all on function public.notify_deal_document_ready(uuid) from public;
grant execute on function public.notify_deal_document_ready(uuid) to service_role;

create or replace function public.register_deal_generated_document(
  p_deal_id uuid,
  p_document_kind public.deal_generated_document_kind,
  p_storage_path text,
  p_file_name text,
  p_byte_size int,
  p_source_type text,
  p_source_id uuid,
  p_title text,
  p_mime_type text default 'application/pdf',
  p_metadata jsonb default '{}'::jsonb,
  p_notify boolean default true
)
returns public.deal_generated_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.deal_generated_documents%rowtype;
begin
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 15728640 then
    raise exception 'invalid document size (max 15MB)';
  end if;

  insert into public.deal_generated_documents (
    deal_id,
    document_kind,
    storage_path,
    file_name,
    mime_type,
    byte_size,
    source_type,
    source_id,
    title,
    metadata
  )
  values (
    p_deal_id,
    p_document_kind,
    trim(p_storage_path),
    trim(p_file_name),
    coalesce(nullif(trim(p_mime_type), ''), 'application/pdf'),
    p_byte_size,
    trim(p_source_type),
    p_source_id,
    trim(p_title),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_type, source_id, document_kind) do update
  set
    storage_path = excluded.storage_path,
    file_name = excluded.file_name,
    byte_size = excluded.byte_size,
    title = excluded.title,
    metadata = excluded.metadata
  returning * into v_row;

  if p_notify and v_row.notified_at is null then
    perform public.notify_deal_document_ready(v_row.id);
  end if;

  return v_row;
end;
$$;

revoke all on function public.register_deal_generated_document(
  uuid, public.deal_generated_document_kind, text, text, int, text, uuid, text, text, jsonb, boolean
) from public;
grant execute on function public.register_deal_generated_document(
  uuid, public.deal_generated_document_kind, text, text, int, text, uuid, text, text, jsonb, boolean
) to service_role;

create or replace function public.list_deal_generated_documents(p_deal_id uuid)
returns setof public.deal_generated_documents
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.deal_generated_documents d
  where d.deal_id = p_deal_id
    and exists (
      select 1 from public.deals x
      where x.id = p_deal_id
        and (
          x.buyer_id = auth.uid()
          or x.seller_id = auth.uid()
          or public.is_admin()
        )
    )
  order by d.created_at desc;
$$;

grant execute on function public.list_deal_generated_documents(uuid) to authenticated;
