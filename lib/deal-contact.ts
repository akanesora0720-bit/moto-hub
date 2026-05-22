import type { DealStatus } from "@/lib/types";

/** funded 到達後のみ連絡先開示 */
export const CONTACT_REVEAL_STATUSES: DealStatus[] = [
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "dispute",
];

export function canRevealDealContacts(status: DealStatus): boolean {
  return CONTACT_REVEAL_STATUSES.includes(status);
}

export type DealPartyContact = {
  store_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
};
