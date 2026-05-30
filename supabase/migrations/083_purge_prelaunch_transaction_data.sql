-- Pre-launch purge: all vehicle deals and part sales were practice (プレ商談).
-- Clears /deals/history, transaction_records, deal boards, and related billing.
-- Keeps: profiles, listings (reset to active). Inspection/membership purged in 084.

-- Weekly platform-fee invoices (not tied to deal delete cascade)
delete from public.invoice_documents
where invoice_id in (
  select id from public.invoices
  where document_kind in ('weekly_vehicle_platform_fee', 'weekly_part_platform_fee')
);

delete from public.invoice_items
where invoice_id in (
  select id from public.invoices
  where document_kind in ('weekly_vehicle_platform_fee', 'weekly_part_platform_fee')
);

delete from public.invoices
where document_kind in ('weekly_vehicle_platform_fee', 'weekly_part_platform_fee');

-- Fee accrual queue from practice transactions
delete from public.platform_fee_accruals;

-- Part marketplace practice flow
delete from public.part_sales;
delete from public.part_inquiries;

-- Vehicle deals (cascades: transaction_records, deal_messages, invoices, disputes, etc.)
delete from public.deals;

-- Inquiries that never became deals
delete from public.inquiries;

-- Listing availability after practice negotiations
update public.listings
set status = 'active', updated_at = now()
where status in ('negotiating', 'sold');

update public.part_listings
set status = 'active', updated_at = now()
where status in ('negotiating', 'sold');

-- In-app notifications for removed deals / part sales
delete from public.user_notifications
where entity_type in ('deal', 'deals', 'part_sale', 'part_sales')
   or link_url like '%/deals/%'
   or link_url like '%/admin/deals/%'
   or link_url like '%/parts/sales%';
