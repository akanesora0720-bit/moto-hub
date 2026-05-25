import type { DealStatus } from "@/lib/types";

/** 入金確認後（DB: funded 以降） */
export const DEAL_BOARD_POST_PAYMENT_STATUSES: DealStatus[] = [
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "dispute",
];

export const DEAL_BOARD_DESCRIPTION =
  "この連絡板は、入金確認後の引取・引渡し（車両と書類は同時）に関する連絡専用です。価格交渉、外部連絡先の交換、MotoHub外での直接取引は禁止されています。";

export const EMERGENCY_CONTACT_CONFIRM_MESSAGE =
  "緊急時のみ売り手の連絡先を表示します。表示履歴は運営に記録されます。通常の連絡は取引連絡板をご利用ください。";

export type DealBoardVisibilityInput = {
  status: DealStatus;
  seller_payment_confirmed_at: string | null;
};

export function isDealPaymentConfirmedForBoard(
  deal: DealBoardVisibilityInput,
): boolean {
  return (
    deal.seller_payment_confirmed_at != null ||
    DEAL_BOARD_POST_PAYMENT_STATUSES.includes(deal.status)
  );
}

/** 買い手・売り手: 入金確認後のみ */
export function canShowDealBoardForParty(deal: DealBoardVisibilityInput): boolean {
  return isDealPaymentConfirmedForBoard(deal);
}

/** 運営: 入金前でも閲覧・投稿可 */
export function canShowDealBoardForViewer(
  deal: DealBoardVisibilityInput,
  opts: { isAdmin: boolean },
): boolean {
  if (opts.isAdmin) return true;
  return canShowDealBoardForParty(deal);
}

export type DealMessageSenderRole = "buyer" | "seller" | "admin";

export const DEAL_MESSAGE_ROLE_LABELS: Record<DealMessageSenderRole, string> = {
  buyer: "買い手",
  seller: "売り手",
  admin: "運営",
};

export type DealMessageRow = {
  id: string;
  deal_id: string;
  sender_user_id: string;
  sender_role: DealMessageSenderRole;
  sender_label: string;
  message: string;
  created_at: string;
};

export type EmergencySellerContact = {
  store_name: string | null;
  contact_name: string | null;
  phone: string | null;
};

export function formatDealMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
