import { createClient } from "@/lib/supabase/server";
import type { TrustRank } from "@/lib/types";
import type { PenaltySource } from "@/lib/penalty";

export type PenaltyHistoryRow = {
  id: string;
  dealer_id: string;
  penalty_points: number;
  reason: string;
  penalty_source: PenaltySource;
  created_at: string;
  created_by: string | null;
};

export type YearlySnapshotRow = {
  year: number;
  final_score: number;
  final_badge: TrustRank;
  created_at: string;
};

export type BanHistoryRow = {
  id: string;
  reason: string;
  banned_at: string;
  lifted_at: string | null;
};

export async function fetchDealerCreditData(dealerId: string, isAdmin: boolean) {
  const supabase = await createClient();

  const [penalties, snapshots, bans] = await Promise.all([
    supabase
      .from("penalty_logs")
      .select("id, user_id, score_delta, reason, penalty_source, created_at, created_by")
      .eq("user_id", dealerId)
      .order("created_at", { ascending: false })
      .limit(isAdmin ? 100 : 50),
    supabase
      .from("dealer_yearly_snapshot")
      .select("year, final_score, final_badge, created_at")
      .eq("dealer_id", dealerId)
      .order("year", { ascending: true }),
    supabase
      .from("ban_history")
      .select("id, reason, banned_at, lifted_at")
      .eq("dealer_id", dealerId)
      .order("banned_at", { ascending: false })
      .limit(20),
  ]);

  return {
    penalties: (penalties.data ?? []).map((row) => ({
      id: row.id as string,
      dealer_id: row.user_id as string,
      penalty_points: Math.abs(row.score_delta as number),
      reason: row.reason as string,
      penalty_source: row.penalty_source as PenaltySource,
      created_at: row.created_at as string,
      created_by: row.created_by as string | null,
    })),
    snapshots: (snapshots.data ?? []) as YearlySnapshotRow[],
    bans: (bans.data ?? []) as BanHistoryRow[],
  };
}
