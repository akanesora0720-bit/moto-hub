"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TrustBadge } from "@/components/TrustBadge";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import {
  DISPUTE_STATUS_LABELS,
  disputeCategoryLabel,
  disputePenaltyForCategory,
} from "@/lib/disputes";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus, DisputeCategory, TrustRank } from "@/lib/types";

type DisputeRow = {
  id: string;
  deal_id: string;
  category: DisputeCategory;
  message: string;
  status: string;
  resolution: string | null;
  penalty_points: number | null;
  created_at: string;
  reporter: { store_name: string | null; email: string | null } | null;
  target: {
    store_name: string | null;
    email: string | null;
    trust_score: number;
    trust_rank: TrustRank;
  } | null;
  deal: {
    status: DealStatus;
    listings: { maker: string; model: string } | { maker: string; model: string }[] | null;
  } | null;
};

type MemberRow = {
  id: string;
  email: string;
  store_name: string | null;
  trust_score: number;
  trust_rank: TrustRank;
};

type DisputeQueryRow = Omit<DisputeRow, "reporter" | "target" | "deal"> & {
  reporter:
    | { store_name: string | null; email: string | null }
    | { store_name: string | null; email: string | null }[]
    | null;
  target:
    | {
        store_name: string | null;
        email: string | null;
        trust_score: number;
        trust_rank: TrustRank;
      }
    | {
        store_name: string | null;
        email: string | null;
        trust_score: number;
        trust_rank: TrustRank;
      }[]
    | null;
  deal:
    | {
        status: DealStatus;
        listings:
          | { maker: string; model: string }
          | { maker: string; model: string }[]
          | null;
      }
    | {
        status: DealStatus;
        listings:
          | { maker: string; model: string }
          | { maker: string; model: string }[]
          | null;
      }[]
    | null;
};

function one<T>(row: T | T[] | null | undefined): T | null {
  if (!row) return null;
  return Array.isArray(row) ? (row[0] ?? null) : row;
}

function normalizeDisputeRow(row: DisputeQueryRow): DisputeRow {
  const deal = one(row.deal);
  return {
    ...row,
    reporter: one(row.reporter),
    target: one(row.target),
    deal: deal
      ? {
          status: deal.status,
          listings: one(deal.listings),
        }
      : null,
  };
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [selected, setSelected] = useState<DisputeRow | null>(null);
  const [penaltyPoints, setPenaltyPoints] = useState(10);
  const [resolution, setResolution] = useState("");
  const [dealStatus, setDealStatus] = useState<DealStatus>("transfer_pending");
  const [forceDealId, setForceDealId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [d, m] = await Promise.all([
      supabase
        .from("disputes")
        .select(
          `
          id, deal_id, category, message, status, resolution, penalty_points, created_at,
          reporter:profiles!disputes_reporter_id_fkey ( store_name, email ),
          target:profiles!disputes_target_user_id_fkey ( store_name, email, trust_score, trust_rank ),
          deal:deals ( status, listings ( maker, model ) )
        `,
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("profiles")
        .select("id, email, store_name, trust_score, trust_rank")
        .eq("member_type", "dealer")
        .order("store_name"),
    ]);
    setDisputes(((d.data ?? []) as DisputeQueryRow[]).map(normalizeDisputeRow));
    setMembers((m.data ?? []) as MemberRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setPenaltyPoints(disputePenaltyForCategory(selected.category));
      setResolution("");
    }
  }, [selected]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 20);
    return members
      .filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          (m.store_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [members, memberQuery]);

  const setReviewing = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_dispute_status", {
      p_dispute_id: id,
      p_status: "reviewing",
    });
    setMessage(error ? error.message : "審査中に更新しました。");
    load();
  };

  const resolveWithPenalty = async () => {
    if (!selected) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_resolve_dispute_with_penalty", {
      p_dispute_id: selected.id,
      p_penalty_points: penaltyPoints,
      p_resolution: resolution.trim() || "運営判断により減点",
    });
    setMessage(error ? error.message : "解決・減点を記録しました。");
    setSelected(null);
    load();
  };

  const rejectDispute = async () => {
    if (!selected) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_reject_dispute", {
      p_dispute_id: selected.id,
      p_resolution: resolution.trim() || "事実確認の結果却下",
    });
    setMessage(error ? error.message : "却下しました。");
    setSelected(null);
    load();
  };

  const forceDealStatus = async () => {
    if (!forceDealId.trim()) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_advance_deal", {
      p_deal_id: forceDealId.trim(),
      p_status: dealStatus,
    });
    setMessage(error ? error.message : "取引ステータスを変更しました。");
  };

  const manualPenalty = async (dealerId: string) => {
    const pts = Number(prompt("減点（1-100）", "10"));
    const reason = prompt("理由");
    if (!reason?.trim() || !pts || pts <= 0) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_apply_penalty", {
      p_dealer_id: dealerId,
      p_points: pts,
      p_reason: reason.trim(),
      p_category: pts >= 30 ? "severe" : pts >= 10 ? "moderate" : "minor",
    });
    setMessage(error ? error.message : "減点しました。");
    load();
  };

  const openDisputes = disputes.filter(
    (d) => d.status === "open" || d.status === "reviewing",
  ).length;

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Dispute 管理</h1>
            <p className="mt-1 text-sm text-muted">
              未処理 {openDisputes}件 · 書類・虚偽・瑕疵・不正のみ審査
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/admin" className="text-accent hover:underline">
              管理画面
            </Link>
            <Link href="/admin/dashboard" className="text-accent hover:underline">
              KPI
            </Link>
          </div>
        </div>

        {message ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="font-medium">申告一覧</h2>
            {disputes.length === 0 ? (
              <p className="text-sm text-muted">申告はありません。</p>
            ) : (
              disputes.map((row) => {
                const listing = row.deal?.listings;
                const li = Array.isArray(listing) ? listing[0] : listing;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelected(row)}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm ${
                      selected?.id === row.id
                        ? "border-accent/50 bg-accent/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <p className="font-medium">
                      {disputeCategoryLabel(row.category)} ·{" "}
                      {DISPUTE_STATUS_LABELS[row.status] ?? row.status}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {li ? `${li.maker} ${li.model}` : row.deal_id.slice(0, 8)} ·{" "}
                      {new Date(row.created_at).toLocaleString("ja-JP")}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs">{row.message}</p>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-zinc-950/40 p-4">
            <h2 className="font-medium">審査</h2>
            {!selected ? (
              <p className="text-sm text-muted">左から申告を選択</p>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm">{selected.message}</p>
                <p className="text-xs text-muted">
                  申告: {selected.reporter?.store_name ?? selected.reporter?.email} → 対象:{" "}
                  {selected.target?.store_name ?? selected.target?.email}
                  {selected.target ? (
                    <span className="ml-2 inline-flex align-middle">
                      <TrustBadge
                        rank={selected.target.trust_rank}
                        score={selected.target.trust_score}
                        compact
                      />
                    </span>
                  ) : null}
                </p>
                {selected.deal?.status ? (
                  <p className="text-xs text-muted">
                    取引: {DEAL_STATUS_LABELS[selected.deal.status]}
                  </p>
                ) : null}
                {selected.status === "open" ? (
                  <button
                    type="button"
                    onClick={() => setReviewing(selected.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs"
                  >
                    審査中へ
                  </button>
                ) : null}
                {selected.status !== "resolved" && selected.status !== "rejected" ? (
                  <>
                    <label className="block text-sm">
                      <span className="text-muted">減点</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={penaltyPoints}
                        onChange={(e) => setPenaltyPoints(Number(e.target.value))}
                        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-muted">決定メモ</span>
                      <textarea
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        rows={3}
                        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={resolveWithPenalty}
                        className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-black"
                      >
                        解決＋減点
                      </button>
                      <button
                        type="button"
                        onClick={rejectDispute}
                        className="rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        却下
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    {selected.resolution ?? "処理済み"}
                    {selected.penalty_points ? ` (-${selected.penalty_points}点)` : ""}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">会員検索・減点</h2>
          <input
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="店舗名・メール"
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          />
          <ul className="space-y-2">
            {filteredMembers.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {m.store_name ?? "—"} · {m.email}
                  <TrustBadge rank={m.trust_rank} score={m.trust_score} compact />
                </span>
                <button
                  type="button"
                  onClick={() => manualPenalty(m.id)}
                  className="text-xs text-accent hover:underline"
                >
                  減点
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">取引ステータス強制変更</h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={forceDealId}
              onChange={(e) => setForceDealId(e.target.value)}
              placeholder="取引 UUID"
              className="min-w-[200px] flex-1 rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm font-mono"
            />
            <select
              value={dealStatus}
              onChange={(e) => setDealStatus(e.target.value as DealStatus)}
              className="rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
            >
              {Object.entries(DEAL_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={forceDealStatus}
              className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent"
            >
              適用
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
