-- クレームは取引に紐づく買い手のみ（入金確認以降）

alter table public.complaints
  add column if not exists deal_id uuid references public.deals (id) on delete set null;

create index if not exists complaints_deal_idx on public.complaints (deal_id);

drop policy if exists complaints_insert_buyer on public.complaints;

create policy complaints_insert_buyer on public.complaints
  for insert to authenticated
  with check (
    buyer_id = auth.uid()
    and public.my_profile_complete()
    and deal_id is not null
    and exists (
      select 1 from public.deals d
      where d.id = deal_id
        and d.buyer_id = auth.uid()
        and d.listing_id = listing_id
        and d.seller_id = seller_id
        and d.status in (
          'funded',
          'handover_done',
          'transfer_pending',
          'payout_ready',
          'payout_done',
          'completed',
          'dispute'
        )
    )
  );
