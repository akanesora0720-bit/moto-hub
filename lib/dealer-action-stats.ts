import { createClient } from "@/lib/supabase/server";

export type DealerActionStats = {
  newInquiries: number;
  negotiating: number;
  awaitingPayment: number;
  documentsPending: number;
  unreadNotifications: number;
  unreadDealBoard: number;
  openSupport: number;
  openDisputes: number;
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

  const [listingsRes, dealsRes, notificationsRes, boardUnreadRes, supportRes, disputesRes] =
    await Promise.all([
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
    supabase.rpc("count_unread_deal_messages", { p_user_id: userId }),
    supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["open", "reviewing", "answered"]),
    supabase
      .from("disputes")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", userId)
      .in("status", ["open", "reviewing"]),
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

  const boardUnread =
    typeof boardUnreadRes.data === "number"
      ? boardUnreadRes.data
      : Number(boardUnreadRes.data ?? 0);

  return {
    newInquiries,
    negotiating,
    awaitingPayment,
    documentsPending,
    unreadNotifications: notificationsRes.count ?? 0,
    unreadDealBoard: boardUnreadRes.error ? 0 : boardUnread,
    openSupport: supportRes.count ?? 0,
    openDisputes: disputesRes.count ?? 0,
  };
}
