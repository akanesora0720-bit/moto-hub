import { createClient } from "@/lib/supabase/server";
import type { MemberStats } from "@/lib/types";

export async function fetchMemberStats(profileId: string): Promise<MemberStats> {
  const supabase = await createClient();

  const [deals, listings] = await Promise.all([
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", profileId)
      .eq("status", "completed"),
    supabase
      .from("listings")
      .select("inspection_status")
      .eq("seller_id", profileId)
      .neq("status", "removed"),
  ]);

  const rows = listings.data ?? [];
  const inspected = rows.filter((r) => r.inspection_status).length;

  return {
    completed_deals: deals.count ?? 0,
    total_listings: rows.length,
    inspected_listings: inspected,
  };
}
