"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SUPPORT_CATEGORIES } from "@/lib/support";
import { createClient } from "@/lib/supabase/client";
import type { SupportTicketCategory } from "@/lib/types";

export default function SupportNewPage() {
  const router = useRouter();
  const [category, setCategory] = useState<SupportTicketCategory>("deal");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [dealId, setDealId] = useState("");
  const [deals, setDeals] = useState<{ id: string; label: string }[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("deal");
    if (fromUrl) setDealId(fromUrl);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: auth }) => {
      const uid = auth.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("deals")
        .select("id, status, listings ( maker, model )")
        .or(`buyer_id.eq.${uid},seller_id.eq.${uid}`)
        .order("updated_at", { ascending: false })
        .limit(30);
      setDeals(
        (data ?? []).map((d) => {
          const li = Array.isArray(d.listings) ? d.listings[0] : d.listings;
          return {
            id: d.id,
            label: li ? `${li.maker} ${li.model} (${d.status})` : d.id.slice(0, 8),
          };
        }),
      );
    });
  }, []);

  const submit = async () => {
    setStatusMsg("");
    if (!subject.trim() || message.trim().length < 10) {
      setStatusMsg("件名と内容（10文字以上）を入力してください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("submit_support_ticket", {
      p_category: category,
      p_subject: subject.trim(),
      p_message: message.trim(),
      p_deal_id: dealId.trim() || null,
    });
    setLoading(false);
    if (error) {
      setStatusMsg(error.message);
      return;
    }
    router.push(`/support/${(data as { id: string }).id}`);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href="/support" className="text-sm text-accent hover:underline">
            ← 一覧
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">運営サポート</h1>
          <p className="mt-1 text-sm text-muted">
            トラブル・違反の申告は{" "}
            <Link href="/disputes/new" className="text-accent hover:underline">
              dispute
            </Link>{" "}
            をご利用ください。
          </p>
        </div>

        <label className="block text-sm">
          <span className="text-muted">カテゴリ</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          >
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted">対象取引（任意）</span>
          <select
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          >
            <option value="">— なし —</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted">件名</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted">内容</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
          />
        </label>

        {statusMsg ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{statusMsg}</p>
        ) : null}

        <button
          type="button"
          disabled={loading}
          onClick={submit}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {loading ? "送信中…" : "送信"}
        </button>
        </div>
    </AppShell>
  );
}
