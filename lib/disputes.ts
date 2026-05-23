import type { DealStatus, DisputeCategory } from "@/lib/types";

export const DISPUTE_CATEGORIES: {
  value: DisputeCategory;
  label: string;
  penalty: number;
  description: string;
}[] = [
  { value: "doc_delay", label: "書類遅延", penalty: 10, description: "必要書類の提出・郵送が遅延" },
  { value: "transfer_delay", label: "名変遅延", penalty: 10, description: "名義変更期限を超過" },
  { value: "false_claim", label: "虚偽申告", penalty: 30, description: "車両状態・走行・改造等の虚偽" },
  { value: "defect", label: "瑕疵", penalty: 15, description: "申告以上の瑕疵・隠し瑕疵" },
  { value: "no_contact", label: "音信不通", penalty: 10, description: "連絡不能・対応拒否" },
  { value: "fraud", label: "不正", penalty: 50, description: "不正行為・詐欺行為" },
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

export function disputePenaltyForCategory(cat: DisputeCategory): number {
  return DISPUTE_CATEGORIES.find((c) => c.value === cat)?.penalty ?? 10;
}

export function disputeCategoryLabel(cat: DisputeCategory): string {
  return DISPUTE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
