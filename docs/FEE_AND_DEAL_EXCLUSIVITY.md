# 手数料ティア・1台1商談・監査ログ

## スキーマ対応（仕様書 ↔ 実DB）

| 仕様書 | Moto-Hub DB |
|--------|------------|
| `bikes` | `listings` |
| `status = 'available'` | `status = 'active'` |
| `status = 'negotiating'` | 同一 |
| `audit_logs.user_id` | `actor_id`（016 既存） |

## 手数料（税抜成約価格）

### 車両

| 価格 | 買い手 | 売り手（Moto-Hub） |
|------|--------|-------------------|
| 30,000円未満 | 0% | 0%（請求書発行なし） |
| 30,000円以上 | 0% | 5%（税抜＋消費税） |

- DB: `public.resolve_deal_fee_rates(price_ex_tax)` — 境界は `< 30000` / `>= 30000`
- TS: `lib/billing.ts` → `resolveDealFeeRates()`

### パーツ

| 価格 | 買い手 | 売主 |
|------|--------|------|
| 10,000円未満 | 0% | 0% |
| 10,000円以上 | 0% | 10%（税抜＋消費税） |

- DB: `public.resolve_part_fee_rates(price_ex_tax)` — 境界は `< 10000` / `>= 10000`
- TS: `lib/part-fees.ts`

## 1台1商談（排他）

- RPC: `create_active_deal(p_listing_id, p_buyer_id, p_seller_id, p_initial_message)`
- `listings` を `FOR UPDATE` ロック → `active` のみ許可 → `deals` 作成 → `negotiating` へ更新 → `audit_logs`
- API: `POST /api/listings/[id]/inquiry`
- UI: `components/InquiryForm.tsx`（loading で連打防止、`active` 以外は非表示/メッセージ）

## マイグレーション適用順

`023` → … → **`029_fee_tier_30k.sql`** → **`076_fee_threshold_under_not_lte.sql`**

## 主要ファイル

- `supabase/migrations/029_fee_tier_30k.sql`
- `lib/billing.ts`
- `app/api/listings/[id]/inquiry/route.ts`
- `components/InquiryForm.tsx`, `lib/listing-status.ts`
- `components/DealBillingPanel.tsx`
