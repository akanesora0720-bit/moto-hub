import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketStats = {
  listings: number;
  parts: number;
};

export async function fetchMarketStats(supabase: SupabaseClient): Promise<MarketStats> {
  const [listingsRes, partsRes] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("part_listings")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "negotiating"]),
  ]);

  return {
    listings: listingsRes.count ?? 0,
    parts: partsRes.count ?? 0,
  };
}
