# 機能追加後のコンテンツ同期チェックリスト

最終更新: UXフロー整理・操作説明・規約の PR 同時チェックを明文化

**関連:** 画面・RPC・通知の整合は [UX_FLOW_AUDIT.md](./UX_FLOW_AUDIT.md)（操作説明・規約チェック含む）

---

## PR 時の必須3点（要約）

| # | 確認 | 正本 |
|---|------|------|
| 1 | ボタン・工程が実装と一致 | コード + [UX_FLOW_AUDIT.md](./UX_FLOW_AUDIT.md) |
| 2 | 操作説明が実装と一致 | `lib/dealer-manual.ts`, `lib/admin-manual.ts` → `/help`, `/admin/help` |
| 3 | 規約・料金が実装と一致（該当時） | `lib/terms-document.ts`, `lib/fee-schedule.ts`, `lib/legal-policies.ts` |

フローだけ直してマニュアル・規約を忘れないこと。

---

## 反映済み（コード）

| 箇所 | 内容 |
|------|------|
| `/help` | `lib/dealer-manual.ts` — 週次手数料・AI出品・パーツ・引渡一本化・査定日程調整 |
| `/admin/help` | `lib/admin-manual.ts` — 週次精算・AI出品・入金指示自動送信・査定 |
| `/home` | パーツ・車両検索の業務カード |
| `/admin/billing` | パーツ請求の種別・レガシー手動送信ラベル |
| UI | `/parts` 手数料注意、`/search` エリア検索、出品フォーム |

---

## 操作説明 — 変更時に見るセクション

| 機能変更 | dealer-manual | admin-manual |
|----------|---------------|--------------|
| 車両取引フロー | §6 車両取引の流れ | §商談・取引 |
| パーツ | §5 パーツ売買 | §パーツ |
| 査定 | §8 Moto-Hub査定 | §10 Moto-Hub査定 |
| 請求・週次 | §10 請求・月額 | §精算 |
| AI出品 | §4 出品 | §AI出品 |
| 登録・審査 | §2 登録 | §加盟店審査 |

---

## 法務・料金 — 変更時に見るファイル

| 優先 | 箇所 | 正本 | 画面 |
|------|------|------|------|
| **済** | 利用規約・プライバシー v1（集約） | `lib/terms-document.ts` | `/terms`（`#privacy`） |
| **済** | 料金表 | `lib/fee-schedule.ts` | `/pricing` |
| **済** | 登録・ログインの同意 | `lib/legal-policies.ts` + `LegalPoliciesConsent` | `/signup`, `/onboarding` |
| 中 | プライバシー | 品番・車種マスタ学習の追記要否 | `/terms#privacy` |
| 中 | 加盟店向けメール / 通知テンプレ | Supabase `notification_templates` | — |
| 低 | 社内オペ手順 | 社外ドキュメント | — |

### 規約バージョン管理

- コード: `lib/legal-policies.ts` → `CURRENT_TERMS_VERSION`, `CURRENT_PRIVACY_VERSION`
- DB: `policy_acceptances` に同意記録
- 法務文書の正本: `/terms`（プライバシーは `#privacy`）、`/privacy` は `/terms#privacy` へリダイレクト、`/pricing`
- **ローンチ前:** v1 固定。改定時のみバージョン更新＋再同意方針を決定

---

## 要検討（プロダクト整合）

| 項目 | 現状 | 検討 |
|------|------|------|
| 審査前の `/parts` | middleware でブロック | パーツ閲覧のみ許可するか |
| **済** | `/my/payments` | 週次手数料（車両・パーツ別）・月額 |
| **済** | `/ai-listing` | AI出品サポート（設計: [AI_LISTING_DESIGN.md](AI_LISTING_DESIGN.md)） |
| dispute | 車両専用 | パーツはサポート経由（マニュアル記載） |
| 取引記録書 | 車両 deals のみ | パーツは対象外（意図的） |
