-- 出品データ品質: 日付・VIN例外・識別子正規化

alter table public.listings
  add column if not exists inspection_expiry_date date,
  add column if not exists liability_insurance_expiry_date date,
  add column if not exists model_designation text,
  add column if not exists engine_model text,
  add column if not exists is_officially_stamped_vin boolean not null default false,
  add column if not exists vin_note text;

comment on column public.listings.inspection_expiry_date is '車検満了日（JST・yyyy-mm-dd）';
comment on column public.listings.liability_insurance_expiry_date is '自賠責満了日（JST・yyyy-mm-dd）';
comment on column public.listings.is_officially_stamped_vin is '職権打刻・特殊車台番号（厳格VINバリデーション緩和）';
comment on column public.listings.vin_note is '職権打刻・特殊車台番号の備考（例外時必須）';

-- ---------------------------------------------------------------------------
-- Identifier normalize (DB保存時の最終ガード)
-- ---------------------------------------------------------------------------
create or replace function public.normalize_identifier_text(p_input text)
returns text
language plpgsql
immutable
as $$
declare
  s text;
begin
  if p_input is null then
    return null;
  end if;
  s := upper(trim(p_input));
  s := regexp_replace(s, '[\s\u3000]+', '', 'g');
  s := regexp_replace(s, '[‐‑‒–—−ー－]', '-', 'g');
  return s;
end;
$$;

create or replace function public.trg_listings_normalize_identifiers()
returns trigger
language plpgsql
as $$
begin
  if NEW.model is not null then
    NEW.model := public.normalize_identifier_text(NEW.model);
  end if;
  if NEW.frame_number is not null then
    NEW.frame_number := public.normalize_identifier_text(NEW.frame_number);
  end if;
  if NEW.model_designation is not null then
    NEW.model_designation := public.normalize_identifier_text(NEW.model_designation);
  end if;
  if NEW.engine_model is not null then
    NEW.engine_model := public.normalize_identifier_text(NEW.engine_model);
  end if;

  if coalesce(NEW.is_officially_stamped_vin, false) = false then
    if NEW.frame_number is not null and NEW.frame_number !~ '^[A-Z0-9-]+$' then
      raise exception 'frame_number must be alphanumeric (strict VIN)';
    end if;
    NEW.vin_note := null;
  else
    if coalesce(trim(NEW.vin_note), '') = '' then
      raise exception 'vin_note required for officially stamped VIN';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists listings_normalize_identifiers on public.listings;
create trigger listings_normalize_identifiers
  before insert or update on public.listings
  for each row execute function public.trg_listings_normalize_identifiers();
