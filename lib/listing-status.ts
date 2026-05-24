import type { ListingStatus } from "@/lib/types";

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: "出品中",
  negotiating: "商談中",
  sold: "成約済",
  removed: "削除",
};

export function isListingInquirable(status: ListingStatus): boolean {
  return status === "active";
}
