-- 古物商証アップロード・照合ステータス / 距離減算申告

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type public.verification_status as enum (
      'unverified',
      'pending',
      'verified',
      'rejected'
    );
  end if;
end
$$;

alter table public.profiles
  add column if not exists verification_status public.verification_status not null default 'unverified',
  add column if not exists antique_dealer_doc_path text,
  add column if not exists invoice_doc_path text,
  add column if not exists verification_note text,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mileage_rollback_status') then
    create type public.mileage_rollback_status as enum ('none', 'suspected', 'confirmed');
  end if;
end
$$;

alter table public.listings
  add column if not exists mileage_rollback public.mileage_rollback_status not null default 'none';

-- member-docs bucket (private)
insert into storage.buckets (id, name, public)
values ('member-docs', 'member-docs', false)
on conflict (id) do nothing;

drop policy if exists member_docs_select on storage.objects;
create policy member_docs_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists member_docs_insert on storage.objects;
create policy member_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'member-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists member_docs_update on storage.objects;
create policy member_docs_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'member-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists member_docs_delete on storage.objects;
create policy member_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'member-docs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );
