import { BRAND } from "@/lib/brand";
import {
  FEE_FREE_MAX_PRICE_EX_TAX,
  SELLER_FEE_RATE,
} from "@/lib/billing";
import { PART_FEE_THRESHOLD_EX_TAX, PART_SELLER_FEE_RATE } from "@/lib/part-fees";

/** Gamma プレゼン資料（Untitled-79936nhd3fukm0h）に沿った LP 文言 */
export const LP_CONTENT = {
  hero: {
    eyebrow: "B2B · 古物商向け",
    title: "二輪業界の新しい流通インフラ",
    subtitle:
      "全国の加盟店在庫をオンラインで繋ぐ。オークションではなく、加盟店同士が直接商談して仕入れ・販売できるプラットフォームです。",
    company: BRAND.companyName,
  },
  problem: {
    tag: "現状",
    title: "二輪業界の課題",
    lead: "現在の仕入れ方法に起因する、さまざまな課題に直面しています。",
    sources: [
      "業者オークション",
      "下取り",
      "自社買取",
      "業者間の電話",
      "比較サイト",
      "紹介",
    ],
    outcomes: [
      "欲しい車両が見つからない",
      "仕入れに時間がかかる",
      "在庫情報が分散している",
      "商談までの手間が大きい",
      "仕入金額が高くなる",
    ],
  },
  solution: {
    tag: "ソリューション",
    title: "Moto-Hubとは",
    lead: "全国の加盟店在庫をオンラインで繋ぐ、二輪業界の新しい流通インフラです。",
    points: [
      "オークションではありません。",
      "加盟店同士が直接商談し、仕入れ・販売できる仕組みです。",
      "車両代金は買い手→売り手への直接振込（決済代行は行いません）。",
    ],
  },
  features: {
    tag: "機能",
    title: "Moto-Hubでできること",
    items: [
      { title: "車両検索", description: "全国の加盟店在庫をエリア・条件で検索" },
      { title: "パーツ検索", description: "メーカー・車種・品番でパーツを探す" },
      { title: "加盟店同士の商談", description: "問い合わせから成約まで一連の取引管理" },
      { title: "出品", description: "税抜業販価格で在庫を掲載" },
      { title: "成約管理", description: "入金・引渡・名変コンプライアンスをサポート" },
      { title: "トラブル報告", description: "dispute・運営サポートで安心の取引環境" },
    ],
  },
  philosophy: {
    tag: "信用管理",
    title: "Moto-Hubの考え方",
    paragraphs: [
      "加盟店が安心して取引できる市場づくりを目指しています。",
      "Moto-Hubは評価サイトではありません。安全な取引環境を維持するための信用管理制度を採用しています。",
    ],
  },
  delivery: {
    tag: "段階的拡張",
    title: "配送について",
    lead: "Moto-Hubはまず「流通」をシンプルに繋ぐことを優先しています。",
    cards: [
      {
        title: "配送・陸送支援について",
        body: "将来的な配送・陸送支援の検討を進めています。現段階では当事者間での手配が基本です。",
      },
      {
        title: "引取・引渡の調整",
        body: "成約後は買い手・売り手が引取日時などを直接調整。取引連絡板で進捗を共有できます。",
      },
    ],
  },
  pricing: {
    tag: "料金",
    title: "料金の目安",
    buyerPolicy: "Moto-Hubは買い手手数料0円を基本方針としています。",
    vehicle: {
      title: "車両成約手数料（税抜成約価格）",
      rows: [
        {
          label: `${FEE_FREE_MAX_PRICE_EX_TAX.toLocaleString("ja-JP")}円未満`,
          value: "売り手無料 · 買い手無料",
        },
        {
          label: `${FEE_FREE_MAX_PRICE_EX_TAX.toLocaleString("ja-JP")}円以上`,
          value: `売り手 ${SELLER_FEE_RATE * 100}% · 買い手無料`,
        },
      ],
    },
    parts: {
      title: "パーツ成約手数料（税抜成約価格）",
      rows: [
        {
          label: `${PART_FEE_THRESHOLD_EX_TAX.toLocaleString("ja-JP")}円未満`,
          value: "売り手無料 · 買い手無料",
        },
        {
          label: `${PART_FEE_THRESHOLD_EX_TAX.toLocaleString("ja-JP")}円以上`,
          value: `売り手 ${PART_SELLER_FEE_RATE * 100}% · 買い手無料`,
        },
      ],
    },
    note: "車両代金・パーツ代金は買主から売主口座への直接振込です。Moto-Hub手数料は週次請求（毎週月曜発行・土〜金集計）。詳細は料金表をご確認ください。",
  },
  campaign: {
    tag: "限定オファー",
    title: "先行加盟キャンペーン",
    highlight: "月額会費無料",
    detail:
      "2026年6月30日までの加盟申請で、7月・8月・9月は月額会費無料（税抜会費）。",
    deadline: "2026年6月30日まで",
    freeMonths: "7月 · 8月 · 9月",
  },
  cta: {
    title: "まずは無料で先行加盟申請",
    subtitle: "古物商としての登録・審査後、全国の在庫検索と商談が利用できます。",
    primary: BRAND.ctaApply,
    login: "ログイン",
  },
} as const;
