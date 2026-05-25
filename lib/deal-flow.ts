import type { DealStatus } from "@/lib/types";

export const DEAL_STATUSES: DealStatus[] = [
  "inquiry",
  "negotiating",
  "agreed",
  "awaiting_payment",
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "cancelled",
  "dispute",
];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  inquiry: "問い合わせ",
  negotiating: "商談中",
  agreed: "合意",
  awaiting_payment: "入金待ち",
  funded: "入金確認済",
  handover_done: "引渡完了",
  transfer_pending: "名義変更待ち",
  payout_ready: "振込準備完了",
  payout_done: "振込完了",
  completed: "完了",
  cancelled: "取消",
  dispute: "紛争",
};

/** 購入側の進捗表示 */
export function buyerDealLabel(status: DealStatus): string {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
      return "商談中";
    case "awaiting_payment":
      return "入金待ち";
    case "funded":
      return "引取日時の入力";
    case "handover_done":
      return "完了確認待ち";
    case "transfer_pending":
      return "名変待ち";
    case "payout_ready":
      return "振込手続中";
    case "payout_done":
    case "completed":
      return "完了";
    case "cancelled":
      return "取消";
    case "dispute":
      return "紛争対応中";
    default:
      return DEAL_STATUS_LABELS[status];
  }
}

/** 販売側の進捗表示 */
export function sellerDealLabel(status: DealStatus): string {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
    case "awaiting_payment":
      return "入金確認中";
    case "funded":
      return "引取予定待ち";
    case "handover_done":
    case "transfer_pending":
      return "名変・確認待ち";
    case "payout_ready":
      return "振込待ち";
    case "payout_done":
    case "completed":
      return "完了";
    case "cancelled":
      return "取消";
    case "dispute":
      return "紛争対応中";
    default:
      return DEAL_STATUS_LABELS[status];
  }
}

export function formatPickupSchedule(iso: string | null): string {
  if (!iso) return "未登録";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTransferDeadline(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isDealActive(status: DealStatus): boolean {
  return status !== "completed" && status !== "cancelled";
}
