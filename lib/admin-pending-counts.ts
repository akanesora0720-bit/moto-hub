import {
  countActionableOpenInquiries,
  countAdminNegotiationPending,
  countNegotiationPhaseDeals,
  countOrphanOpenInquiries,
} from "@/lib/open-inquiry-count";
import { createServiceClient } from "@/lib/server-supabase";

export type AdminPendingCounts = {
  openInquiries: number;
  openSupport: number;
  openDisputes: number;
  openInspectionRequests: number;
  unreadDealBoard: number;
  paymentReportsPending: number;
  invoicesReviewPending: number;
  payoutsAwaiting: number;
  transferOverdue: number;
  pickupSchedulePending: number;
  /** 運営が「取引を完了」にする必要がある件数 */
  dealsClosurePending: number;
  /** 買い手振込報告済み・売り手入金確認待ち */
  buyerPaymentReportedPending: number;
  /** 商談フェーズの取引件数 */
  negotiationDeals: number;
  /** 商談タブ用（商談取引 + 要対応の open 問い合わせ） */
  adminNegotiationPending: number;
  /** 取引未作成の open 問い合わせ */
  orphanInquiries: number;
};

export async function fetchAdminPendingCounts(
  adminUserId?: string,
): Promise<AdminPendingCounts> {
  const supabase = createServiceClient();
  const [
    support,
    disputes,
    inspections,
    boardUnread,
    payments,
    invoices,
    payouts,
    overdue,
    pickupPending,
    payoutReady,
    payoutDone,
    buyerPaymentReported,
  ] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "reviewing"]),
    supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "reviewing"]),
    supabase
      .from("inspection_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "scheduled", "in_progress"]),
    adminUserId
      ? supabase.rpc("count_unread_deal_messages", { p_user_id: adminUserId })
      : Promise.resolve({ data: 0, error: null }),
    supabase
      .from("monthly_payment_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["reported", "unconfirmed"]),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("status", "review_pending"),
    supabase
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .in("status", ["awaiting", "ready"]),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("transfer_overdue", true)
      .neq("status", "completed"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "funded")
      .is("pickup_scheduled_at", null),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "payout_ready"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "payout_done"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "awaiting_payment")
      .not("buyer_payment_reported_at", "is", null),
  ]);

  const unreadBoard =
    typeof boardUnread.data === "number"
      ? boardUnread.data
      : Number(boardUnread.data ?? 0);

  const [openInquiries, negotiationDeals, adminNegotiationPending, orphanInquiries] =
    await Promise.all([
      countActionableOpenInquiries(supabase),
      countNegotiationPhaseDeals(supabase),
      countAdminNegotiationPending(supabase),
      countOrphanOpenInquiries(supabase),
    ]);

  return {
    openInquiries,
    negotiationDeals,
    adminNegotiationPending,
    orphanInquiries,
    openSupport: support.count ?? 0,
    openDisputes: disputes.count ?? 0,
    openInspectionRequests: inspections.count ?? 0,
    unreadDealBoard: boardUnread.error ? 0 : unreadBoard,
    paymentReportsPending: payments.count ?? 0,
    invoicesReviewPending: invoices.count ?? 0,
    payoutsAwaiting: payouts.count ?? 0,
    transferOverdue: overdue.count ?? 0,
    pickupSchedulePending: pickupPending.count ?? 0,
    dealsClosurePending: (payoutReady.count ?? 0) + (payoutDone.count ?? 0),
    buyerPaymentReportedPending: buyerPaymentReported.count ?? 0,
  };
};
