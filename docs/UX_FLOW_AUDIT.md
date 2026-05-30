# UX フロー監査チェックリスト

PR 時に「ボタンラベル ＝ RPC ＝ 通知リンク」を確認する。

## 加盟店（車両取引）

| 操作 | 正本 UI | RPC |
|------|---------|-----|
| 振込報告 | 黄色バナー | API / DB |
| 入金確認（売） | 黄色バナー | `seller_confirm_buyer_payment`（振込報告必須） |
| 引取予定（買） | 引取カード上部フォーム | `buyer_set_pickup_schedule` |
| 引渡完了（売） | 黄色バナーのみ | `deal_mark_handover`（引取予定必須） |
| 完了確認 | 黄色バナー | `deal_buyer_confirm` / `deal_seller_confirm` |
| 名変完了（買） | 名変カード | `update_deal_milestones`（transfer のみ） |

**省略した重複操作**

- マイルストーンでの引取予定・引渡日時の手入力（当事者）
- カード下部の引渡ボタン（黄色バナーと二重だった）

## パーツ

| 操作 | 順序 |
|------|------|
| 成約 | 売主登録 → 入金指示書自動 |
| 入金確認 | 売主が先に実行 |
| 発送/引渡 | 入金確認後のみ |

## 運営

| 操作 | 画面 |
|------|------|
| 取引ステータス通知 | `/admin/deals/{id}#deal-primary-action` |
| 入金指示書 | 成約時自動送信（精算の手動送信はレガシーのみ） |

## 査定

| 操作 | フロー |
|------|--------|
| 日程 | 希望 → スタッフ提案 → 加盟店承諾/再提案 → 確定 → 査定開始 |

## 修正履歴

- `082_ux_flow_consistency.sql` — 通知リンク・マイルストーン・パーツ・入金確認
- フロント — `DealActionPanel`, `DealMilestonesPanel`, `PartSaleFulfillmentPanel`, 他
