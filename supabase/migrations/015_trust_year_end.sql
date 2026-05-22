-- 信用: バッジ色（trust_rank）は年末締めのみ更新。年内の減点・回復は trust_score のみ。

drop trigger if exists profiles_sync_trust_rank on public.profiles;

-- 12/31 締め: 残り点数で翌年以降のランク確定 → 全員100点にリセット
create or replace function public.apply_trust_year_end()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.profiles
  set
    trust_rank = public.trust_rank_from_score(trust_score),
    trust_score = 100;

  get diagnostics v_count = row_count;

  return jsonb_build_object('members_reset', v_count);
end;
$$;

grant execute on function public.apply_trust_year_end() to authenticated;

comment on function public.apply_trust_year_end is
  '年末締め: 現在の trust_score から trust_rank（バッジ色）を確定し、全員 trust_score を100に戻す。';
