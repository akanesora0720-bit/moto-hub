import type { DealStatus } from "@/lib/types";

/** 入金確認以降の取引のみクレーム可（問い合わせ段階の乱発を防ぐ） */
export const COMPLAINT_ELIGIBLE_DEAL_STATUSES: DealStatus[] = [
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "dispute",
];

export function canBuyerFileComplaint(dealStatus: DealStatus): boolean {
  return COMPLAINT_ELIGIBLE_DEAL_STATUSES.includes(dealStatus);
}
