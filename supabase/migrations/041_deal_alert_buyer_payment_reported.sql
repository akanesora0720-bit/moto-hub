-- Add enum value required by migration 040 (run this first if 040 failed on deal_alerts)

alter type public.deal_alert_type add value if not exists 'buyer_payment_reported';
