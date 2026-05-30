-- pgcrypto: compute_bank_fingerprint() が digest() / encode() を使用。
-- リモートで 001 未適用・extension 無効の場合に digest(text, unknown) does not exist となる。

create extension if not exists pgcrypto with schema extensions;

create or replace function public.compute_bank_fingerprint(
  p_bank_name text,
  p_branch text,
  p_account_type text,
  p_account_number text,
  p_holder text
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(
    extensions.digest(
      convert_to(
        upper(
          coalesce(public.normalize_identifier_text(p_bank_name), '') || '|' ||
          coalesce(public.normalize_identifier_text(p_branch), '') || '|' ||
          coalesce(public.normalize_identifier_text(p_account_type), '') || '|' ||
          coalesce(public.normalize_phone_text(p_account_number), '') || '|' ||
          coalesce(public.normalize_identifier_text(p_holder), '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;

comment on function public.compute_bank_fingerprint(text, text, text, text, text) is
  '振込口座の重複検知用 SHA-256 フィンガープリント（pgcrypto digest）';
