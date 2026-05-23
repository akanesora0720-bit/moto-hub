import { createClient } from "@/lib/supabase/server";
import type { DealerDashboardStats } from "@/lib/types";

export async function fetchDealerDashboardStats(
  dealerId: string,
): Promise<DealerDashboardStats | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_dealer_dashboard_stats", {
    p_dealer_id: dealerId,
  });
  if (error) throw error;
  return data as DealerDashboardStats;
}
