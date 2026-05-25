# 手数料ティア・1台1商談・監査ログ

## スキーマ対応（仕様書 ↔ 実DB）

| 仕様書 | MotoHub DB |
|--------|------------|
| `bikes` | `listings` |
| `status = 'available'` | `status = 'active'` |
| `status = 'negotiating'` | 同一 |
| `audit_logs.user_id` | `actor_id`（016 既存） |

## 手数料（税抜車両価格）

| 価格 | 買い手 | 売り手（MotoHub） |
|------|--------|-------------------|
| ≤ ¥30,000 | 0% | 0%（請求書発行なし） |
| ≥ ¥30,001 | 0% | 5%（税抜＋消費税） |

- DB: `public.resolve_deal_fee_rates(price_ex_tax)`
- TS: `lib/billing.ts` → `resolveDealFeeRates()`

## 1台1商談（排他）

- RPC: `create_active_deal(p_listing_id, p_buyer_id, p_seller_id, p_initial_message)`
- `listings` を `FOR UPDATE` ロック → `active` のみ許可 → `deals` 作成 → `negotiating` へ更新 → `audit_logs`
- API: `POST /api/listings/[id]/inquiry`
- UI: `components/InquiryForm.tsx`（loading で連打防止、`active` 以外は非表示/メッセージ）

## マイグレーション適用順

`023` → `024` → `025` → `026` → `027` → `028` → **`029_fee_tier_30k.sql`**

## 主要ファイル

- `supabase/migrations/029_fee_tier_30k.sql`
- `lib/billing.ts`
- `app/api/listings/[id]/inquiry/route.ts`
- `components/InquiryForm.tsx`, `lib/listing-status.ts`
- `components/DealBillingPanel.tsx`
