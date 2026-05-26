import { isDealerApproved } from "@/lib/account-status";
import { canAccessAdmin } from "@/lib/auth";
import type { Profile, TransactionRecord, TransactionPartySnapshot } from "@/lib/types";

export const TRANSACTION_RECORD_DISCLAIMER =
  "本書はMotoHub上で成立した業者間取引の記録を出力したものであり、売買契約書ではありません。古物台帳、経理処理、社内管理等の補助資料としてご利用ください。";

const DEAL_STATUSES_WITH_RECORD = new Set([
  "agreed",
  "awaiting_payment",
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "completed",
  "dispute",
]);

export function dealStatusMayHaveTransactionRecord(status: string): boolean {
  return DEAL_STATUSES_WITH_RECORD.has(status);
}

/** 売主・買主（加盟承認済）または運営のみ */
export function canViewTransactionRecords(
  profile: Pick<Profile, "member_type" | "account_status" | "is_admin" | "is_active" | "is_banned"> | null,
): boolean {
  if (!profile?.is_active || profile.is_banned) return false;
  if (canAccessAdmin(profile as Profile)) return true;
  return isDealerApproved(profile);
}

export function formatPartySnapshot(s: TransactionPartySnapshot): string {
  const lines = [
    s.store_name || s.trade_name || "—",
    s.trade_name && s.store_name && s.trade_name !== s.store_name ? `屋号: ${s.trade_name}` : null,
    s.contact_name ? `担当: ${s.contact_name}` : null,
    s.antique_dealer_number ? `古物商: ${s.antique_dealer_number}` : null,
    s.invoice_number ? `インボイス: ${s.invoice_number}` : null,
    [s.prefecture, s.address].filter(Boolean).join(" ") || null,
    s.phone ? `TEL: ${s.phone}` : null,
    s.email ? `Email: ${s.email}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function formatContractedAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRecordDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isTransactionRecordParty(
  record: Pick<TransactionRecord, "buyer_id" | "seller_id">,
  userId: string,
): boolean {
  return record.buyer_id === userId || record.seller_id === userId;
}
