# Moto-Hub査定サービス

## 概要

**Moto-Hub査定済**は、Moto-Hubスタッフ（`member_type = staff`）が実車確認し、写真・状態・評価を確認したうえで出品登録を代行した車両にのみ付与するバッジです。

旧仕様の「運営が画面内容を確認して `inspection_status` を ON にする」方式は廃止しました。加盟店が自分で入力した出品にはバッジは付きません。

## 料金・請求書

- 1台 **税抜 3,000円**（`inspection_requests.fee_ex_tax`、デフォルト 3000）
- **1依頼 = 1台 = 1請求書**（同一加盟店で複数台の場合も、現状は台ごとに請求書が発行されます）
- **将来検討**: 複数台を1請求書にまとめる（振込手数料の削減）。未実装
- **請求書の発行タイミング: 査定完了時**（スタッフが出品代行登録し `complete_motohub_inspection` が成功した直後）
- `issue_motohub_inspection_invoice` が `invoices`（`document_kind = motohub_inspection`）を **issued** で作成し、消費税10%を加算
- 加盟店は `/inspections` の依頼履歴から請求書PDFを開ける（`inspection_requests.invoice_id`）

## フロー

1. **加盟店** — `/inspections` から依頼（希望日時・備考）
2. **スタッフ** — 希望日時で対応可能なら「承諾依頼」、難しければ別日時を提案（`awaiting_dealer`）
3. **加盟店** — 提案を「承諾」または「別日時を提示」（`awaiting_staff`）
4. **スタッフ** — 再提案を確認し「確定」→ `scheduled` →「査定を開始」→ 出品代行登録
5. **完了** — `complete_motohub_inspection` でバッジ付与・請求書発行

### 依頼ステータス

| status | 意味 |
|--------|------|
| requested | 依頼受付（スタッフ確認待ち） |
| awaiting_dealer | スタッフ提案 → 加盟店の承諾/再提案待ち |
| awaiting_staff | 加盟店の再提案 → スタッフ確認待ち |
| scheduled | 双方合意で日程確定 |
| in_progress | 査定中 |
| completed | 完了（出品紐付け済） |
| cancelled | 取消 |

## DB

- `inspection_requests` — 依頼本体（`listing_id` は完了時に設定）
- `listings.inspection_badge_type` — `none` \| `motohub_inspected`
- `listings.inspected_by_staff_id` / `inspection_completed_at` — 付与記録

マイグレーション:

- `033_motohub_inspection_service.sql`
- `034_inspection_invoice_on_complete.sql`（請求書発行）
- `035_admin_as_inspection_staff.sql`（管理者も査定代行可）
- `049_inspection_notify_and_schedule.sql`（依頼時の運営通知）
- `081_inspection_schedule_negotiation.sql`（日程調整 RPC・通知）

## 検索

車両を探す（`/search`）で **Moto-Hub査定済のみ**（`motohub_only=1`）を指定可能。

## 権限

- 依頼作成: 加盟店（`is_dealer()`）
- 依頼更新・出品代行・バッジ付与: `member_type = staff` **または** `is_admin = true`（`is_motohub_inspection_staff()`）
- トリガー `guard_listing_inspection_badge` により、加盟店は `motohub_inspected` を設定不可

### アカウント例

| アカウント | 設定 | できること |
|----------|------|------------|
| RideWorks | `is_admin` + `member_type = dealer` | 管理・業者出品・査定代行 |
| Moto-Hub運営 | `is_admin` + `member_type = staff` | 管理・査定（業者出品は不可） |
| 加盟店 | `member_type = dealer` | 出品・査定依頼 |

## 適用手順

Supabase SQL Editor で `033_motohub_inspection_service.sql` の内容のみを実行してください（Markdown や `#` 見出しは含めない）。
