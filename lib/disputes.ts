import type {
  DealStatus,
  DefectSeverity,
  DisputeCategory,
  DisputeFeeHandling,
  DisputeRequestedOutcome,
  DisputeType,
} from "@/lib/types";

/** 新分類（068+）。UI の主カテゴリ */
export const DISPUTE_TYPES: {
  value: DisputeType;
  label: string;
  description: string;
  legacyCategory: DisputeCategory;
}[] = [
  {
    value: "vehicle_defect",
    label: "車両瑕疵・実車差異",
    description: "出品情報と実車の相違、不具合、説明不足",
    legacyCategory: "defect",
  },
  {
    value: "document_issue",
    label: "書類・名変",
    description: "書類不備、名義変更・車検関連の問題",
    legacyCategory: "doc_delay",
  },
  {
    value: "payment_issue",
    label: "入金・連絡",
    description: "入金・連絡に関するトラブル",
    legacyCategory: "no_contact",
  },
  {
    value: "cancellation_request",
    label: "取引中止の相談",
    description: "キャンセル希望・協議（自動キャンセルではありません）",
    legacyCategory: "false_claim",
  },
  {
    value: "suspected_fraud",
    label: "不正・虚偽の疑い",
    description: "虚偽申告、口裏合わせ、手数料回避の疑いなど",
    legacyCategory: "fraud",
  },
];

export const DEFECT_SEVERITIES: {
  value: DefectSeverity;
  label: string;
  suggestedSellerPenalty: number;
}[] = [
  { value: "minor", label: "軽微", suggestedSellerPenalty: 10 },
  { value: "major", label: "重大", suggestedSellerPenalty: 20 },
  { value: "critical", label: "致命的", suggestedSellerPenalty: 30 },
];

export const DISPUTE_REQUESTED_OUTCOMES: {
  value: DisputeRequestedOutcome;
  label: string;
}[] = [
  { value: "continue", label: "取引継続（協議のうえ進行）" },
  { value: "discount", label: "値引き・条件変更の協議" },
  { value: "cancel", label: "取引中止を希望（運営判断）" },
  { value: "consult", label: "運営に相談・事実確認のみ" },
];

export const DISPUTE_FEE_HANDLING_OPTIONS: {
  value: DisputeFeeHandling;
  label: string;
}[] = [
  { value: "pending", label: "未決定（保留）" },
  { value: "charge", label: "手数料請求（通常）" },
  { value: "waive", label: "手数料免除（請求書取消）" },
  { value: "partial", label: "部分調整（メモのみ・別途精算）" },
];

/** 旧カテゴリ（互換・管理画面の legacy 表示用） */
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
  resolved: "解決済",
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

export function disputeTypeLabel(type: DisputeType | null | undefined): string {
  if (!type) return "—";
  return DISPUTE_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function disputeSuggestedPenalty(
  type: DisputeType,
  severity?: DefectSeverity | null,
): number {
  if (type === "suspected_fraud") return 50;
  if (type === "cancellation_request") return 15;
  if (type === "vehicle_defect") {
    if (severity === "critical") return 30;
    if (severity === "major") return 20;
    return 15;
  }
  if (type === "document_issue" || type === "payment_issue") return 10;
  return 10;
}

export function disputeCategoryLabel(cat: DisputeCategory): string {
  return DISPUTE_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}

export function defectSeverityLabel(sev: DefectSeverity | null | undefined): string {
  if (!sev) return "—";
  return DEFECT_SEVERITIES.find((s) => s.value === sev)?.label ?? sev;
}

export function requestedOutcomeLabel(
  outcome: DisputeRequestedOutcome | null | undefined,
): string {
  if (!outcome) return "—";
  return DISPUTE_REQUESTED_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
}

export function feeHandlingLabel(fee: DisputeFeeHandling | null | undefined): string {
  if (!fee) return "—";
  return DISPUTE_FEE_HANDLING_OPTIONS.find((f) => f.value === fee)?.label ?? fee;
}

export function legacyCategoryForType(type: DisputeType): DisputeCategory {
  return DISPUTE_TYPES.find((t) => t.value === type)?.legacyCategory ?? "defect";
}
