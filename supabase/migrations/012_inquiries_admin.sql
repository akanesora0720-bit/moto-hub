-- 問い合わせ: 運営がステータス更新・一覧参照

drop policy if exists inquiries_admin_update on public.inquiries;
create policy inquiries_admin_update on public.inquiries
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
