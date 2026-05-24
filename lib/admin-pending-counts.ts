import { createServiceClient } from "@/lib/server-supabase";

export type AdminPendingCounts = {
  openInquiries: number;
  openSupport: number;
  openDisputes: number;
  paymentReportsPending: number;
  invoicesReviewPending: number;
  payoutsAwaiting: number;
  transferOverdue: number;
};

export async function fetchAdminPendingCounts(): Promise<AdminPendingCounts> {
  const supabase = createServiceClient();
  const [
    inquiries,
    support,
    disputes,
    payments,
    invoices,
    payouts,
    overdue,
  ] = await Promise.all([
    supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "reviewing"]),
    supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "reviewing"]),
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
  ]);

  return {
    openInquiries: inquiries.count ?? 0,
    openSupport: support.count ?? 0,
    openDisputes: disputes.count ?? 0,
    paymentReportsPending: payments.count ?? 0,
    invoicesReviewPending: invoices.count ?? 0,
    payoutsAwaiting: payouts.count ?? 0,
    transferOverdue: overdue.count ?? 0,
  };
}
