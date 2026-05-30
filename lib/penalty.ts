export type PenaltySource = "auto_penalty" | "manual_penalty";

export const PENALTY_SOURCE_LABELS: Record<PenaltySource, string> = {
  auto_penalty: "自動減点",
  manual_penalty: "手動減点",
};

export const AUTO_PENALTY_RULES = [
  "車両代金入金期限超過（営業日ごとに自動 −5・進行中取引は事後調整可）",
  "Moto-Hub手数料支払期限超過（営業日ごとに自動 −5・進行中取引は事後調整可）",
  "名義変更期限超過（営業日ごとに自動 −5・進行中取引は事後調整可）",
] as const;

export const MANUAL_PENALTY_EXAMPLES = [
  "無断キャンセル",
  "虚偽申告",
  "dispute（運営判断）",
  "外部連絡先交換・直取引誘導",
  "メーター改ざん",
  "詐欺行為・運営妨害",
] as const;

export function formatPenaltySource(source: PenaltySource | string | null | undefined): string {
  if (source === "auto_penalty" || source === "manual_penalty") {
    return PENALTY_SOURCE_LABELS[source];
  }
  return "—";
}

export function formatPenaltyApplier(
  source: PenaltySource | string | null | undefined,
  createdByLabel: string | null,
): string {
  if (source === "auto_penalty") return "システム（自動）";
  return createdByLabel?.trim() || "運営";
}
