-- 運営→売り手振込（public.payouts）は買い手→売り手直接払い（027）以降未使用。
-- ensure_deal_billing が取引ごとに payouts を削除する。UI・通知・RPC を廃止。

comment on table public.payouts is
  'Deprecated: legacy operator-to-seller payout records. Not used since direct buyer payment.';

update public.notification_templates
set enabled = false
where event_type in ('payout.ready', 'payout.completed');

delete from public.payouts;

create or replace function public.admin_mark_payout_paid(p_payout_id uuid, p_note text default null)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  raise exception '運営からの売り手振込機能は廃止しました（車両代は買い手から売り手への直接払い）';
end;
$$;

create or replace function public.admin_set_payout_status(
  p_payout_id uuid,
  p_status public.payout_status
)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  raise exception '運営からの売り手振込機能は廃止しました（車両代は買い手から売り手への直接払い）';
end;
$$;
