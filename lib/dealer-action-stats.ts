import { createClient } from "@/lib/supabase/server";

export type DealerActionStats = {
  newInquiries: number;
  negotiating: number;
  awaitingPayment: number;
  documentsPending: number;
  unreadNotifications: number;
};

const ACTIVE_DEAL_STATUSES = [
  "inquiry",
  "negotiating",
  "agreed",
  "awaiting_payment",
  "funded",
  "handover_done",
  "transfer_pending",
  "payout_ready",
  "payout_done",
  "dispute",
];

export async function fetchDealerActionStats(userId: string): Promise<DealerActionStats> {
  const supabase = await createClient();

  const [listingsRes, dealsRes, notificationsRes] = await Promise.all([
    supabase.from("listings").select("id").eq("seller_id", userId),
    supabase
      .from("deals")
      .select("id, status, buyer_id, seller_id")
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .in("status", ACTIVE_DEAL_STATUSES),
    supabase
      .from("user_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);

  const listingIds = (listingsRes.data ?? []).map((l) => l.id);

  let newInquiries = 0;
  if (listingIds.length > 0) {
    const { count } = await supabase
      .from("inquiries")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .in("listing_id", listingIds);
    newInquiries = count ?? 0;
  }

  const deals = dealsRes.data ?? [];
  const negotiating = deals.length;
  const awaitingPayment = deals.filter(
    (d) => d.buyer_id === userId && d.status === "awaiting_payment",
  ).length;
  const documentsPending = deals.filter(
    (d) =>
      d.status === "transfer_pending" ||
      (d.seller_id === userId && d.status === "funded"),
  ).length;

  return {
    newInquiries,
    negotiating,
    awaitingPayment,
    documentsPending,
    unreadNotifications: notificationsRes.count ?? 0,
  };
}
