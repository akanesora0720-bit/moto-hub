-- 案1: 会員種別 dealer（業者） / staff（運営スタッフ・古物商不要）

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_type') then
    create type public.member_type as enum ('dealer', 'staff');
  end if;
end
$$;

alter table public.profiles
  add column if not exists member_type public.member_type not null default 'dealer';

-- 管理者アクセス: is_admin または staff
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (p.is_admin or p.member_type = 'staff')
      from public.profiles p
      where p.id = auth.uid() and p.is_active = true
    ),
    false
  );
$$;

create or replace function public.is_dealer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.member_type = 'dealer'
      from public.profiles p
      where p.id = auth.uid() and p.is_active = true
    ),
    false
  );
$$;

-- 会員種別を signup metadata から反映
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.member_type := 'dealer';
begin
  if new.raw_user_meta_data ->> 'member_type' = 'staff' then
    v_type := 'staff';
  end if;

  insert into public.profiles (id, email, member_type)
  values (new.id, lower(new.email), v_type);
  return new;
end;
$$;

-- 出品は業者のみ
drop policy if exists listings_insert_own on public.listings;
create policy listings_insert_own on public.listings
  for insert to authenticated
  with check (
    seller_id = auth.uid()
    and public.is_dealer()
    and public.my_profile_complete()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true)
  );

-- スタッフは自分の profiles の member_type を変更不可（管理者のみ）
create or replace function public.prevent_self_promote_staff()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() = old.id
    and old.member_type is distinct from new.member_type
    and not public.is_admin()
  then
    raise exception 'member_type change requires admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_member_type on public.profiles;
create trigger profiles_guard_member_type
  before update on public.profiles
  for each row execute function public.prevent_self_promote_staff();
