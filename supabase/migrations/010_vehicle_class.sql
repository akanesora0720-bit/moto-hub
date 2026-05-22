-- 車種区分（排気量ccと独立。原付1種・原付2種・軽二輪）

do $$
begin
  if not exists (select 1 from pg_type where typname = 'vehicle_class') then
    create type public.vehicle_class as enum (
      'gentsuki_1',
      'gentsuki_2',
      'light_moped'
    );
  end if;
end
$$;

alter table public.listings
  add column if not exists vehicle_class public.vehicle_class;

comment on column public.listings.vehicle_class is '車種区分: 原付1種・原付2種・軽二輪（排気量と車名が一致しない場合の分類）';

create index if not exists listings_vehicle_class_active_idx
  on public.listings (status, vehicle_class, created_at desc)
  where status = 'active';
