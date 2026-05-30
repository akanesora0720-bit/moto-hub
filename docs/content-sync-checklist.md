# 機能追加後のコンテンツ同期チェックリスト

最終更新: 週次手数料・入金指示自動送信・AI出品サポート・パーツ発送引渡 反映後

## 反映済み（コード）

| 箇所 | 内容 |
|------|------|
| `/help` | `lib/dealer-manual.ts` — 週次手数料・AI出品・パーツ発送引渡 |
| `/admin/help` | `lib/admin-manual.ts` — 週次精算・AI出品・入金指示自動送信 |
| `/home` | パーツ・車両検索の業務カード |
| `/admin/billing` | パーツ請求の種別ラベル |
| UI | `/parts` 手数料注意、`/search` エリア検索、出品フォーム |

## 要対応（法務・運営）

| 優先 | 箇所 | 内容 |
|------|------|------|
| **済** | 利用規約・プライバシー v1（集約） | `/terms`（`#privacy`）— 週次手数料・入金指示自動送信・AI出品。`/privacy` はリダイレクト |
| **済** | 料金表 | `/pricing`（`lib/fee-schedule.ts` と同期） |
| **高** | プライバシーポリシー | パーツ品番・車種マスタ（学習型）の取扱いが必要なら追記 |
| **済** | 登録・ログインの同意文 | `LegalPoliciesConsent` / `LegalDocumentLinks` — `/terms`・`/privacy`・`/pricing` |
| 中 | 加盟店向け案内メール / 通知テンプレ | パーツ機能リリース告知 |
| 低 | 社内オペレーション手順書 | パーツ成約時の入金確認フロー（車両と別） |

## 要検討（プロダクト整合）

| 項目 | 現状 | 検討 |
|------|------|------|
| 審査前の `/parts` | middleware でブロック（`/search` のみ閲覧可） | パーツも閲覧のみ許可するか |
| **済** | `/my/payments` | 週次手数料（車両・パーツ別）・月額 |
| **済** | `/ai-listing` | AI出品サポート（加盟承認後） |
| dispute | 車両専用 | パーツトラブルはサポート経由のみ（マニュアル記載済） |
| 取引記録書 | 車両 deals のみ | パーツは対象外（意図的） |

## 規約バージョン管理

- コード: `lib/legal-policies.ts` → `CURRENT_TERMS_VERSION`
- DB: `policy_acceptances` に同意記録
- 法務文書の正本: `/terms`・`/privacy`・`/pricing`（`lib/legal-policies.ts` のパス定数と同期。外部 URL 不可）
