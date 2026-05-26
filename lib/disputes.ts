import type { DealStatus, DisputeCategory } from "@/lib/types";

export const DISPUTE_CATEGORIES: {
  value: DisputeCategory;
  label: string;
  suggestedPoints: number;
  description: string;
}[] = [
  {
    value: "doc_delay",
    label: "書類遅延",
    suggestedPoints: 10,
    description: "期限超過は原則自動減点。悪質な場合は手動で追加減点可",
  },
  {
    value: "transfer_delay",
    label: "名変遅延",
    suggestedPoints: 10,
    description: "期限超過は原則自動減点。悪質な場合は手動で追加減点可",
  },
  {
    value: "false_claim",
    label: "虚偽申告",
    suggestedPoints: 30,
    description: "運営裁量（悪質性・故意性を総合判断）",
  },
  {
    value: "defect",
    label: "瑕疵",
    suggestedPoints: 15,
    description: "運営裁量（程度・説明義務違反を総合判断）",
  },
  {
    value: "no_contact",
    label: "音信不通",
    suggestedPoints: 10,
    description: "運営裁量",
  },
  {
    value: "fraud",
    label: "不正",
    suggestedPoints: 50,
    description: "運営裁量（重大違反）",
  },
];

export const DISPUTE_STATUS_LABELS: Record<string, string> = {
  open: "受付",
  reviewing: "審査中",
  resolved: "解決（減点あり）",
  rejected: "却下",
};

export const DISPUTE_ELIGIBLE_DEAL_STATUSES: DealStatus[] = [
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "dispute",
];

export function canFileDispute(status: DealStatus): boolean {
  return DISPUTE_ELIGIBLE_DEAL_STATUSES.includes(status);
}

export function disputeSuggestedPenalty(cat: DisputeCategory): number {
  return DISPUTE_CATEGORIES.find((c) => c.value === cat)?.suggestedPoints ?? 10;
}

export function disputeCategoryLabel(cat: DisputeCategory): string {
  return DISPUTE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
