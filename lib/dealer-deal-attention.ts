import type { DealStatus } from "@/lib/types";

type DealRow = {
  status: DealStatus;
  buyer_id: string;
  seller_id: string;
  buyer_payment_reported_at?: string | null;
  pickup_scheduled_at?: string | null;
  buyer_confirmed_at?: string | null;
  seller_confirmed_at?: string | null;
};

/** 加盟店に「今やること」がある取引のみ（完了・取消・運営待ちは含めない） */
export function countDealsNeedingDealerAttention(
  deals: DealRow[],
  userId: string,
): number {
  return deals.filter((d) => dealNeedsDealerAttention(d, userId)).length;
}

export function dealNeedsDealerAttention(d: DealRow, userId: string): boolean {
  const s = d.status;
  const isBuyer = d.buyer_id === userId;
  const isSeller = d.seller_id === userId;
  if (!isBuyer && !isSeller) return false;

  switch (s) {
    case "completed":
    case "cancelled":
    case "agreed":
    case "payout_ready":
    case "payout_done":
      return false;
    case "inquiry":
    case "negotiating":
      return true;
    case "awaiting_payment":
      if (isBuyer) return !d.buyer_payment_reported_at;
      return true;
    case "funded":
      if (isBuyer) return true;
      return !!d.pickup_scheduled_at;
    case "handover_done":
    case "transfer_pending":
      if (isBuyer) return !d.buyer_confirmed_at;
      if (isSeller) return !d.seller_confirmed_at;
      return false;
    case "dispute":
      return true;
    default:
      return false;
  }
}
