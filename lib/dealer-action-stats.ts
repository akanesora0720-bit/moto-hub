import { countDealsNeedingDealerAttention } from "@/lib/dealer-deal-attention";
import {
  countNegotiationPhaseDeals,
  countOrphanOpenInquiries,
} from "@/lib/open-inquiry-count";
import { createClient } from "@/lib/supabase/server";
import type { DealStatus } from "@/lib/types";

export type DealerActionStats = {
  newInquiries: number;
  negotiating: number;
  awaitingPayment: number;
  handoverPending: number;
  /** 商談タブバッジ用（要対応の取引のみ） */
  dealsNeedingAttention: number;
  unreadNotifications: number;
  unreadDealBoard: number;
  openSupport: number;
  openDisputes: number;
};

/** 進行中取引（完了・取消以外） */
const ACTIVE_DEAL_STATUSES: DealStatus[] = [
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

/** まだ商談フェーズの取引のみ（合意・入金以降は含めない） */
const NEGOTIATION_PHASE_STATUSES: DealStatus[] = ["inquiry", "negotiating"];

export async function fetchDealerActionStats(userId: string): Promise<DealerActionStats> {
  const supabase = await createClient();

  const [listingsRes, dealsRes, notificationsRes, boardUnreadRes, supportRes, disputesRes] =
    await Promise.all([
      supabase.from("listings").select("id").eq("seller_id", userId),
      supabase
        .from("deals")
        .select(
          "id, status, buyer_id, seller_id, inquiry_id, listing_id, buyer_payment_reported_at, pickup_scheduled_at, buyer_confirmed_at, seller_confirmed_at",
        )
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
  const deals = dealsRes.data ?? [];

  const [newInquiries, negotiating] = await Promise.all([
    listingIds.length > 0
      ? countOrphanOpenInquiries(supabase, { listingIds })
      : Promise.resolve(0),
    countNegotiationPhaseDeals(supabase, { partyUserId: userId }),
  ]);

  const awaitingPayment = deals.filter(
    (d) => d.buyer_id === userId && d.status === "awaiting_payment",
  ).length;

  const handoverPending = deals.filter((d) => {
    const status = d.status as DealStatus;
    if (status === "transfer_pending") return true;
    if (d.seller_id === userId && status === "funded") return true;
    if (d.buyer_id === userId && status === "funded") return true;
    return false;
  }).length;

  const dealsNeedingAttention = countDealsNeedingDealerAttention(
    deals.map((d) => ({
      status: d.status as DealStatus,
      buyer_id: d.buyer_id,
      seller_id: d.seller_id,
      buyer_payment_reported_at: d.buyer_payment_reported_at ?? null,
      pickup_scheduled_at: d.pickup_scheduled_at ?? null,
      buyer_confirmed_at: d.buyer_confirmed_at ?? null,
      seller_confirmed_at: d.seller_confirmed_at ?? null,
    })),
    userId,
  );

  const boardUnread =
    boardUnreadRes.error || typeof boardUnreadRes.data !== "number"
      ? 0
      : dealsNeedingAttention > 0
        ? boardUnreadRes.data
        : 0;

  return {
    newInquiries,
    negotiating,
    awaitingPayment,
    handoverPending,
    dealsNeedingAttention,
    unreadNotifications: notificationsRes.count ?? 0,
    unreadDealBoard: boardUnread,
    openSupport: supportRes.count ?? 0,
    openDisputes: disputesRes.count ?? 0,
  };
}
