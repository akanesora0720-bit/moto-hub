-- 管理者（is_admin）も査定・出品代行可能（RideWorks: 管理+業者+査定）
-- member_type は dealer のまま is_admin で査定スタッフ相当の操作を許可

create or replace function public.is_motohub_inspection_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (p.member_type = 'staff' or p.is_admin = true)
  );
$$;

-- 出品代行 insert: 管理者は assigned 未設定でも可（スタッフは従来どおり担当者一致）
drop policy if exists listings_insert_staff_inspection on public.listings;
create policy listings_insert_staff_inspection on public.listings
  for insert to authenticated
  with check (
    public.is_motohub_inspection_staff()
    and exists (
      select 1 from public.inspection_requests r
      where r.dealer_id = seller_id
        and r.status in ('scheduled', 'in_progress')
        and (
          r.assigned_staff_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists listing_images_insert_staff_inspection on public.listing_images;
create policy listing_images_insert_staff_inspection on public.listing_images
  for insert to authenticated
  with check (
    public.is_motohub_inspection_staff()
    and exists (
      select 1
      from public.listings l
      join public.inspection_requests r on r.dealer_id = l.seller_id
      where l.id = listing_id
        and r.status in ('scheduled', 'in_progress')
        and (
          r.assigned_staff_id = auth.uid()
          or public.is_admin()
        )
    )
  );

drop policy if exists listing_images_storage_insert_staff on storage.objects;
create policy listing_images_storage_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and public.is_motohub_inspection_staff()
    and exists (
      select 1 from public.inspection_requests r
      where r.dealer_id::text = (storage.foldername(name))[1]
        and r.status in ('scheduled', 'in_progress')
        and (
          r.assigned_staff_id = auth.uid()
          or public.is_admin()
        )
    )
  );
