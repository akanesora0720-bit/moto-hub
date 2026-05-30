# UX・法務・操作説明 同期チェックリスト

**PR・機能変更時は必ず3つセットで確認する。**

1. **画面の動き** — ボタンラベル ＝ RPC ＝ 通知リンク  
2. **操作説明** — `lib/dealer-manual.ts` / `lib/admin-manual.ts` と実装が一致  
3. **規約・料金** — `lib/terms-document.ts`・`lib/fee-schedule.ts`・同意バージョン（変更がある場合）

詳細な法務・LP同期は [content-sync-checklist.md](./content-sync-checklist.md) も参照。

---

## PR 前チェック（コピー用）

```
[ ] 黄色バナーとカード内のボタンが二重になっていないか
[ ] 通知 link_url が取引・査定の「次の操作」に届くか（#deal-primary-action / #deal-pickup / ?focus=）
[ ] 加盟店 /help の記述が変わったフローと一致（lib/dealer-manual.ts）
[ ] 運営 /admin/help が変わった運営フローと一致（lib/admin-manual.ts）
[ ] 料金・手数料・請求タイミングを変えた → lib/fee-schedule.ts + /pricing + 利用規約の料金関連条項
[ ] 個人情報の取扱いを変えた → /terms#privacy（lib/terms-document.ts 内 PRIVACY_ARTICLES）
[ ] 同意が必要な変更 → lib/legal-policies.ts の CURRENT_*_VERSION を上げ、既存ユーザー再同意方針を決める
```

---

## 正本ファイル一覧

| 種別 | コード正本 | 画面 |
|------|------------|------|
| 加盟店操作説明 | `lib/dealer-manual.ts` | `/help` |
| 運営操作説明 | `lib/admin-manual.ts` | `/admin/help` |
| 利用規約・プライバシー | `lib/terms-document.ts` | `/terms`（`#privacy`） |
| 料金表 | `lib/fee-schedule.ts` | `/pricing` |
| 同意バージョン | `lib/legal-policies.ts` | 登録・オンボーディング |
| LP 文言（任意） | `lib/lp-content.ts` | `/lp` |

---

## 画面の動き（加盟店・車両取引）

| 操作 | 正本 UI | RPC |
|------|---------|-----|
| 振込報告 | 黄色バナー | API / DB |
| 入金確認（売） | 黄色バナー | `seller_confirm_buyer_payment`（振込報告必須） |
| 引取予定（買） | 引取カード上部フォーム | `buyer_set_pickup_schedule` |
| 引渡完了（売） | 黄色バナーのみ | `deal_mark_handover`（引取予定必須） |
| 完了確認 | 黄色バナー | `deal_buyer_confirm` / `deal_seller_confirm` |
| 名変完了（買） | 名変カード | `update_deal_milestones`（transfer のみ） |

**操作説明での記載（dealer-manual §6）**

- 引渡は黄色ボタン1回。マイルストーンでの日時手入力はしない。
- 引取予定は買い手が登録（売り手は確認）。調整は連絡板。

**省略した重複操作（実装）**

- マイルストーンでの引取予定・引渡日時の手入力（当事者）
- カード下部の引渡ボタン（黄色バナーと二重だった）

---

## パーツ

| 操作 | 順序 |
|------|------|
| 成約 | 売主登録 → 入金指示書自動 |
| 入金確認 | 売主が先に実行 |
| 発送/引渡 | 入金確認後のみ |

**操作説明（dealer-manual §5）** と **料金（fee-schedule・規約）** をパーツ変更時に必ず見直す。

---

## 運営

| 操作 | 画面 |
|------|------|
| 取引ステータス通知 | `/admin/deals/{id}#deal-primary-action` |
| 入金指示書 | 成約時自動送信（精算の「手動送信（レガシー）」のみ別） |

**操作説明（admin-manual）** — 入金指示の自動送信・週次手数料・査定日程調整と一致させる。

---

## 査定

| 操作 | フロー |
|------|--------|
| 日程 | 希望 → スタッフ提案 → 加盟店承諾/再提案 → 確定 → 査定開始 |

**操作説明（dealer-manual §8）** — キャッチボールフローと一致。規約に AI 出品・査定料が載っているか確認。

---

## 規約・料金を見直すトリガー

| 変更内容 | 更新先 |
|----------|--------|
| 手数料率・計上タイミング・請求サイクル | `lib/fee-schedule.ts`, `/pricing`, 利用規約の料金・支払条項 |
| AI 出品・査定・外部委託 | `/terms#privacy`, 利用規約のサービス内容条項 |
| 決済・振込フロー | 利用規約の取引・免責条項 |
| 新データ項目（品番マスタ等） | プライバシーポリシー第1条など |

ローンチ前は `CURRENT_TERMS_VERSION` / `CURRENT_PRIVACY_VERSION` を **v1 固定**。実質的変更時のみバージョンアップ＋再同意方針を決める。

---

## 修正履歴

| 日付 | 内容 |
|------|------|
| 082 migration | 通知リンク・マイルストーン・パーツ・入金確認 |
| UX整理 | `DealActionPanel`, `DealMilestonesPanel`, `PartSaleFulfillmentPanel` 他 |
| 本ドキュメント | 操作説明・規約を PR チェックに統合 |
