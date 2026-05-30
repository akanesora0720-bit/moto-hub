# AI出品サポート — 設計メモ

実装前に確認するためのドキュメントです。API 選定・コスト・Supabase 連携・環境変数をまとめています。

**関連実装:** `/ai-listing` · `supabase/migrations/079_ai_listing_import.sql` · `lib/openai/vision-listing-extract.ts`

---

## 推奨ワークフロー

1. 本ドキュメントで API・コスト・連携を合意する
2. `OPENAI_API_KEY` を発行し Vercel / `.env.local` に設定して再デプロイ
3. マイグレーション 079 適用・操作説明（`lib/dealer-manual.ts`）を更新

---

## 1. どの API を使うか

| 候補 | MVP での判断 |
|------|----------------|
| **OpenAI Chat Completions + Vision（採用）** | 日本語の在庫表スクショ・複数行抽出・JSON 出力向き。Vercel API Route から 1 リクエストで完結。 |
| Google Gemini Flash | 単価は抑えやすいが別 SDK・品質検証が必要。 |
| Anthropic Claude Vision | 表読みは強いが、高頻度利用では単価が上がりやすい。 |
| Azure Document Intelligence | 表 OCR 向き。万円表記・車種タグなどは LLM 併用が必要。 |
| 自社 OCR + ルール | 最安だが画面形式（GooBike / オークション / Excel 撮影など）差に弱い。 |

### 現行仕様

| 項目 | 値 |
|------|-----|
| エンドポイント | `POST https://api.openai.com/v1/chat/completions` |
| モデル | `gpt-5.4-mini`（`OPENAI_VISION_MODEL` で上書き可） |
| 画像 | `image_url` + **`detail: "high"`**（精度優先・トークン多め） |
| 出力 | `response_format: { type: "json_object" }` → `vehicles[]` |
| やらないこと | 外部サイトアクセス・スクレイピング・スクショ内サムネを出品写真に利用・自動公開 |

---

## 2. 月額コストの目安（OpenAI のみ）

料金は [OpenAI API pricing](https://openai.com/api/pricing/) を都度確認してください。以下は **gpt-4o-mini** の概算です。

| 種別 | 単価（目安） |
|------|----------------|
| 入力 | 約 $0.15 / 100万トークン |
| 出力 | 約 $0.60 / 100万トークン |

画像は **1 枚固定料金ではなく**、解像度と `detail` でトークン換算されます。実装は `high` のため、在庫一覧のフルスクリーンでは **1 枚あたり数千〜2 万トークン級**になり得ます。

| 利用規模 | 解析回数/月 | OpenAI 概算/月 |
|----------|-------------|----------------|
| プレ・少数店 | 50〜100 | **$0.5〜3** |
| 本番初期（10 店 × 20 枚） | 200 | **$2〜15** |
| 本番成長（50 店 × 30 枚） | 1,500 | **$15〜80** |

- **OpenAI:** 従量課金のみ（月額プラン不要）
- **Supabase:** Storage（private バケット・10MB/枚上限）と DB 行は、上記規模では既存契約への上乗せは小さい想定
- **Vercel:** 関数実行時間（`maxDuration` 120s）に応じた従量

実測は `ai_listing_import_jobs.prompt_tokens` / `completion_tokens` および管理画面 `/admin/ai-listing` で確認できます。

---

## 3. 画像 1 枚あたりの想定費用

| 項目 | 想定 |
|------|------|
| 1 回の解析 | スクショ **1 枚** → 車両 **5〜20 台** を JSON で返す |
| 入力トークン | プロンプト + 画像（high）→ おおよそ **5,000〜25,000** |
| 出力トークン | JSON → おおよそ **1,000〜4,000** |
| **1 枚あたり合計** | おおよそ **$0.01〜$0.05**（**約 1.5〜7.5 円** @150 円/USD。`detail: high` 時） |

コスト削減案（将来）:

- `detail: "low"` への変更（精度低下）
- アップロード前のリサイズ・解像度上限
- ユーザーあたりの日次解析回数上限

---

## 4. Supabase との連携

```
加盟店ブラウザ (/ai-listing)
    │  multipart: 画像（PNG/JPG、最大 10MB）
    ▼
Next.js  POST /api/ai-listing/analyze  （OPENAI_API_KEY はサーバーのみ）
    │
    ├─ Auth + is_dealer_approved() … 加盟承認済み dealer のみ
    ├─ Storage `ai-listing-imports`（private）… `{userId}/{jobId}/source.{png|jpg}`
    ├─ DB `ai_listing_import_jobs` … status: processing → completed | failed
    ├─ OpenAI Vision … vehicles[] + usage トークン
    ├─ DB `ai_listing_draft_items` … 行ごと + field_confidence (jsonb)
    └─ 加盟店が確認 → POST /api/ai-listing/jobs/[id]/save → listings (status=draft)
```

| レイヤ | 内容 |
|--------|------|
| Migration | `079_ai_listing_import.sql` |
| テーブル | `ai_listing_import_jobs`, `ai_listing_draft_items` |
| 出品 | `listings.status = draft` まで。公開・写真・7 項目評価は `/listings/mine` で人手 |
| RLS | 本人のジョブ・下書き行のみ（管理者は閲覧可） |
| Storage RLS | パス先頭が `auth.uid()` のフォルダのみ insert/select |

保存フロー後、加盟店が写真・評価を付けて「公開する」まで本番在庫には出ません。

---

## 5. 環境変数

| 変数 | 必須 | 備考 |
|------|------|------|
| `OPENAI_API_KEY` | AI 出品を使う場合 **必須** | Vercel Production / Preview + **再デプロイ** |
| `OPENAI_VISION_MODEL` | 任意 | 未設定時 `gpt-5.4-mini` |

Supabase 側に OpenAI キーは置きません（漏洩面を分離）。

---

## 6. リスク・運用

| 項目 | 内容 |
|------|------|
| キー未設定 | 解析不可。加盟店には「準備中」表示（技術エラーは出さない） |
| PII | スクショに車台番号・店舗情報が含まれる → OpenAI データポリシーを運営で確認 |
| 誤抽出 | 自動公開なし・信頼度表示・人手確認が前提 |
| コスト急増 | 利用ログ監視・日次上限・`detail` 見直しを将来検討 |

---

## 7. 操作説明・規約との整合

- 加盟店: `lib/dealer-manual.ts` → `/help`
- 運営: `lib/admin-manual.ts` § AI出品サポート
- 変更時: `docs/UX_FLOW_AUDIT.md` の PR チェックリストに従う
