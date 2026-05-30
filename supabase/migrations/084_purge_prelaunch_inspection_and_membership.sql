-- Pre-launch purge (continued): practice inspection requests and monthly membership invoices.

-- Inspection + monthly membership invoices
delete from public.invoice_documents
where invoice_id in (
  select id from public.invoices
  where inspection_request_id is not null
     or billing_month is not null
     or document_kind in ('motohub_inspection', 'monthly_membership')
);

delete from public.invoice_items
where invoice_id in (
  select id from public.invoices
  where inspection_request_id is not null
     or billing_month is not null
     or document_kind in ('motohub_inspection', 'monthly_membership')
);

delete from public.invoices
where inspection_request_id is not null
   or billing_month is not null
   or document_kind in ('motohub_inspection', 'monthly_membership');

-- Inspection requests (practice)
update public.inspection_requests set invoice_id = null where invoice_id is not null;

delete from public.inspection_requests;

-- MotoHub査定バッジ（プレ商談分）
alter table public.listings disable trigger listings_guard_inspection_badge;

update public.listings
set
  inspection_badge_type = 'none',
  inspected_by_staff_id = null,
  inspection_completed_at = null,
  inspection_status = false,
  updated_at = now()
where inspection_badge_type <> 'none'
   or inspected_by_staff_id is not null
   or inspection_completed_at is not null
   or inspection_status = true;

alter table public.listings enable trigger listings_guard_inspection_badge;

-- Related notifications
delete from public.user_notifications
where entity_type in ('inspection_request', 'inspection_requests')
   or link_url like '%/inspection%'
   or link_url like '%/admin/inspection%'
   or link_url like '%/billing%'
   or link_url like '%/invoices%';
