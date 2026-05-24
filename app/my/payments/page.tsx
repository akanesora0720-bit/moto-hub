"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MONTHLY_PAYMENT_STATUS_LABELS } from "@/lib/billing";
import { createClient } from "@/lib/supabase/client";
import type { MonthlyPaymentReport } from "@/lib/types";

export default function MyPaymentsPage() {
  const [reports, setReports] = useState<MonthlyPaymentReport[]>([]);
  const [billingMonth, setBillingMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("monthly_payment_reports")
      .select("*")
      .order("billing_month", { ascending: false });
    setReports((data ?? []) as MonthlyPaymentReport[]);
  }, []);

  useEffect(() => {
    load();
    const now = new Date();
    setBillingMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
  }, [load]);

  const submit = async () => {
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.rpc("report_monthly_payment", {
      p_billing_month: billingMonth,
      p_reported_amount: Number(amount),
      p_paid_at: paidAt,
      p_payer_name: payerName.trim(),
      p_note: note.trim() || null,
    });
    setMsg(error ? error.message : "入金報告を送信しました。");
    if (!error) load();
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">月額会費 入金報告</h1>
          <p className="mt-1 text-sm text-muted">振込後に報告してください。運営が確認します。</p>
        </div>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="font-medium">新規報告</h2>
          <label className="block text-sm">
            <span className="text-muted">対象月</span>
            <input
              type="date"
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">入金額（円）</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">入金日</span>
            <input
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">振込名義</span>
            <input
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-muted">備考</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black"
          >
            報告する
          </button>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">報告履歴</h2>
          {reports.length === 0 ? (
            <p className="text-sm text-muted">履歴はありません。</p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-border bg-zinc-950/40 px-4 py-3 text-sm"
              >
                <p className="font-medium">
                  {r.billing_month} · ¥{r.reported_amount.toLocaleString("ja-JP")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {MONTHLY_PAYMENT_STATUS_LABELS[r.status]} · 名義: {r.payer_name}
                </p>
                {r.admin_note ? (
                  <p className="mt-2 text-xs text-amber-200/80">運営: {r.admin_note}</p>
                ) : null}
              </div>
            ))
          )}
        </section>
      </div>
    </AppShell>
  );
}
