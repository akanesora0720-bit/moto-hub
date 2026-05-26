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
    label: "軽微",
    defaultPoints: 5,
    description: "軽微な問題・初回の対応不備など（運営裁量・目安 −5）",
  },
  {
    value: "moderate",
    label: "中程度",
    defaultPoints: 10,
    description: "再発・説明不足・虚偽に近い説明など（運営裁量・目安 −10）",
  },
  {
    value: "severe",
    label: "重大",
    defaultPoints: 30,
    description: "悪質・故意・詐欺・運営妨害など（運営裁量・目安 −30）",
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
  GOLD: { min: 80, max: 100, label: "ゴールド", description: "安心して通常取引できる加盟店" },
  BLUE: { min: 60, max: 79, label: "ブルー", description: "標準的な信用水準" },
  YELLOW: { min: 40, max: 59, label: "イエロー", description: "注意が必要な加盟店" },
  RED: { min: 0, max: 39, label: "レッド", description: "重大注意加盟店" },
};

export { TRUST_RANK_LABELS, TRUST_RANK_STYLES, formatTrustScore } from "@/lib/trust";

export function formatPenaltyCategory(cat: PenaltyCategory): string {
  return PENALTY_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function scoreToRank(score: number): TrustRank {
  if (score >= 80) return "GOLD";
  if (score >= 60) return "BLUE";
  if (score >= 40) return "YELLOW";
  return "RED";
}
