"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TrustBadge } from "@/components/TrustBadge";
import { formatPenaltySource } from "@/lib/penalty";
import { ADMIN_DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus, TrustRank } from "@/lib/types";

type PenaltyRow = {
  id: string;
  user_id: string;
  score_delta: number;
  reason: string;
  penalty_source: string;
  created_at: string;
  deal_id: string | null;
  reversed_at: string | null;
  profiles: {
    store_name: string | null;
    email: string | null;
    trust_score: number;
    trust_rank: TrustRank;
  } | null;
  deals: {
    id: string;
    status: DealStatus;
    listings: { maker: string; model: string } | null;
  } | null;
};

export function AdminPenaltyAdjustPanel() {
  const [rows, setRows] = useState<PenaltyRow[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("penalty_logs")
      .select(
        `id, user_id, score_delta, reason, penalty_source, created_at, deal_id, reversed_at,
         profiles:user_id ( store_name, email, trust_score, trust_rank ),
         deals:deal_id ( id, status, listings ( maker, model ) )`,
      )
      .lt("score_delta", 0)
      .is("reversed_at", null)
      .not("deal_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) {
      setMessage(error.message);
      return;
    }

    const mapped = (data ?? []).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const dealRaw = Array.isArray(row.deals) ? row.deals[0] : row.deals;
      const listing = dealRaw?.listings
        ? Array.isArray(dealRaw.listings)
          ? dealRaw.listings[0]
          : dealRaw.listings
        : null;
      return {
        ...row,
        profiles: profile ?? null,
        deals: dealRaw
          ? {
              id: dealRaw.id,
              status: dealRaw.status as DealStatus,
              listings: listing as { maker: string; model: string } | null,
            }
          : null,
      } as PenaltyRow;
    });

    setRows(
      mapped.filter(
        (r) =>
          r.deals &&
          r.deals.status !== "completed" &&
          r.deals.status !== "cancelled",
      ),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (row: PenaltyRow) => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_restore_penalty", {
      p_penalty_log_id: row.id,
      p_note: null,
    });
    setLoading(false);
    setConfirmId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("減点を取り消し、信用スコアを戻しました。");
    load();
  };

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
        <strong className="text-foreground">基本は何もしません。</strong>
        自動減点のまま問題ありません。誠実な対応がはっきり分かる行だけ「戻す」を押してください。
      </p>

      {message ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted">
          進行中取引で調整できる自動減点はありません。
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const deal = row.deals;
            const listing = deal?.listings;
            const title = listing
              ? `${listing.maker} ${listing.model}`
              : deal?.id.slice(0, 8) ?? "—";

            return (
              <li
                key={row.id}
                className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    {deal ? (
                      <Link
                        href={`/admin/deals/${deal.id}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span className="font-medium">{title}</span>
                    )}
                    <p className="text-muted">
                      {row.profiles?.store_name ?? "—"} ·{" "}
                      <span className="font-mono text-rose-300">{row.score_delta}点</span> ·{" "}
                      {formatPenaltySource(row.penalty_source)}
                      {deal ? (
                        <> · {ADMIN_DEAL_STATUS_LABELS[deal.status] ?? deal.status}</>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted line-clamp-2">{row.reason}</p>
                  </div>
                  {row.profiles ? (
                    <TrustBadge
                      rank={row.profiles.trust_rank}
                      score={row.profiles.trust_score}
                      compact
                    />
                  ) : null}
                </div>

                {confirmId === row.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <span className="text-xs text-muted">この減点を戻しますか？</span>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => restore(row)}
                      className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-emerald-50 hover:bg-emerald-700"
                    >
                      戻す
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setConfirmId(null)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
                    >
                      やめる
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setConfirmId(row.id)}
                    className="mt-3 text-xs text-accent hover:underline"
                  >
                    減点を戻す
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
