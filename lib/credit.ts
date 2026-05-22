import type { TrustRank } from "@/lib/types";

export type PenaltyCategory = "minor" | "moderate" | "severe";

export const PENALTY_CATEGORIES: {
  value: PenaltyCategory;
  label: string;
  defaultPoints: number;
  description: string;
}[] = [
  {
    value: "minor",
    label: "軽微違反",
    defaultPoints: 5,
    description: "軽微な瑕疵・クレーム・情報不足・対応不備など（-5点）",
  },
  {
    value: "moderate",
    label: "信用低下",
    defaultPoints: 10,
    description: "名変遅延・入金遅延・説明不足・虚偽に近い説明など（-10点）",
  },
  {
    value: "severe",
    label: "重大違反",
    defaultPoints: 30,
    description: "距離減算・受渡拒否・契約不履行・重大虚偽・運営妨害など（-30点〜）",
  },
];

export const BAN_REASON_PRESETS = [
  "詐欺",
  "なりすまし",
  "犯罪行為",
  "脅迫",
  "反社会的勢力",
  "支払い逃れ",
] as const;

export const TRUST_RANK_BANDS: Record<
  TrustRank,
  { min: number; max: number; label: string; description: string }
> = {
  GOLD: { min: 95, max: 100, label: "ゴールド", description: "優良加盟店" },
  BLUE: { min: 70, max: 94, label: "ブルー", description: "通常加盟店" },
  YELLOW: { min: 40, max: 69, label: "イエロー", description: "注意加盟店" },
  RED: { min: 0, max: 39, label: "レッド", description: "重大注意加盟店" },
};

export { TRUST_RANK_LABELS, TRUST_RANK_STYLES, formatTrustScore } from "@/lib/trust";

export function formatPenaltyCategory(cat: PenaltyCategory): string {
  return PENALTY_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function scoreToRank(score: number): TrustRank {
  if (score >= 95) return "GOLD";
  if (score >= 70) return "BLUE";
  if (score >= 40) return "YELLOW";
  return "RED";
}
