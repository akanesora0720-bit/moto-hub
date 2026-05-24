import type { DealStatus } from "@/lib/types";

export type InquiryLinkedDeal = {
  id: string;
  status: DealStatus;
  created_at: string;
};

const TERMINAL_STATUSES: DealStatus[] = ["completed", "cancelled"];

/** 問い合わせに紐づく取引のうち、画面に出すべき1件を選ぶ（有効な取引を優先） */
export function pickPrimaryDealForInquiry(
  deals: InquiryLinkedDeal[],
): InquiryLinkedDeal | null {
  if (deals.length === 0) return null;

  const active = deals.filter((d) => !TERMINAL_STATUSES.includes(d.status));
  const pool = active.length > 0 ? active : deals;

  return [...pool].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}
