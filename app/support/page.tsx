"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SUPPORT_STATUS_LABELS, supportCategoryLabel } from "@/lib/support";
import { createClient } from "@/lib/supabase/client";
import type { SupportTicket, SupportTicketStatus } from "@/lib/types";

export default function SupportListPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false });
    setTickets((data ?? []) as SupportTicket[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">運営サポート</h1>
            <p className="mt-1 text-sm text-muted">
              取引の実務相談・入金・書類など（トラブル申告は dispute）
            </p>
          </div>
          <Link
            href="/support/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            新規問い合わせ
          </Link>
        </div>

        {tickets.length === 0 ? (
          <p className="text-sm text-muted">問い合わせはまだありません。</p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/support/${t.id}`}
                  className="block rounded-xl border border-border bg-card px-4 py-3 hover:border-accent/40"
                >
                  <p className="font-medium">{t.subject}</p>
                  <p className="mt-1 text-xs text-muted">
                    {supportCategoryLabel(t.category)} ·{" "}
                    {SUPPORT_STATUS_LABELS[t.status as SupportTicketStatus]} ·{" "}
                    {new Date(t.created_at).toLocaleString("ja-JP")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
