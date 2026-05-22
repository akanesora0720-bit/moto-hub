-- 運営スタッフは招待リンクからのみ登録可能

create table if not exists public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  token uuid not null default gen_random_uuid() unique,
  created_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists staff_invites_token_idx on public.staff_invites (token) where used_at is null;

alter table public.staff_invites enable row level security;

drop policy if exists staff_invites_admin on public.staff_invites;
create policy staff_invites_admin on public.staff_invites
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 招待トークン確認（登録画面用・消費しない）
create or replace function public.get_staff_invite_for_signup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.staff_invites;
begin
  if p_token is null or length(trim(p_token)) < 10 then
    return jsonb_build_object('valid', false);
  end if;

  select * into v_invite
  from public.staff_invites
  where token = trim(p_token)::uuid
    and used_at is null
    and expires_at > now();

  if v_invite.id is null then
    return jsonb_build_object('valid', false);
  end if;

  return jsonb_build_object(
    'valid', true,
    'email', v_invite.email,
    'expires_at', v_invite.expires_at
  );
end;
$$;

grant execute on function public.get_staff_invite_for_signup(text) to anon, authenticated;

-- 管理者: 招待作成
create or replace function public.admin_create_staff_invite(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_row public.staff_invites;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  if v_email is null or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    raise exception 'invalid email';
  end if;

  insert into public.staff_invites (email, created_by)
  values (v_email, auth.uid())
  returning * into v_row;

  return jsonb_build_object(
    'token', v_row.token,
    'email', v_row.email,
    'expires_at', v_row.expires_at
  );
end;
$$;

grant execute on function public.admin_create_staff_invite(text) to authenticated;

-- signup 時: staff は有効な招待がある場合のみ
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type public.member_type := 'dealer';
  v_token text;
  v_invite public.staff_invites;
begin
  if new.raw_user_meta_data ->> 'member_type' = 'staff' then
    v_token := new.raw_user_meta_data ->> 'staff_invite_token';
    if v_token is null then
      raise exception 'staff signup requires invite';
    end if;

    select * into v_invite
    from public.staff_invites
    where token = trim(v_token)::uuid
      and used_at is null
      and expires_at > now()
      and email = lower(new.email);

    if v_invite.id is null then
      raise exception 'invalid or expired staff invite';
    end if;

    update public.staff_invites set used_at = now() where id = v_invite.id;
    v_type := 'staff';
  end if;

  insert into public.profiles (id, email, member_type)
  values (new.id, lower(new.email), v_type);
  return new;
end;
$$;
