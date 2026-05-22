-- 在庫検索: 排気量（cc）と検索用インデックス

alter table public.listings
  add column if not exists displacement_cc int check (displacement_cc is null or displacement_cc > 0);

comment on column public.listings.displacement_cc is '排気量（cc）。例: 399, 998';

create index if not exists listings_search_active_idx
  on public.listings (status, maker, displacement_cc, created_at desc)
  where status = 'active';
