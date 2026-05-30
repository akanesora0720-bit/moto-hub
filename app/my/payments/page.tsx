"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  DOCUMENT_KIND_LABELS,
  MONTHLY_MEMBERSHIP_DUE_DAY,
  MONTHLY_MEMBERSHIP_FEE_BY_RANK,
  MONTHLY_MEMBERSHIP_ISSUE_DAY,
  MONTHLY_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  formatYen,
  monthlyMembershipFeeIncTax,
} from "@/lib/billing";
import { formatBillingWeekLabel } from "@/lib/billing-week";
import { TRUST_RANK_BANDS } from "@/lib/credit";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, MonthlyPaymentReport, TrustRank } from "@/lib/types";

type MembershipInvoice = Pick<
  Invoice,
  "id" | "billing_month" | "total_inc_tax" | "status" | "issued_at" | "payment_due_at"
>;

type WeeklyInvoice = Pick<
  Invoice,
  | "id"
  | "document_kind"
  | "invoice_number"
  | "billing_week_start"
  | "billing_week_end"
  | "total_inc_tax"
  | "status"
  | "issued_at"
  | "payment_due_at"
>;

function monthStartKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function MyPaymentsPage() {
  const [reports, setReports] = useState<MonthlyPaymentReport[]>([]);
  const [invoices, setInvoices] = useState<MembershipInvoice[]>([]);
  const [weeklyInvoices, setWeeklyInvoices] = useState<WeeklyInvoice[]>([]);
  const [billingMonth, setBillingMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [myRank, setMyRank] = useState<TrustRank>("GOLD");

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [reportsRes, invoicesRes, weeklyRes, profileRes] = await Promise.all([
      supabase
        .from("monthly_payment_reports")
        .select("*")
        .order("billing_month", { ascending: false }),
      supabase
        .from("invoices")
        .select("id, billing_month, total_inc_tax, status, issued_at, payment_due_at")
        .eq("document_kind", "monthly_membership")
        .order("billing_month", { ascending: false }),
      supabase
        .from("invoices")
        .select(
          "id, document_kind, invoice_number, billing_week_start, billing_week_end, total_inc_tax, status, issued_at, payment_due_at",
        )
        .in("document_kind", ["weekly_vehicle_platform_fee", "weekly_part_platform_fee"])
        .order("issued_at", { ascending: false }),
      user
        ? supabase.from("profiles").select("trust_rank").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setReports((reportsRes.data ?? []) as MonthlyPaymentReport[]);
    setInvoices((invoicesRes.data ?? []) as MembershipInvoice[]);
    setWeeklyInvoices((weeklyRes.data ?? []) as WeeklyInvoice[]);
    if (profileRes.data?.trust_rank) {
      setMyRank(profileRes.data.trust_rank as TrustRank);
    }
  }, []);

  useEffect(() => {
    load();
    setBillingMonth(monthStartKey(new Date()));
  }, [load]);

  useEffect(() => {
    const key = billingMonth.slice(0, 7);
    const inv = invoices.find((i) => i.billing_month?.startsWith(key));
    if (inv) setAmount(String(inv.total_inc_tax));
  }, [invoices, billingMonth]);

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

  const myFeeIncTax = monthlyMembershipFeeIncTax(myRank);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">月額会費 入金報告</h1>
          <p className="mt-1 text-sm text-muted">
            毎月{MONTHLY_MEMBERSHIP_ISSUE_DAY}日に、当月の信用ランクに応じた金額で請求書を自動発行します。
            お支払期限は当月{MONTHLY_MEMBERSHIP_DUE_DAY}日まで。
          </p>
          <p className="mt-2 text-sm">
            あなたのランク: <span className="font-medium">{TRUST_RANK_BANDS[myRank].label}</span>
            （今月の請求目安 税込 {formatYen(myFeeIncTax)}）
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-muted">
            {(Object.keys(MONTHLY_MEMBERSHIP_FEE_BY_RANK) as TrustRank[]).map((rank) => (
              <li key={rank}>
                {TRUST_RANK_BANDS[rank].label}: 税抜 {formatYen(MONTHLY_MEMBERSHIP_FEE_BY_RANK[rank])}
              </li>
            ))}
          </ul>
        </div>

        <section className="space-y-3">
          <h2 className="font-medium">週次手数料請求書</h2>
          <p className="text-xs text-muted">
            車両・パーツの成約手数料は毎週月曜にまとめて請求します（集計週: 土曜0:00〜金曜23:59）。
            支払期限は発行日を含め3営業日以内です。
          </p>
          {weeklyInvoices.length === 0 ? (
            <p className="text-sm text-muted">発行済みの週次請求書はありません。</p>
          ) : (
            weeklyInvoices.map((inv) => {
              const overdue =
                inv.status === "issued" &&
                inv.payment_due_at &&
                new Date(inv.payment_due_at).getTime() < Date.now();
              const unpaid = inv.status === "issued";
              return (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {inv.invoice_number ?? inv.id.slice(0, 8)} ·{" "}
                      {DOCUMENT_KIND_LABELS[inv.document_kind as keyof typeof DOCUMENT_KIND_LABELS] ??
                        inv.document_kind}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      対象期間:{" "}
                      {inv.billing_week_start && inv.billing_week_end
                        ? formatBillingWeekLabel(inv.billing_week_start, inv.billing_week_end)
                        : "—"}{" "}
                      · {formatYen(inv.total_inc_tax)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {INVOICE_STATUS_LABELS[inv.status]}
                      {unpaid ? "（未払い）" : ""}
                      {overdue ? " · 期限超過" : ""}
                      {inv.payment_due_at
                        ? ` · 支払期限 ${new Date(inv.payment_due_at).toLocaleDateString("ja-JP")}`
                        : null}
                    </p>
                  </div>
                  <a
                    href={`/api/invoices/${inv.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    請求書PDF
                  </a>
                </div>
              );
            })
          )}
          <a
            href="/api/exports/invoices.csv"
            className="inline-block text-xs text-accent hover:underline"
          >
            請求履歴CSVをダウンロード
          </a>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">月額会費 請求書</h2>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted">
              発行済みの請求書はありません（毎月{MONTHLY_MEMBERSHIP_ISSUE_DAY}日に自動発行）。
            </p>
          ) : (
            invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {inv.billing_month
                      ? new Date(inv.billing_month).toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "long",
                        })
                      : "—"}{" "}
                    · {formatYen(inv.total_inc_tax)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {INVOICE_STATUS_LABELS[inv.status]}
                    {inv.payment_due_at
                      ? ` · 支払期限 ${new Date(inv.payment_due_at).toLocaleDateString("ja-JP")}`
                      : null}
                  </p>
                </div>
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-accent hover:underline"
                >
                  請求書PDF
                </a>
              </div>
            ))
          )}
        </section>

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
