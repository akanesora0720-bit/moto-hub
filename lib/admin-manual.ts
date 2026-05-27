import type { ManualSection } from "@/lib/manual-types";

export const ADMIN_MANUAL_SECTIONS: ManualSection[] = [
  {
    id: "intro",
    title: "1. はじめに",
    blocks: [
      {
        kind: "p",
        text: "運営画面は加盟店の商談・取引・審査・精算を一元管理します。管理者（is_admin）とスタッフ（member_type = staff）が利用できます。",
      },
      {
        kind: "callout",
        text: "車両代金は買い手→売り手の直接振込です。運営が売り手へ車両代を振り込む機能は廃止済みです。「取引を完了にする」はシステム上の締結であり、送金操作ではありません。",
      },
      {
        kind: "table",
        headers: ["画面", "パス"],
        rows: [
          ["管理センター", "/admin"],
          ["商談・取引", "/admin/workspace"],
          ["取引連絡", "/admin/deals"],
          ["精算", "/admin/billing"],
          ["取引記録", "/admin/transaction-records"],
          ["加盟店・信用", "/admin/credit"],
          ["MotoHub査定", "/admin/inspections"],
          ["サポート / トラブル", "/admin/support · /admin/disputes"],
        ],
      },
    ],
  },
  {
    id: "hub",
    title: "2. 管理センター（/admin）",
    blocks: [
      {
        kind: "p",
        text: "KPI と未対応件数のハブです。件数のある項目から該当画面へ遷移します。",
      },
      {
        kind: "ul",
        items: [
          "① 商談監視 — 査定依頼・新規リード・振込報告・引渡フェーズ・取引完了待ち・名変超過など",
          "② 精算管理 — 請求書確認待ち・月額入金報告の未確認",
          "③ 加盟店審査 — 信用・クレーム・運営サポート",
          "④ 違反監視 — dispute・リスクフラグ",
        ],
      },
    ],
  },
  {
    id: "workspace",
    title: "3. 商談・取引ワークスペース",
    blocks: [
      {
        kind: "p",
        text: "/admin/workspace で問い合わせ・取引・加盟店一覧・クレームなどをタブ切り替えで操作します。",
      },
      {
        kind: "ul",
        items: [
          "問い合わせ — 未紐づきリードの確認、取引への紐づけ",
          "取引 — ステータス別の一覧。買い手振込報告・引渡・完了確認待ちの把握",
          "加盟店 — 一覧から審査・本人確認・ペナルティ・BAN",
          "スタッフ招待 — 運営スタッフのメール招待（管理者）",
        ],
      },
      {
        kind: "callout",
        text: "商談・合意の価格調整は運営が仲介します。合意後は取引詳細の「運営の手順」が主な作業画面です。",
      },
    ],
  },
  {
    id: "deal-ops",
    title: "4. 取引の運営手順（/admin/deals/[id]）",
    blocks: [
      {
        kind: "p",
        text: "取引詳細の「運営の手順」パネルに、推奨順のチェックリストが表示されます。",
      },
      {
        kind: "ul",
        items: [
          "① 入金指示書を承認して送る — 合意（agreed）確定後、取引記録書が自動作成され、買い手が売り手へ振込できるよう入金指示 PDF を送信",
          "② 当事者の入金・引渡・完了確認 — 売り手の入金確認、買い手の振込報告、引取日時、双方の完了ボタンを監視",
          "③ 取引を完了にする — ステータスが「双方確認済（運営が取引完了へ）」のとき実行。車両代の送金はしない",
          "④ MotoHub手数料の入金確認 — 税抜3万円超の成約で売り手宛請求書の入金を記録",
          "⑤ 名義変更のフォロー — 対象取引は期限・超過・完了記録を確認",
        ],
      },
      {
        kind: "table",
        headers: ["取引ステータス（運営表示）", "運営の主な作業"],
        rows: [
          ["入金待ち（入金指示承認）", "入金指示書の承認送信"],
          ["入金確認済〜名義変更待ち", "当事者操作のフォロー・連絡板の監視"],
          ["双方確認済（運営が取引完了へ）", "「取引を完了にする」"],
          ["完了", "記録のみ（必要なら手数料・名変の後追い）"],
        ],
      },
    ],
  },
  {
    id: "deals-board",
    title: "5. 取引連絡板",
    blocks: [
      {
        kind: "ul",
        items: [
          "/admin/deals — 取引一覧・未読メッセージ",
          "入金前でも運営は閲覧・投稿可能。当事者は入金確認後から利用可",
          "用途は引取・引渡・陸送関連のみ（加盟店向けルールと同じ）",
        ],
      },
    ],
  },
  {
    id: "records",
    title: "6. 取引記録書",
    blocks: [
      {
        kind: "p",
        text: "業者間取引の記録を DB（transaction_records）に保存し、当事者・運営が PDF 出力できます。admin_finalize_agreement（合意確定）または deals 更新トリガーで同期されます。",
      },
      {
        kind: "ul",
        items: [
          "一覧・検索：/admin/transaction-records — 取引ID・車両名・売主店名・買主店名・成約日（範囲）で検索",
          "取引詳細：/admin/deals/[id] 下部に当事者と同様のパネル表示",
          "詳細・PDF：/transaction-records/[id] および /api/transaction-records/[id]/pdf",
          "成約（agreed）以降の取引のみ。商談中・取消は記録なし（取消時は削除）",
        ],
      },
      {
        kind: "table",
        headers: ["データ", "扱い"],
        rows: [
          ["売主・買主・車両", "初回作成時のスナップショット（後から profiles / listings を変えても不変）"],
          ["支払状況・引渡・書類状況", "取引の進行に合わせて自動更新"],
          ["登録番号", "出品の型式指定（model_designation）があれば記録（専用欄がない場合は空）"],
        ],
      },
      {
        kind: "callout",
        text: "加盟店の閲覧は account_status = approved のみ（RLS）。運営・スタッフは全件検索・閲覧可能。PDFは「売買契約書ではない」注意書き付き。",
      },
    ],
  },
  {
    id: "billing",
    title: "7. 精算（/admin/billing）",
    blocks: [
      {
        kind: "ul",
        items: [
          "入金指示書 確認待ち — 一覧からの一括承認は補助用。基本は取引詳細で承認",
          "月額会費 — 毎月20日に自動発行（cron）。金額は発行時点の trust_rank 別（system_settings.billing.monthly_membership_fee_by_rank）。初年度は100点スタートのため多くがゴールド",
          "月額入金報告 — 加盟店の振込報告を確認・差戻し（請求書の入金確認と連動可）",
          "請求書一覧 — 入金指示・手数料・査定の PDF と入金確認",
        ],
      },
      {
        kind: "callout",
        text: "運営→売り手への「振込」管理は廃止済みです。車両代は当事者間で完結します。",
      },
    ],
  },
  {
    id: "dealers",
    title: "8. 加盟店審査・信用（/admin/credit）",
    blocks: [
      {
        kind: "ul",
        items: [
          "新規加盟 — ワークスペースの加盟店タブで onboarding 送信後「加盟審査を承認」→ account_status = approved（正式契約・全機能解放）",
          "否認・停止 — 審査結果に応じてステータス更新",
          "信用スコア — 手動減点（理由は加盟店に公開）、年末リセット等",
          "リスクフラグ・BAN — 重大案件の記録と利用停止",
        ],
      },
    ],
  },
  {
    id: "inspection",
    title: "9. MotoHub査定（/admin/inspections）",
    blocks: [
      {
        kind: "ul",
        items: [
          "依頼受付 → 日程確定 → 査定中 → 出品代行登録で完了",
          "完了時に税抜3,000円/台の請求書を発行（加盟店が PDF 取得）",
          "査定済バッジはスタッフ代行出品の車両のみ",
        ],
      },
    ],
  },
  {
    id: "support",
    title: "10. サポート・トラブル",
    blocks: [
      {
        kind: "ul",
        items: [
          "/admin/support — 加盟店からの実務相談チケット",
          "/admin/disputes — 紛争・トラブル申告の審査・ステータス更新",
          "/admin/messages — 一斉メール送信（必要時）",
          "/admin/notifications — 運営向け通知の確認",
        ],
      },
      {
        kind: "p",
        text: "dispute は「キャンセル申請」ではなく、事実確認・協議のためのトラブル報告です。虚偽瑕疵申告、手数料回避目的のキャンセル、口裏合わせ等が疑われる場合は、運営裁量で調査・点数調整・利用制限の対象とします。",
      },
      {
        kind: "p",
        text: "運営判断では、(1) 瑕疵の程度（軽微／重大／致命的）、(2) 希望対応（継続／値引き／キャンセル／相談）、(3) 手数料扱い（通常請求／免除／部分／保留）、(4) fraud_suspected（不正疑い）を記録し、売主・買主それぞれに点数調整を設定します。",
      },
    ],
  },
  {
    id: "tips",
    title: "11. 運用上の注意",
    blocks: [
      {
        kind: "ul",
        items: [
          "サイドバーのバッジは未対応件数の目安。詳細は各画面で確認",
          "取引詳細の運営手順と管理センターの「取引完了待ち」は同じ payout_ready / payout_done を指す",
          "加盟店向けの画面説明は加盟店画面の /help（運営は /admin/help）",
          "取引記録の問い合わせ時は記録ID・取引IDを控えて対応",
        ],
      },
    ],
  },
];
