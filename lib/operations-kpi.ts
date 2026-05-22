import { createServiceClient } from "@/lib/server-supabase";

export type AdminKpiSnapshot = {
  listingsThisMonth: number;
  dealsCompletedThisMonth: number;
  dealsFundedThisMonth: number;
  transferOverdueOpen: number;
  complaintsOpen: number;
  dealersYellow: number;
  dealersRed: number;
  dealersBanned: number;
  monthlyListings: { month: string; count: number }[];
  monthlyDeals: { month: string; count: number }[];
  openRiskFlags: number;
};

export async function fetchAdminKpi(): Promise<AdminKpiSnapshot> {
  const supabase = createServiceClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthIso = monthStart.toISOString();

  const [
    listingsMonth,
    completedMonth,
    fundedMonth,
    overdue,
    complaintsPending,
    yellow,
    red,
    banned,
    riskOpen,
    listingsAll,
    dealsAll,
  ] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthIso),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", monthIso),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "funded")
      .gte("funded_at", monthIso),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "transfer_pending")
      .eq("transfer_overdue", true),
    supabase
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("member_type", "dealer")
      .eq("trust_rank", "YELLOW"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("member_type", "dealer")
      .eq("trust_rank", "RED"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_banned", true),
    supabase
      .from("risk_flags")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false),
    supabase
      .from("listings")
      .select("created_at")
      .gte("created_at", monthsAgo(6)),
    supabase
      .from("deals")
      .select("created_at, status")
      .gte("created_at", monthsAgo(6)),
  ]);

  return {
    listingsThisMonth: listingsMonth.count ?? 0,
    dealsCompletedThisMonth: completedMonth.count ?? 0,
    dealsFundedThisMonth: fundedMonth.count ?? 0,
    transferOverdueOpen: overdue.count ?? 0,
    complaintsOpen: complaintsPending.count ?? 0,
    dealersYellow: yellow.count ?? 0,
    dealersRed: red.count ?? 0,
    dealersBanned: banned.count ?? 0,
    openRiskFlags: riskOpen.count ?? 0,
    monthlyListings: bucketByMonth(
      (listingsAll.data ?? []).map((r) => r.created_at as string),
    ),
    monthlyDeals: bucketByMonth(
      (dealsAll.data ?? [])
        .filter((r) => r.status === "completed")
        .map((r) => r.created_at as string),
    ),
  };
}

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
}

function bucketByMonth(dates: string[]): { month: string; count: number }[] {
  const map = new Map<string, number>();
  for (const iso of dates) {
    const m = iso.slice(0, 7);
    map.set(m, (map.get(m) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }));
}
