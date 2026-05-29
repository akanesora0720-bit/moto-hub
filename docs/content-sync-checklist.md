# 機能追加後のコンテンツ同期チェックリスト

最終更新: パーツ売買・検索・エリア検索 反映後

## 反映済み（コード）

| 箇所 | 内容 |
|------|------|
| `/help` | `lib/dealer-manual.ts` — パーツ・手数料・エリア検索 |
| `/admin/help` | `lib/admin-manual.ts` — パーツ管理・請求 |
| `/home` | パーツ・車両検索の業務カード |
| `/admin/billing` | パーツ請求の種別ラベル |
| UI | `/parts` 手数料注意、`/search` エリア検索、出品フォーム |

## 要対応（法務・運営）

| 優先 | 箇所 | 内容 |
|------|------|------|
| **済** | 利用規約 | `/terms`（HTML正本・`lib/terms-document.ts`）・`CURRENT_TERMS_VERSION=v1` |
| **済** | プライバシーポリシー v1 | `/privacy`（HTML正本）・MotoHub 自社ホストのみ |
| **済** | 料金表 | `/pricing`（`lib/fee-schedule.ts` と同期） |
| **高** | プライバシーポリシー | パーツ品番・車種マスタ（学習型）の取扱いが必要なら追記 |
| **済** | 登録・ログインの同意文 | `LegalPoliciesConsent` / `LegalDocumentLinks` — `/terms`・`/privacy`・`/pricing` |
| 中 | 加盟店向け案内メール / 通知テンプレ | パーツ機能リリース告知 |
| 低 | 社内オペレーション手順書 | パーツ成約時の入金確認フロー（車両と別） |

## 要検討（プロダクト整合）

| 項目 | 現状 | 検討 |
|------|------|------|
| 審査前の `/parts` | middleware でブロック（`/search` のみ閲覧可） | パーツも閲覧のみ許可するか |
| `/my/payments` | 車両・月額中心のUI | パーツ手数料請求の見え方 |
| dispute | 車両専用 | パーツトラブルはサポート経由のみ（マニュアル記載済） |
| 取引記録書 | 車両 deals のみ | パーツは対象外（意図的） |

## 規約バージョン管理

- コード: `lib/legal-policies.ts` → `CURRENT_TERMS_VERSION`
- DB: `policy_acceptances` に同意記録
- 法務文書の正本: `/terms`・`/privacy`・`/pricing`（`lib/legal-policies.ts` のパス定数と同期。外部 URL 不可）
