-- 年式・走行距離を任意に

alter table public.listings
  alter column year drop not null,
  alter column mileage drop not null;
