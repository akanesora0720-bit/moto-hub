# Moto-Hub

B2B中古バイク流通のMVP。業者が在庫を税抜業販価格で出品し、他業者が閲覧・問い合わせできるマーケットプレイスです。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase (Auth / Postgres / Storage)

## セットアップ

1. [Supabase](https://supabase.com) でプロジェクトを作成
2. SQL Editor で順に実行:
   - `001_mvp_schema.sql`
   - `002_verification_and_mileage_rollback.sql`
   - `003_trust_system.sql`（Phase2 信用システム）
   - `004_member_type.sql`（業者 / 運営スタッフの分離）
   - `005_listing_grading_scores.sql`（出品の7項目評価・車検残）
   - `006_engine_video_url.sql`（エンジン動画・外部URL任意）
   - `007_seller_privacy.sql`（出品者連絡先非公開）
   - `008_deal_flow_phase3.sql`（取引フロー Phase3）
   - … `016`–`018`（信用・スタッフ招待）
   - `019_operations_automation.sql` / `019b_operations_jobs.sql`（通知基盤・名変自動減点・リスク）
   - `020_phase4_disputes.sql`（dispute・penalty_logs・信用バンド・マイ統計）
   - `021_support_messaging_billing.sql`（運営サポート・管理者メール・請求・入出金）
   - `022_ux_pretest.sql`（1台1商談・成約確定・請求承認フロー・UX改善）
3. Storage に `listing-images` バケットが無い場合は Dashboard で private バケットを作成
4. `.env.example` を `.env.local` にコピーしてキーを設定
5. 初回管理者（自分の user id を確認後）:

```sql
update public.profiles
set is_admin = true, trust_score = 100, trust_rank = 'GOLD'
where email = 'your@email.com';
```

6. 開発サーバー:

```bash
npm install
npm run dev
```

## MVP 機能

| 区分 | 内容 |
|------|------|
| 認証 | ログイン / ログアウト / 会員登録 |
| 会員属性 | 店舗名・担当者・古物商番号・許可証画像・インボイス番号・登録票画像・都道府県・電話 |
| 照合 | 提出後すぐ利用可。運営が管理画面で古物商番号と許可証を照合 |
| 距離減算 | 出品時に申告（なし / 疑い / 歴あり）。車台番号は全文表示 |
| 在庫投稿 | メーカー・車種・年式・走行・車台番号・税抜価格・状態・複数写真 |
| 一覧 | カードUI（写真・車種・価格・地域・信用ランク） |
| 詳細 | 写真・状態・出品者・問い合わせ |
| 管理 | 出品削除・会員停止・成約・クレーム承認/却下・減点・年末締め |
| 信用 | 100点スタート減点制・GOLD/BLUE/YELLOW/RED・クレーム申請 |
| プロフィール | `/members/[id]` 点数・ランク・成約数・Moto-Hub査定済率 |
| Moto-Hub査定 | 加盟店が `/inspections` で依頼 → スタッフが現車確認・出品代行 → 「Moto-Hub査定済」バッジ（税抜¥3,000/台） |
| 評価基準 | `/evaluation` 車両評価基準スライド（オークション風10段階） |
| 会員種別 | **dealer**（業者・古物商必須） / **staff**（運営・管理のみ） |

### 運営スタッフの登録

1. 従業員に `/signup/staff` のURLを共有（またはログイン画面のリンク）
2. スタッフは担当者名・電話のみ入力 → 管理画面へ
3. 既存ユーザーをスタッフにする場合: 管理 → 会員 → **スタッフ化**

あなた（RideWorks）は `/signup` で **業者** 登録 + `is_admin = true`（管理・査定代行も可。`member_type` は `dealer` のまま）。`035` 適用後、スタッフ化しなくても査定・出品代行が使えます。

## 取引フロー（Phase3）

| ステータス | 意味 |
|-----------|------|
| inquiry → negotiating → agreed | 問い合わせ・商談・合意（運営） |
| awaiting_payment → funded | 買い手が売り手へ直接振込 → 売り手が入金確認 |
| handover_done / transfer_pending | 車両＋書類同時引渡。車検残ありは名変待ち（引渡後・翌週金曜まで） |
| payout_ready | 双方が「取引完了確認」済み |
| completed | 取引完了。Moto-Hub手数料は売り手へ別途請求 |

- 業者 UI: `/deals`（購入側・販売側の進捗表示）
- 管理: 成約タブでステータス変更・名変コンプライアンスジョブ（超過3日−5 / 7日−10 / 14日要レビュー）
- 運営 KPI: `/admin/dashboard`
- 通知: 日次 cron → `docs/OPERATIONS.md`
- 成約後: 取引詳細で売り手振込先・連絡先を開示（入金指示書PDFあり）

## Phase4（業販市場型・信用可視化）

| 区分 | 内容 |
|------|------|
| Dispute | `/disputes/new?deal=` — 書類遅延・名変遅延・虚偽・瑕疵・音信不通・不正 |
| 減点記録 | `penalty_logs`（`score_delta` マイナス）+ 既存 `penalty_history` |
| 信用バンド | GOLD 80+ / BLUE 60–79 / YELLOW 40–59 / RED 0–39 |
| マイ統計 | `/my/dashboard` — **本人のみ**（成約率・売上等は非公開） |
| 公開プロフィール | 信用ランク・点数のみ（成約率等は出さない） |
| 管理 | `/admin/disputes` — 審査・減点・会員検索・ステータス強制変更 |

思想: 管理しすぎない。必要最低限のみ。SNS型指標（ランキング・フォロワー・公開成約率）は実装しない。

## Phase5（運営サポート・請求・入出金）

| 区分 | 内容 |
|------|------|
| 運営サポート | `/support` — dispute とは別。名変・書類・入金・請求などの相談 |
| 通知 | `/notifications` — システム内通知 + メール |
| 月額会費 | `/my/payments` — 入金報告 |
| 管理者メール | `/admin/messages` — 個別・一括・条件指定 |
| 請求・振込 | `/admin/billing` — 月額確認・請求書発行・振込完了 |
| 手数料 | 買い手 0% / 売り手 5%（税抜成約価格ベース・別途消費税） |
| 車両代 | 税抜成約価格＋消費税10%を買い手が売り手へ直接支払 |
| PDF | `/api/invoices/[id]/pdf` |

手数料請求書PDFの発行元・振込先（Vercel 環境変数、任意）:

| 変数 | 内容 |
|------|------|
| `MOTOHUB_ISSUER_NAME` | 発行元社名（既定: 株式会社RideWorks） |
| `MOTOHUB_QUALIFIED_INVOICE_NUMBER` | 適格請求書番号 |
| `MOTOHUB_ISSUER_ADDRESS` / `MOTOHUB_ISSUER_PHONE` | 発行元住所・電話 |
| `MOTOHUB_BANK_*` | 振込先（金融機関・支店・口座種別・番号・名義） |
| `MOTOHUB_OPERATOR_EMAIL` | 口座未設定時に参照する運営プロフィール（既定: info@moto-hub.jp） |

`MOTOHUB_BANK_*` が未設定のときのみ、上記メールの `profiles` 登録口座をPDFに表示します。

```sql
select public.admin_create_deal(
  'listing-uuid'::uuid,
  'buyer-uuid'::uuid,
  1150000,
  null,
  'negotiating'::public.deal_status
);
```

## UX プレテスト改善

取引フロー・1台1商談・請求承認などの詳細は [docs/UX_PRETEST.md](docs/UX_PRETEST.md) を参照。

## デプロイ

Vercel + Supabase の組み合わせを想定。環境変数は Vercel に `NEXT_PUBLIC_SUPABASE_*` を設定してください。
