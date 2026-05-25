# 取引連絡板・正式マイルストーン

## 取引連絡板（引取・引渡し専用）

- **用途**: 引取日時調整、到着予定、陸送、引渡し、書類受け渡しのみ。
- **禁止**: 雑談、価格再交渉、直取引誘導、外部連絡先交換。
- **当事者の表示**: 入金確認後のみ（`seller_payment_confirmed_at` または `funded` 以降）。
- **運営**: 入金前でも閲覧・投稿可。
- RPC: `list_deal_messages`, `post_deal_message`, `deal_board_access_allowed`

## 緊急連絡先開示

- テーブル: `emergency_contact_views`
- RPC: `reveal_emergency_seller_contact`, `get_emergency_seller_contact`, `list_emergency_contact_views_admin`
- 監査: `audit_logs` + `write_status_audit_log`

## 正式情報（deals カラム）

| 項目 | カラム |
|------|--------|
| 引取予定 | `pickup_scheduled_at` |
| 引取完了 | `pickup_completed_at` |
| 入金確認 | `seller_payment_confirmed_at` / `funded_at` |
| 書類発送 | `documents_shipped_at` |
| 名変期限 | `transfer_deadline_at` |
| 名変完了 | `transfer_completed_at` |
| 追跡番号 | `tracking_number` |

RPC: `update_deal_milestones`（監査ログ付き）

## マイグレーション

`030_deal_board_milestones.sql` の後に `031_deal_board_pickup_only.sql` を実行。
