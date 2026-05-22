# MotoHub

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
| プロフィール | `/members/[id]` 点数・ランク・成約数・査定済率 |
| 査定済 | 管理画面で `inspection_status` を ON → RideWorks査定済バッジ |
| 評価基準 | `/evaluation` 車両評価基準スライド（オークション風10段階） |
| 会員種別 | **dealer**（業者・古物商必須） / **staff**（運営・管理のみ） |

### 運営スタッフの登録

1. 従業員に `/signup/staff` のURLを共有（またはログイン画面のリンク）
2. スタッフは担当者名・電話のみ入力 → 管理画面へ
3. 既存ユーザーをスタッフにする場合: 管理 → 会員 → **スタッフ化**

あなた（RideWorks）は `/signup` で **業者** 登録 + SQL で `is_admin = true` のまま。

## 取引フロー（Phase3）

| ステータス | 意味 |
|-----------|------|
| inquiry → negotiating → agreed | 問い合わせ・商談・合意（運営） |
| awaiting_payment → funded | 買い手入金 → 運営入金確認 |
| handover_done / transfer_pending | 車両＋書類同時引渡。車検残ありは名変待ち（引渡後・翌週金曜まで） |
| payout_ready | 双方が「取引完了確認」済み |
| payout_done → completed | 運営振込 → 全処理終了 |

- 業者 UI: `/deals`（購入側・販売側の進捗表示）
- 管理: 成約タブでステータス変更・名変コンプライアンスジョブ（超過3日−5 / 7日−10 / 14日要レビュー）
- 運営 KPI: `/admin/dashboard`
- 通知: 日次 cron → `docs/OPERATIONS.md`
- funded 後: 取引詳細で取引先連絡先（店舗・担当・電話）を開示
- 振込は **payout_ready のみ**（双方確認後）

```sql
select public.admin_create_deal(
  'listing-uuid'::uuid,
  'buyer-uuid'::uuid,
  1150000,
  null,
  'negotiating'::public.deal_status
);
```

## デプロイ

Vercel + Supabase の組み合わせを想定。環境変数は Vercel に `NEXT_PUBLIC_SUPABASE_*` を設定してください。
