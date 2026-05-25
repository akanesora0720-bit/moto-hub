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
export function buyerDealLabel(
  status: DealStatus,
  opts?: { buyerPaymentReported?: boolean },
): string {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
      return "商談中";
    case "awaiting_payment":
      return opts?.buyerPaymentReported ? "振込報告済（確認待ち）" : "振込・報告";
    case "funded":
      return "引取日時の入力";
    case "handover_done":
      return "完了確認待ち";
    case "transfer_pending":
      return "名変待ち";
    case "payout_ready":
      return "完了登録待ち";
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
export function sellerDealLabel(
  status: DealStatus,
  opts?: { buyerPaymentReported?: boolean },
): string {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
    case "awaiting_payment":
      return opts?.buyerPaymentReported
        ? "振込報告あり・入金確認"
        : "買い手の入金待ち";
    case "funded":
      return "引取予定待ち";
    case "handover_done":
    case "transfer_pending":
      return "名変・確認待ち";
    case "payout_ready":
      return "取引完了待ち";
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

export type DealPartyRole = "buyer" | "seller";

/** 取引詳細などの小バッジ（当事者向け。DEAL_STATUS_LABELS は運営内部名） */
export function partyDealStatusBadge(status: DealStatus, role: DealPartyRole): string {
  if (role === "buyer") {
    switch (status) {
      case "inquiry":
        return "問い合わせ中";
      case "negotiating":
      case "agreed":
        return "商談中";
      case "awaiting_payment":
        return "入金待ち";
      case "funded":
        return "引取準備";
      case "handover_done":
        return "確認待ち";
      case "transfer_pending":
        return "名変対応中";
      case "payout_ready":
        return "確認完了";
      case "payout_done":
        return "完了処理中";
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

  switch (status) {
    case "inquiry":
      return "問い合わせ受付";
    case "negotiating":
    case "agreed":
      return "商談中";
    case "awaiting_payment":
      return "入金確認待ち";
    case "funded":
      return "引渡待ち";
    case "handover_done":
      return "確認待ち";
    case "transfer_pending":
      return "名変対応中";
    case "payout_ready":
      return "完了登録待ち";
    case "payout_done":
      return "振込完了";
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

/** 取引詳細の案内文（role ごと。null は非表示） */
export function partyDealActionHint(status: DealStatus, role: DealPartyRole): string | null {
  if (role === "buyer") {
    switch (status) {
      case "awaiting_payment":
        return "売り手口座へ税込総額をお振込みください。振込後は「振込した」ボタンで売り手・運営に知らせてください。";
      case "funded":
        return "引取予定日時を登録してください。車両・書類は売り手と現地で引渡します。";
      case "handover_done":
      case "transfer_pending":
        return "引渡後、問題なければ「取引完了を確認（買い手）」を押してください。";
      case "payout_ready":
        return "買い手・売り手の確認は終わっています。運営が取引を完了にします。ご対応は不要です。";
      case "payout_done":
        return "運営が最終登録中です。まもなく「完了」になります。";
      case "completed":
        return "お取引ありがとうございました。";
      default:
        return null;
    }
  }

  switch (status) {
    case "awaiting_payment":
      return "買い手が「振込した」と報告したら口座を確認し、「買い手からの入金を確認」を押してください。確認後、MotoHub手数料請求書を発行します。";
    case "funded":
      return "買い手の引取予定を確認し、現地で車両・書類を引渡したら「引渡完了」を押してください。";
    case "handover_done":
    case "transfer_pending":
      return "名変・引渡に問題がなければ「取引完了を確認（売り手）」を押してください。";
    case "payout_ready":
      return "双方の確認が終わりました。運営が取引を完了にします。車両代金は買い手からの入金確認済みです。MotoHub手数料請求書は入金確認時に発行済みです。";
    case "payout_done":
      return "運営による完了登録が進んでいます。まもなく取引が「完了」になります。";
    case "completed":
      return "お取引ありがとうございました。";
    default:
      return null;
  }
}
