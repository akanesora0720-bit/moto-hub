import type { SupabaseClient } from "@supabase/supabase-js";
import type { DealStatus } from "@/lib/types";

const NEGOTIATION_DEAL_STATUSES: DealStatus[] = ["inquiry", "negotiating"];
const TERMINAL_DEAL_STATUSES: DealStatus[] = ["completed", "cancelled"];

/**
 * 商談バッジ用: まだ商談フェーズの open 問い合わせのみ。
 * 取引が合意以降に進んだあと open のまま残った問い合わせは数えない。
 */
export async function countActionableOpenInquiries(
  supabase: SupabaseClient,
  opts?: { listingIds?: string[] },
): Promise<number> {
  let inquiryQuery = supabase.from("inquiries").select("id").eq("status", "open");
  if (opts?.listingIds?.length) {
    inquiryQuery = inquiryQuery.in("listing_id", opts.listingIds);
  }
  const { data: openInquiries } = await inquiryQuery;
  if (!openInquiries?.length) return 0;

  const inquiryIds = openInquiries.map((i) => i.id);
  const { data: linkedDeals } = await supabase
    .from("deals")
    .select("inquiry_id, status")
    .in("inquiry_id", inquiryIds);

  const byInquiry = new Map<string, DealStatus[]>();
  for (const d of linkedDeals ?? []) {
    if (!d.inquiry_id) continue;
    const list = byInquiry.get(d.inquiry_id) ?? [];
    list.push(d.status as DealStatus);
    byInquiry.set(d.inquiry_id, list);
  }

  return openInquiries.filter((inq) => {
    const statuses = byInquiry.get(inq.id) ?? [];
    if (statuses.length === 0) return true;
    return statuses.some((s) => NEGOTIATION_DEAL_STATUSES.includes(s));
  }).length;
}

export async function countNegotiationPhaseDeals(
  supabase: SupabaseClient,
  opts?: { partyUserId?: string },
): Promise<number> {
  let q = supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .in("status", NEGOTIATION_DEAL_STATUSES);
  if (opts?.partyUserId) {
    q = q.or(`buyer_id.eq.${opts.partyUserId},seller_id.eq.${opts.partyUserId}`);
  }
  const { count } = await q;
  return count ?? 0;
}

/** open だがまだ取引が1件もない問い合わせ（新規リード） */
export async function countOrphanOpenInquiries(
  supabase: SupabaseClient,
  opts?: { listingIds?: string[] },
): Promise<number> {
  let inquiryQuery = supabase.from("inquiries").select("id").eq("status", "open");
  if (opts?.listingIds?.length) {
    inquiryQuery = inquiryQuery.in("listing_id", opts.listingIds);
  }
  const { data: openInquiries } = await inquiryQuery;
  if (!openInquiries?.length) return 0;

  const inquiryIds = openInquiries.map((i) => i.id);
  const { data: linkedDeals } = await supabase
    .from("deals")
    .select("inquiry_id")
    .in("inquiry_id", inquiryIds);

  const withDeal = new Set(
    (linkedDeals ?? []).map((d) => d.inquiry_id).filter((id): id is string => !!id),
  );
  return openInquiries.filter((inq) => !withDeal.has(inq.id)).length;
}

/** 運営: 商談タブバッジ = 商談フェーズの取引 + 取引未作成の open 問い合わせ */
export async function countAdminNegotiationPending(
  supabase: SupabaseClient,
): Promise<number> {
  const [deals, orphans] = await Promise.all([
    countNegotiationPhaseDeals(supabase),
    countOrphanOpenInquiries(supabase),
  ]);
  return deals + orphans;
}

export { TERMINAL_DEAL_STATUSES, NEGOTIATION_DEAL_STATUSES };
