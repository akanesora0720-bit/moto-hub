"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminCreditSubNav } from "@/components/admin/AdminCreditSubNav";
import { AppShell } from "@/components/AppShell";
import { TrustBadge } from "@/components/TrustBadge";
import {
  BAN_REASON_PRESETS,
  formatPenaltyCategory,
  PENALTY_CATEGORIES,
  TRUST_RANK_BANDS,
  type PenaltyCategory,
} from "@/lib/credit";
import {
  AUTO_PENALTY_RULES,
  formatPenaltyApplier,
  formatPenaltySource,
  MANUAL_PENALTY_EXAMPLES,
  type PenaltySource,
} from "@/lib/penalty";
import { createClient } from "@/lib/supabase/client";
import type { TrustRank } from "@/lib/types";

type DealerRow = {
  id: string;
  email: string;
  store_name: string | null;
  trust_score: number;
  trust_rank: TrustRank;
  is_active: boolean;
  is_banned: boolean;
  ban_reason: string | null;
  yearly_reset_at: string | null;
};

type PenaltyLogRow = {
  id: string;
  score_delta: number;
  reason: string;
  penalty_source: PenaltySource;
  created_at: string;
  deal_id: string | null;
  created_by: string | null;
  reversed_at: string | null;
  reversal_note: string | null;
  profiles: { store_name: string | null; email: string | null } | null;
};

type SnapshotRow = {
  year: number;
  final_score: number;
  final_badge: TrustRank;
};

type AdminActionRow = {
  id: string;
  action_type: string;
  note: string | null;
  created_at: string;
  payload: Record<string, unknown>;
};

type AuditRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  payload: Record<string, unknown>;
};

export function AdminCreditPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "adjust" || tab === "penalties") {
      router.replace("/admin/credit/adjust");
    }
  }, [router, searchParams]);

  const [dealers, setDealers] = useState<DealerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [penaltyLogs, setPenaltyLogs] = useState<PenaltyLogRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [adminActions, setAdminActions] = useState<AdminActionRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [message, setMessage] = useState("");

  const [penaltyCategory, setPenaltyCategory] = useState<PenaltyCategory>("minor");
  const [penaltyPoints, setPenaltyPoints] = useState(5);
  const [penaltyReason, setPenaltyReason] = useState("");
  const [banReason, setBanReason] = useState<string>(BAN_REASON_PRESETS[0]);
  const [loading, setLoading] = useState(false);

  const selected = dealers.find((d) => d.id === selectedId) ?? null;

  const loadDealers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, email, store_name, trust_score, trust_rank, is_active, is_banned, ban_reason, yearly_reset_at",
      )
      .eq("member_type", "dealer")
      .order("store_name", { ascending: true });
    setDealers((data ?? []) as DealerRow[]);
  }, []);

  const loadDealerDetail = useCallback(async (dealerId: string) => {
    const supabase = createClient();
    const [ph, snap, acts] = await Promise.all([
      supabase
        .from("penalty_logs")
        .select(
          "id, score_delta, reason, penalty_source, created_at, deal_id, created_by, reversed_at, reversal_note, profiles:created_by(store_name, email)",
        )
        .eq("user_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("dealer_yearly_snapshot")
        .select("year, final_score, final_badge")
        .eq("dealer_id", dealerId)
        .order("year", { ascending: false }),
      supabase
        .from("admin_actions")
        .select("id, action_type, note, created_at, payload")
        .eq("target_dealer_id", dealerId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setPenaltyLogs(
      (ph.data ?? []).map((row) => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        return {
          id: row.id as string,
          score_delta: row.score_delta as number,
          reason: row.reason as string,
          penalty_source: row.penalty_source as PenaltySource,
          created_at: row.created_at as string,
          deal_id: row.deal_id as string | null,
          created_by: row.created_by as string | null,
          reversed_at: (row.reversed_at as string | null) ?? null,
          reversal_note: (row.reversal_note as string | null) ?? null,
          profiles: profile as PenaltyLogRow["profiles"],
        };
      }),
    );
    setSnapshots((snap.data ?? []) as SnapshotRow[]);
    setAdminActions((acts.data ?? []) as AdminActionRow[]);
  }, []);

  const loadAudit = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("audit_logs")
      .select("id, action, entity_type, created_at, payload")
      .order("created_at", { ascending: false })
      .limit(40);
    setAuditLogs((data ?? []) as AuditRow[]);
  }, []);

  useEffect(() => {
    loadDealers();
    loadAudit();
  }, [loadDealers, loadAudit]);

  useEffect(() => {
    if (selectedId) loadDealerDetail(selectedId);
  }, [selectedId, loadDealerDetail]);

  useEffect(() => {
    const preset = PENALTY_CATEGORIES.find((c) => c.value === penaltyCategory);
    if (preset) setPenaltyPoints(preset.defaultPoints);
  }, [penaltyCategory]);

  const applyPenalty = async () => {
    if (!selectedId || !penaltyReason.trim()) {
      setMessage("加盟店と減点理由を入力してください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_apply_penalty", {
      p_dealer_id: selectedId,
      p_points: penaltyPoints,
      p_reason: penaltyReason.trim(),
      p_category: penaltyCategory,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`減点を記録しました（−${penaltyPoints}点）。`);
    setPenaltyReason("");
    loadDealers();
    loadDealerDetail(selectedId);
    loadAudit();
  };

  const banDealer = async () => {
    if (!selectedId || !banReason.trim()) return;
    if (!window.confirm(`BAN（即時停止）: ${banReason}\n続行しますか？`)) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_ban_dealer", {
      p_dealer_id: selectedId,
      p_reason: banReason.trim(),
    });
    setLoading(false);
    setMessage(error ? error.message : "BANを適用し、アカウントを停止しました。");
    loadDealers();
    loadDealerDetail(selectedId);
    loadAudit();
  };

  const unbanDealer = async () => {
    if (!selectedId) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_unban_dealer", {
      p_dealer_id: selectedId,
      p_note: "管理画面から解除",
    });
    setLoading(false);
    setMessage(error ? error.message : "BANを解除し、会員を再開しました。");
    loadDealers();
    loadDealerDetail(selectedId);
    loadAudit();
  };

  const runYearEnd = async () => {
    if (
      !window.confirm(
        "年末締め: 全加盟店の現在点数でバッジ確定→スナップショット保存→全員100点リセット。\n続行しますか？",
      )
    ) {
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("apply_trust_year_end");
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const r = data as { year?: number; members_reset?: number };
    setMessage(`年末締め完了（${r.year}年度）: ${r.members_reset ?? 0}名`);
    loadDealers();
    loadAudit();
  };

  const restorePenalty = async (penaltyLogId: string) => {
    const note = window.prompt("取り消し理由（メモ）", "運営判断により減点を取り消し");
    if (note === null) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_restore_penalty", {
      p_penalty_log_id: penaltyLogId,
      p_note: note.trim() || null,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("減点を取り消し、信用スコアを復元しました。");
    if (selectedId) loadDealerDetail(selectedId);
    loadDealers();
  };

  return (
    <AppShell isAdmin>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <AdminCreditSubNav active="dealers" />
          <button
            type="button"
            disabled={loading}
            onClick={runYearEnd}
            className="shrink-0 rounded-lg border border-amber-400/50 px-3 py-2 text-sm text-amber-100 hover:bg-amber-400/10 disabled:opacity-50"
          >
            年末締め（100点リセット）
          </button>
        </div>

        {message ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{message}</p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card">
            <p className="border-b border-border px-4 py-3 text-xs font-medium text-muted">
              加盟店一覧
            </p>
            <ul>
              {dealers.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full px-4 py-3 text-left text-sm transition hover:bg-zinc-900/80 ${
                      selectedId === d.id ? "bg-zinc-900" : ""
                    }`}
                  >
                    <p className="font-medium line-clamp-1">{d.store_name ?? d.email}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <TrustBadge rank={d.trust_rank} score={d.trust_score} compact />
                      {d.is_banned ? (
                        <span className="text-[10px] text-rose-400">BAN</span>
                      ) : !d.is_active ? (
                        <span className="text-[10px] text-muted">停止</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <div className="space-y-6">
            {selected ? (
              <>
                <div className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold">{selected.store_name ?? selected.email}</h2>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <TrustBadge rank={selected.trust_rank} score={selected.trust_score} />
                    {selected.is_banned ? (
                      <span className="rounded border border-rose-500/50 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
                        BAN: {selected.ban_reason}
                      </span>
                    ) : null}
                  </div>
                </div>

                <section className="rounded-xl border border-dashed border-border bg-card/50 p-5 text-sm">
                  <h3 className="font-semibold">信用バンド（現行）</h3>
                  <ul className="mt-2 space-y-1 text-muted">
                    {(Object.keys(TRUST_RANK_BANDS) as TrustRank[]).map((rank) => (
                      <li key={rank}>
                        {TRUST_RANK_BANDS[rank].label}: {TRUST_RANK_BANDS[rank].min}–
                        {TRUST_RANK_BANDS[rank].max}点 — {TRUST_RANK_BANDS[rank].description}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-sky-200">自動減点（厳格）</p>
                      <ul className="mt-1 list-inside list-disc text-xs text-muted">
                        {AUTO_PENALTY_RULES.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-200">手動減点（運営裁量）</p>
                      <p className="mt-1 text-xs text-muted">
                        {MANUAL_PENALTY_EXAMPLES.join("、")} など。点数は事案ごとに判断。
                      </p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold">手動減点（運営裁量）</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="text-muted">区分</span>
                      <select
                        value={penaltyCategory}
                        onChange={(e) => setPenaltyCategory(e.target.value as PenaltyCategory)}
                        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                      >
                        {PENALTY_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}（目安 −{c.defaultPoints}）
                          </option>
                        ))}
                      </select>
                    </label>
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
                  </div>
                  <label className="mt-3 block text-sm">
                    <span className="text-muted">理由（必須・加盟店に公開）</span>
                    <textarea
                      value={penaltyReason}
                      onChange={(e) => setPenaltyReason(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                      placeholder="具体的な事実・日付・取引IDなど"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={applyPenalty}
                    className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                  >
                    減点を記録
                  </button>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold">即時停止（BAN）</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    詐欺・なりすまし・犯罪・脅迫・反社・支払逃れなど
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BAN_REASON_PRESETS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setBanReason(r)}
                        className={`rounded-lg border px-3 py-1.5 text-xs ${
                          banReason === r
                            ? "border-rose-400/60 bg-rose-500/15 text-rose-100"
                            : "border-border text-muted"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.is_banned ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={unbanDealer}
                        className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-zinc-900"
                      >
                        BAN解除・再開
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={banDealer}
                        className="rounded-lg border border-rose-500/50 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/10"
                      >
                        BAN（即時停止）
                      </button>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold">減点履歴</h3>
                  <div className="mt-3 max-h-72 overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-muted">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-2">種別</th>
                          <th className="py-2 pr-2">点数</th>
                          <th className="py-2 pr-2">理由</th>
                          <th className="py-2 pr-2">適用日時</th>
                          <th className="py-2 pr-2">適用者</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {penaltyLogs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-4 text-muted">
                              履歴なし
                            </td>
                          </tr>
                        ) : (
                          penaltyLogs.map((p) => {
                            const applierLabel = p.profiles
                              ? p.profiles.store_name ?? p.profiles.email
                              : null;
                            return (
                              <tr key={p.id} className="border-b border-border/60 align-top">
                                <td className="py-2 pr-2 whitespace-nowrap">
                                  <span
                                    className={
                                      p.penalty_source === "auto_penalty"
                                        ? "text-sky-300"
                                        : "text-amber-200"
                                    }
                                  >
                                    {formatPenaltySource(p.penalty_source)}
                                  </span>
                                </td>
                                <td className="py-2 pr-2 font-mono text-rose-300 whitespace-nowrap">
                                  {p.score_delta}
                                </td>
                                <td className="py-2 pr-2 max-w-xs">
                                  {p.reason}
                                  {p.deal_id ? (
                                    <span className="mt-0.5 block font-mono text-[10px] text-zinc-500">
                                      deal: {p.deal_id.slice(0, 8)}…
                                    </span>
                                  ) : null}
                                </td>
                                <td className="py-2 pr-2 whitespace-nowrap text-zinc-500">
                                  {new Date(p.created_at).toLocaleString("ja-JP")}
                                </td>
                                <td className="py-2 whitespace-nowrap text-zinc-400">
                                  {formatPenaltyApplier(p.penalty_source, applierLabel)}
                                </td>
                                <td className="py-2 whitespace-nowrap">
                                  {p.reversed_at ? (
                                    <span className="text-emerald-300 text-[10px]">取り消し済</span>
                                  ) : p.score_delta < 0 ? (
                                    <button
                                      type="button"
                                      disabled={loading}
                                      onClick={() => restorePenalty(p.id)}
                                      className="text-[10px] text-accent hover:underline"
                                    >
                                      事後取り消し
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold">年次スナップショット</h3>
                  <ul className="mt-3 space-y-1 text-sm">
                    {snapshots.length === 0 ? (
                      <li className="text-muted">未記録</li>
                    ) : (
                      snapshots.map((s) => (
                        <li key={s.year}>
                          {s.year}年: {s.final_score}点 / {s.final_badge}
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              </>
            ) : (
              <p className="text-sm text-muted">左から加盟店を選択してください。</p>
            )}
          </div>
        </div>

        <section className="rounded-xl border border-border bg-card p-5">
          <h3 className="font-semibold">監査ログ（直近）</h3>
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto font-mono text-xs text-zinc-400">
            {auditLogs.map((a) => (
              <li key={a.id}>
                {new Date(a.created_at).toLocaleString("ja-JP")} {a.action} [{a.entity_type}]
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
