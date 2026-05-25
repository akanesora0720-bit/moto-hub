"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TrustBadge } from "@/components/TrustBadge";
import { SUPPORT_STATUS_LABELS, supportCategoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/client";
import type { SupportTicket, SupportTicketStatus } from "@/lib/types";

type TicketRow = SupportTicket & {
  user: { store_name: string | null; email: string; contact_name: string | null } | null;
};

type MemberRow = {
  id: string;
  email: string;
  store_name: string | null;
  contact_name: string | null;
  trust_rank: string;
  trust_score: number;
};

export default function AdminSupportPage() {
  const [filter, setFilter] = useState<SupportTicketStatus | "all">("all");
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [reply, setReply] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [t, m] = await Promise.all([
      supabase
        .from("support_tickets")
        .select(
          `*, user:profiles!support_tickets_user_id_fkey ( store_name, email, contact_name )`,
        )
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("profiles")
        .select("id, email, store_name, contact_name, trust_rank, trust_score")
        .eq("member_type", "dealer")
        .order("store_name"),
    ]);
    setTickets((t.data ?? []) as TicketRow[]);
    setMembers((m.data ?? []) as MemberRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((x) => x.status === filter);
  }, [tickets, filter]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 15);
    return members
      .filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          (m.store_name ?? "").toLowerCase().includes(q) ||
          (m.contact_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 15);
  }, [members, memberQuery]);

  const sendReply = async () => {
    if (!selected) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_reply_support_ticket", {
      p_ticket_id: selected.id,
      p_reply: reply.trim(),
      p_status: "answered",
    });
    setMsg(error ? error.message : "回答を送信しました。");
    if (!error) {
      setSelected(null);
      setReply("");
      load();
    }
  };

  const setStatus = async (id: string, status: SupportTicketStatus) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_support_status", {
      p_ticket_id: id,
      p_status: status,
    });
    setMsg(error ? error.message : "ステータスを更新しました。");
    load();
  };

  const openCount = tickets.filter((t) => t.status === "open").length;
  const reviewingCount = tickets.filter((t) => t.status === "reviewing").length;

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">運営サポート</h1>
            <p className="mt-1 text-sm text-muted">
              未対応 {openCount} · 対応中 {reviewingCount}（dispute とは別管理）
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/admin" className="text-accent hover:underline">
              管理画面
            </Link>
            <Link href="/admin/messages" className="text-accent hover:underline">
              メール送信
            </Link>
          </div>
        </div>

        {msg ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{msg}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "すべて"],
              ["open", "未対応"],
              ["reviewing", "対応中"],
              ["answered", "回答済"],
              ["closed", "クローズ"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-xs ${
                filter === k ? "bg-accent text-black" : "border border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {filtered.map((row) => (
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
                <p className="font-medium">{row.subject}</p>
                <p className="mt-1 text-xs text-muted">
                  {supportCategoryLabel(row.category)} ·{" "}
                  {SUPPORT_STATUS_LABELS[row.status]} ·{" "}
                  {row.user?.store_name ?? row.user?.email}
                </p>
              </button>
            ))}
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-zinc-950/40 p-4">
            {!selected ? (
              <p className="text-sm text-muted">問い合わせを選択</p>
            ) : (
              <>
                <p className="text-sm font-medium">{selected.subject}</p>
                <p className="text-xs text-muted whitespace-pre-wrap">{selected.message}</p>
                {selected.deal_id ? (
                  <Link href={`/admin/deals/${selected.deal_id}`} className="text-xs text-accent">
                    取引詳細 →
                  </Link>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {(["reviewing", "closed"] as SupportTicketStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(selected.id, s)}
                      className="rounded border border-border px-2 py-1 text-xs"
                    >
                      {SUPPORT_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={5}
                  placeholder="管理者回答"
                  className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={sendReply}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-black"
                >
                  回答送信
                </button>
                {selected.admin_reply ? (
                  <p className="text-xs text-muted border-t border-border pt-3">
                    前回回答: {selected.admin_reply}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">加盟店検索</h2>
          <input
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="店舗・担当・メール"
            className="mt-2 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          />
          <ul className="mt-3 space-y-2">
            {filteredMembers.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span>
                  {m.store_name ?? "—"} · {m.contact_name ?? m.email}
                  <TrustBadge rank={m.trust_rank as never} score={m.trust_score} compact />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
