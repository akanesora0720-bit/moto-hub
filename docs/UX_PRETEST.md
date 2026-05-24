# UX プレテスト改善（取引フロー）

MotoHub プレテストで発見した UX・取引フロー改善の仕様メモです。

## 1台1商談制

- `listings.status = active` のときのみ問い合わせ可能
- 問い合わせ送信 RPC `submit_listing_inquiry` で `deals` 作成 + `listings.status = negotiating`
- `deals` に partial unique index（`completed` / `cancelled` 以外は listing ごとに1件）
- 商談キャンセル時は `listings.status = active` に復帰、完了時は `sold`

## 問い合わせ = 商談開始

- 買い手が問い合わせ → 即 `deal.status = negotiating`
- 売り手在庫一覧に「商談中」バッジ
- 管理画面に `inquiry.created` / `deal.created` 通知

## 管理者主導の成約確定

- 管理画面取引タブで「売り手意思確認済」「買い手意思確認済」
- 双方チェック後「成約確定」→ `deal.status = agreed`
- RPC: `admin_set_deal_intent`, `admin_finalize_agreement`

## 請求書・精算書（下書き → 承認送信）

- 成約確定時に `ensure_deal_billing` で買い手請求・売り手精算を **draft / review_pending** 生成
- **自動送信しない**（初期運用）
- `/admin/billing` でプレビュー →「承認して送信」→ `admin_approve_and_send_invoices`
- `system_settings.billing.auto_send_invoices`（デフォルト `false`）が `true` のときのみ成約時に自動送信

### invoice status

| status | 意味 |
|--------|------|
| draft | 下書き |
| review_pending | 管理者確認待ち |
| issued | 送信済 |
| paid | 入金済 |
| cancelled | 取消 |

## ボタン連打防止

- `lib/use-async-action.ts` で主要ボタンに `loading` / `disabled` / 完了・エラーメッセージ
- 管理画面ステータスは `ConfirmStatusSelect`（未保存表示 → 更新 → confirm）

## 管理画面通知バッジ

- 問い合わせ / サポート / トラブル / 請求確認待ち / 入金報告 / 名変超過 など件数をタブ・リンクに表示

## 加盟店登録 vs スタッフ招待

- `/signup` … 加盟店（業者）新規登録
- `/signup/staff?token=` … スタッフ招待のみ（公開リンクなし）

## マイグレーション

`supabase/migrations/022_ux_pretest.sql` を Supabase に適用してください。

```bash
# 例: Supabase CLI
supabase db push
```
