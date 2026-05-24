import type { DealStatus } from "@/lib/types";

/** 成約後（入金指示〜）に売り手振込先・連絡先を開示 */
export const CONTACT_REVEAL_STATUSES: DealStatus[] = [
  "agreed",
  "awaiting_payment",
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
  trade_name?: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  invoice_number?: string | null;
  address?: string | null;
  prefecture?: string | null;
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
};
