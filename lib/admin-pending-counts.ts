import {
  countActionableOpenInquiries,
  countAdminNegotiationPending,
  countNegotiationPhaseDeals,
  countOrphanOpenInquiries,
} from "@/lib/open-inquiry-count";
import { filterActionableDealAlerts } from "@/lib/deal-alerts";
import { createServiceClient } from "@/lib/server-supabase";

export type AdminPendingCounts = {
  openInquiries: number;
  openSupport: number;
  openDisputes: number;
  openInspectionRequests: number;
  unreadDealBoard: number;
  unreadNotifications: number;
  paymentReportsPending: number;
  invoicesReviewPending: number;
  payoutsAwaiting: number;
  transferOverdue: number;
  pickupSchedulePending: number;
  dealsClosurePending: number;
  buyerPaymentReportedPending: number;
  unresolvedDealAlerts: number;
  /** 引渡〜名変〜完了確認フェーズの取引 */
  handoverPhasePending: number;
  negotiationDeals: number;
  adminNegotiationPending: number;
  orphanInquiries: number;
  /** サイドバー「管理センター」用の合計 */
  adminHubPending: number;
  /** サイドバー「商談・取引」タブ */
  adminWorkspacePending: number;
  /** サイドバー「取引連絡」 */
  adminDealsPending: number;
};

function sum(...values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

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
    openAlertsResult,
    dealsForAlertsResult,
    handoverPhase,
    unreadNotif,
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
    supabase
      .from("deal_alerts")
      .select("id, alert_type, deal_id")
      .eq("resolved", false)
      .limit(500),
    supabase
      .from("deals")
      .select("id, status, seller_payment_confirmed_at, funded_at, transfer_completed_at, requires_name_transfer, transfer_overdue, transfer_deadline_at")
      .limit(2000),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .in("status", ["handover_done", "transfer_pending"]),
    adminUserId
      ? supabase
          .from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", adminUserId)
          .is("read_at", null)
      : Promise.resolve({ count: 0, error: null }),
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

  const dealsClosurePending = (payoutReady.count ?? 0) + (payoutDone.count ?? 0);
  const buyerPaymentReportedPending = buyerPaymentReported.count ?? 0;
  const unresolvedDealAlerts = filterActionableDealAlerts(
    openAlertsResult.data ?? [],
    dealsForAlertsResult.data ?? [],
  ).length;
  const handoverPhasePending = handoverPhase.count ?? 0;
  const unreadNotifications = unreadNotif.count ?? 0;

  const adminWorkspacePending = sum(
    adminNegotiationPending,
    buyerPaymentReportedPending,
    dealsClosurePending,
    unresolvedDealAlerts,
    handoverPhasePending,
    pickupPending.count ?? 0,
    overdue.count ?? 0,
  );

  const adminDealsPending = sum(
    unreadBoard,
    buyerPaymentReportedPending,
    dealsClosurePending,
    unresolvedDealAlerts,
    handoverPhasePending,
  );

  const adminHubPending = sum(
    adminWorkspacePending,
    unreadNotifications,
    support.count ?? 0,
    disputes.count ?? 0,
    inspections.count ?? 0,
    invoices.count ?? 0,
    payments.count ?? 0,
  );

  return {
    openInquiries,
    negotiationDeals,
    adminNegotiationPending,
    orphanInquiries,
    openSupport: support.count ?? 0,
    openDisputes: disputes.count ?? 0,
    openInspectionRequests: inspections.count ?? 0,
    unreadDealBoard: boardUnread.error ? 0 : unreadBoard,
    unreadNotifications,
    paymentReportsPending: payments.count ?? 0,
    invoicesReviewPending: invoices.count ?? 0,
    payoutsAwaiting: payouts.count ?? 0,
    transferOverdue: overdue.count ?? 0,
    pickupSchedulePending: pickupPending.count ?? 0,
    dealsClosurePending,
    buyerPaymentReportedPending,
    unresolvedDealAlerts,
    handoverPhasePending,
    adminHubPending,
    adminWorkspacePending,
    adminDealsPending,
  };
};
