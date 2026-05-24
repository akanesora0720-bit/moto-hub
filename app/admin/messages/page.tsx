"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TrustBadge } from "@/components/TrustBadge";
import { BULK_FILTER_PRESETS, MESSAGE_IMPORTANCE_OPTIONS } from "@/lib/messages";
import { PREFECTURES } from "@/lib/constants";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";
import type { MessageImportance, TrustRank } from "@/lib/types";

type MemberRow = {
  id: string;
  email: string;
  store_name: string | null;
  contact_name: string | null;
  trust_rank: TrustRank;
  trust_score: number;
  prefecture: string | null;
};

export default function AdminMessagesPage() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [importance, setImportance] = useState<MessageImportance>("normal");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);
  const [bulkPreset, setBulkPreset] = useState("all");
  const [bulkTitle, setBulkTitle] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const { loading, message: msg, success, run, setMessage: setMsg } = useAsyncAction();

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, email, store_name, contact_name, trust_rank, trust_score, prefecture")
      .eq("member_type", "dealer")
      .order("store_name");
    setMembers((data ?? []) as MemberRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members.slice(0, 25);
    return members
      .filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          (m.store_name ?? "").toLowerCase().includes(q) ||
          (m.contact_name ?? "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [members, query]);

  const flushEmailQueue = async () => {
    if (!sendEmail) return { sent: 0, failed: 0 };
    const res = await fetch("/api/admin/notifications/process", { method: "POST" });
    const data = (await res.json()) as {
      error?: string;
      sent?: number;
      failed?: number;
    };
    if (!res.ok || data.error) {
      return { error: data.error ?? "メール送信処理に失敗しました。" };
    }
    if ((data.failed ?? 0) > 0) {
      return { error: data.error ?? `メール ${data.failed} 件が送信できませんでした。` };
    }
    return { sent: data.sent ?? 0, failed: data.failed ?? 0 };
  };

  const sendIndividual = () =>
    run(async () => {
      if (!targetId || !subject.trim() || !body.trim()) {
        return { error: "送信先・件名・本文を入力してください。" };
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_send_message", {
        p_target_user_id: targetId,
        p_subject: subject.trim(),
        p_body: body.trim(),
        p_importance: importance,
        p_send_email: sendEmail,
        p_send_in_app: sendInApp,
      });
      if (error) return { error: error.message };

      const mail = await flushEmailQueue();
      if (mail.error) return { error: mail.error };

      if (sendEmail && sendInApp) {
        return { okMessage: `送信しました（メール・通知）。` };
      }
      if (sendEmail) {
        return { okMessage: `メールを送信しました（${mail.sent} 件）。` };
      }
      return { okMessage: "システム通知を送信しました。" };
    });

  const sendBulk = () =>
    run(async () => {
      if (!bulkTitle.trim() || !subject.trim() || !body.trim()) {
        return { error: "一括タイトル・件名・本文を入力してください。" };
      }
      const preset = BULK_FILTER_PRESETS.find((p) => p.id === bulkPreset);
      const filter = { ...(preset?.filter ?? {}) } as Record<string, unknown>;
      if (prefecture) filter.prefecture = prefecture;

      const supabase = createClient();
      const { data, error } = await supabase.rpc("admin_create_bulk_message_batch", {
        p_title: bulkTitle.trim(),
        p_subject: subject.trim(),
        p_body: body.trim(),
        p_filter_json: filter,
        p_importance: importance,
        p_send_email: sendEmail,
        p_send_in_app: sendInApp,
      });
      if (error) return { error: error.message };

      const mail = await flushEmailQueue();
      if (mail.error) return { error: mail.error };

      const batchId = String(data).slice(0, 8);
      if (sendEmail) {
        return {
          okMessage: `一括送信完了（${batchId}…・メール ${mail.sent} 件）。`,
        };
      }
      return { okMessage: `一括通知を送信しました（${batchId}…）。` };
    });

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">管理者メール送信</h1>
            <p className="mt-1 text-sm text-muted">個別・一括・条件指定。メールとシステム通知。</p>
          </div>
          <Link href="/admin" className="text-sm text-accent hover:underline">
            管理画面
          </Link>
        </div>

        {msg ? (
          <p
            className={`rounded-lg border px-4 py-3 text-sm ${
              success ? "border-emerald-500/30 text-emerald-200" : "border-border"
            }`}
          >
            {msg}
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-muted">件名</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">重要度</span>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as MessageImportance)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            >
              {MESSAGE_IMPORTANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <label className="block text-sm">
          <span className="text-muted">本文</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          />
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            メール送信
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sendInApp} onChange={(e) => setSendInApp(e.target.checked)} />
            システム通知
          </label>
        </div>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">個別送信</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="加盟店検索"
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          />
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setTargetId(m.id)}
                  className={`w-full rounded px-2 py-1 text-left ${
                    targetId === m.id ? "bg-accent/20" : "hover:bg-zinc-900"
                  }`}
                >
                  {m.store_name ?? "—"} · {m.contact_name ?? m.email}
                  <TrustBadge rank={m.trust_rank} score={m.trust_score} compact />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={loading}
            onClick={sendIndividual}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
          >
            {loading ? "送信中…" : "個別送信"}
          </button>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">一括送信</h2>
          <input
            value={bulkTitle}
            onChange={(e) => setBulkTitle(e.target.value)}
            placeholder="バッチタイトル（管理用）"
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          />
          <select
            value={bulkPreset}
            onChange={(e) => setBulkPreset(e.target.value)}
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          >
            {BULK_FILTER_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
          >
            <option value="">都道府県指定なし</option>
            {PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={sendBulk}
            className="rounded-lg border border-accent/40 px-4 py-2 text-sm text-accent disabled:opacity-60"
          >
            {loading ? "送信中…" : "一括送信実行"}
          </button>
        </section>
      </div>
    </AppShell>
  );
}
