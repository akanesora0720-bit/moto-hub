"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SUPPORT_STATUS_LABELS, supportCategoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/client";
import type { SupportTicket, SupportTicketStatus } from "@/lib/types";

export default function SupportDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [ticket, setTicket] = useState<SupportTicket | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setTicket(data as SupportTicket | null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!ticket) {
    return (
      <AppShell>
        <p className="text-sm text-muted">読み込み中…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/support" className="text-sm text-accent hover:underline">
          ← 一覧
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted">
            {supportCategoryLabel(ticket.category)} ·{" "}
            {SUPPORT_STATUS_LABELS[ticket.status as SupportTicketStatus]} ·{" "}
            {new Date(ticket.created_at).toLocaleString("ja-JP")}
          </p>
        </div>
        {ticket.deal_id ? (
          <p className="text-sm">
            対象取引:{" "}
            <Link href={`/deals/${ticket.deal_id}`} className="text-accent hover:underline">
              {ticket.deal_id.slice(0, 8)}…
            </Link>
          </p>
        ) : null}
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium text-muted">問い合わせ内容</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.message}</p>
        </section>
        {ticket.admin_reply ? (
          <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
            <h2 className="text-sm font-medium">運営回答</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.admin_reply}</p>
            {ticket.answered_at ? (
              <p className="mt-2 text-xs text-muted">
                {new Date(ticket.answered_at).toLocaleString("ja-JP")}
              </p>
            ) : null}
          </section>
        ) : (
          <p className="text-sm text-muted">回答待ちです。</p>
        )}
      </div>
    </AppShell>
  );
}
