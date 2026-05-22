import type { ComplaintType, TrustRank } from "@/lib/types";

export const TRUST_RANK_LABELS: Record<TrustRank, string> = {
  GOLD: "ゴールド",
  BLUE: "ブルー",
  YELLOW: "イエロー",
  RED: "レッド",
};

export const TRUST_RANK_STYLES: Record<TrustRank, string> = {
  GOLD: "border-amber-300/60 bg-amber-400/15 text-amber-100",
  BLUE: "border-sky-400/50 bg-sky-500/15 text-sky-100",
  YELLOW: "border-yellow-500/50 bg-yellow-500/10 text-yellow-100",
  RED: "border-rose-500/50 bg-rose-500/15 text-rose-100",
};

export const COMPLAINT_TYPES: {
  value: ComplaintType;
  label: string;
  penalty: number;
}[] = [
  { value: "minor_condition", label: "軽微な状態相違", penalty: 5 },
  { value: "undisclosed_damage", label: "傷申告漏れ", penalty: 10 },
  { value: "transfer_delay", label: "名変遅延", penalty: 10 },
  { value: "major_misrepresentation", label: "重大虚偽", penalty: 30 },
  { value: "mileage_issue", label: "距離問題", penalty: 30 },
  { value: "theft_issue", label: "盗難問題", penalty: 50 },
];

export function penaltyForType(type: ComplaintType): number {
  return COMPLAINT_TYPES.find((t) => t.value === type)?.penalty ?? 0;
}

export function formatTrustScore(score: number) {
  return `${score}点`;
}
