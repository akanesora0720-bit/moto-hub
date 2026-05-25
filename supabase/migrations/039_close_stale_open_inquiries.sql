-- Close open inquiries that only have terminal deals (fixes stale 商談 badges)

update public.inquiries i
set status = 'closed'
where i.status = 'open'
  and exists (
    select 1 from public.deals d
    where d.inquiry_id = i.id
  )
  and not exists (
    select 1 from public.deals d
    where d.inquiry_id = i.id
      and d.status not in ('completed', 'cancelled')
  );
