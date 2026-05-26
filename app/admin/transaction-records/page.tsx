"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatContractedAt } from "@/lib/transaction-record";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { TransactionPartySnapshot, TransactionRecord } from "@/lib/types";

export default function AdminTransactionRecordsPage() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const search = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("admin_search_transaction_records", {
      p_query: query.trim() || null,
      p_from: from || null,
      p_to: to || null,
      p_limit: 100,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      setRows([]);
      return;
    }
    setRows((data ?? []) as TransactionRecord[]);
    if ((data ?? []).length === 0) {
      setMessage("該当する取引記録はありません。");
    }
  }, [query, from, to]);

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-accent">
            ← 管理センター
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">取引記録書</h1>
          <p className="mt-1 text-sm text-muted">
            成約済み取引の記録。取引ID・車両名・売主・買主・成約日で検索できます。
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">キーワード</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="取引ID / 車両名 / 店舗名"
              className="rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">成約日（から）</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">成約日（まで）</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={() => search()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "検索中…" : "検索"}
          </button>
        </div>

        {message ? <p className="text-sm text-muted">{message}</p> : null}

        <ul className="space-y-3">
          {rows.map((r) => {
            const seller = r.seller_snapshot_json as TransactionPartySnapshot;
            const buyer = r.buyer_snapshot_json as TransactionPartySnapshot;
            return (
              <li key={r.id}>
                <Link
                  href={`/transaction-records/${r.id}`}
                  className="block rounded-xl border border-border bg-card p-4 transition hover:border-accent/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.vehicle_name}</p>
                      <p className="mt-1 text-xs text-muted">
                        成約 {formatContractedAt(r.contracted_at)} · 取引 {r.deal_id.slice(0, 8)}…
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        売: {seller.store_name ?? seller.trade_name ?? "—"} / 買:{" "}
                        {buyer.store_name ?? buyer.trade_name ?? "—"}
                      </p>
                    </div>
                    <p className="font-semibold text-accent">{formatYen(r.sale_price_inc_tax)}</p>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {r.payment_status} · {r.documents_status}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
