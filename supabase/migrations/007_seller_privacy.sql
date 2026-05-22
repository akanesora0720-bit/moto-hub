-- 他会員から店舗名・連絡先などを読めないようにし、公開用ビューでランク・地域のみ提供

drop policy if exists profiles_select_authenticated on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop view if exists public.profiles_public;

create view public.profiles_public
with (security_invoker = false)
as
select
  id,
  prefecture,
  trust_score,
  trust_rank,
  verification_status
from public.profiles
where is_active = true;

grant select on public.profiles_public to authenticated;
