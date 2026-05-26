-- 書類・引渡は双方調整のため自動減点を廃止（取引ボードで調整）

create or replace function public.apply_handover_deadline_penalty(
  p_deal_id uuid,
  p_penalty_date date,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return false;
end;
$$;

create or replace function public.run_handover_deadline_compliance_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('penalties_applied', 0, 'disabled', true);
end;
$$;

comment on function public.run_handover_deadline_compliance_job is
  'Deprecated: handover timing is coordinated on the deal board; no auto penalties.';
