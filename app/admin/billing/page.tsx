"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  INVOICE_STATUS_LABELS,
  MONTHLY_PAYMENT_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  formatYen,
} from "@/lib/billing";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, MonthlyPaymentReport, Payout } from "@/lib/types";

type PaymentRow = MonthlyPaymentReport & {
  user: { store_name: string | null; email: string } | null;
};

type InvoiceRow = Invoice & {
  user: { store_name: string | null; email: string } | null;
  deal: { id: string; listings: { maker: string; model: string } | null } | null;
};

type PayoutRow = Payout & {
  seller: { store_name: string | null; email: string } | null;
};

function listingLabel(inv: InvoiceRow) {
  const li = inv.deal?.listings;
  const listing = Array.isArray(li) ? li[0] : li;
  return listing ? `${listing.maker} ${listing.model}` : inv.deal_id.slice(0, 8);
}

export default function AdminBillingPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const { loading, message, success, run } = useAsyncAction();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [pay, inv, po] = await Promise.all([
      supabase
        .from("monthly_payment_reports")
        .select("*, user:profiles!monthly_payment_reports_user_id_fkey ( store_name, email )")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("invoices")
        .select(
          `*, user:profiles!invoices_user_id_fkey ( store_name, email ),
           deal:deals ( id, listings ( maker, model ) )`,
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("payouts")
        .select("*, seller:profiles!payouts_seller_id_fkey ( store_name, email )")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setPayments((pay.data ?? []) as PaymentRow[]);
    setInvoices((inv.data ?? []) as InvoiceRow[]);
    setPayouts((po.data ?? []) as PayoutRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const confirmPayment = (id: string, status: "confirmed" | "rejected") =>
    run(async () => {
      const note = prompt(status === "rejected" ? "差戻し理由" : "備考（任意）") ?? "";
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_confirm_monthly_payment", {
        p_report_id: id,
        p_status: status,
        p_admin_note: note || null,
      });
      if (error) return { error: error.message };
      load();
      return { okMessage: "更新しました。" };
    });

  const approveInvoices = (targetDealId: string) =>
    run(async () => {
      if (!window.confirm("請求書・精算書を承認して送信します。よろしいですか？")) {
        return { error: null };
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_approve_and_send_invoices", {
        p_deal_id: targetDealId,
      });
      if (error) return { error: error.message };
      load();
      return { okMessage: "承認して送信しました。" };
    });

  const regenerateDraft = (targetDealId: string) =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("ensure_deal_billing", { p_deal_id: targetDealId });
      if (error) return { error: error.message };
      await supabase
        .from("invoices")
        .update({ status: "review_pending" })
        .eq("deal_id", targetDealId)
        .in("status", ["draft", "review_pending"]);
      load();
      return { okMessage: "下書きを再生成しました。" };
    });

  const markInvoicePaid = (id: string) =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_mark_invoice_paid", { p_invoice_id: id });
      if (error) return { error: error.message };
      load();
      return { okMessage: "入金確認しました。" };
    });

  const markPayoutPaid = (id: string) =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_mark_payout_paid", { p_payout_id: id });
      if (error) return { error: error.message };
      load();
      return { okMessage: "振込完了にしました。" };
    });

  const setPayoutReady = (id: string) =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_set_payout_status", {
        p_payout_id: id,
        p_status: "ready",
      });
      if (error) return { error: error.message };
      load();
      return { okMessage: "振込準備完了にしました。" };
    });

  const reviewDealIds = [
    ...new Set(
      invoices
        .filter((i) => i.status === "review_pending" || i.status === "draft")
        .map((i) => i.deal_id),
    ),
  ];

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">請求・入出金</h1>
            <p className="mt-1 text-sm text-muted">月額入金報告 / 請求確認 / 振込</p>
          </div>
          <Link href="/admin" className="text-sm text-accent hover:underline">
            管理画面
          </Link>
        </div>

        {message ? (
          <p
            className={`rounded-lg border px-4 py-3 text-sm ${
              success ? "border-emerald-500/30 text-emerald-200" : "border-border"
            }`}
          >
            {message}
          </p>
        ) : null}

        <section className="space-y-3">
          <h2 className="font-medium">
            請求書確認待ち
            {reviewDealIds.length > 0 ? (
              <span className="ml-2 text-sm text-amber-200">({reviewDealIds.length} 件)</span>
            ) : null}
          </h2>
          {reviewDealIds.length === 0 ? (
            <p className="text-sm text-muted">確認待ちの請求書はありません。</p>
          ) : (
            reviewDealIds.map((did) => {
              const dealInvoices = invoices.filter((i) => i.deal_id === did);
              const buyer = dealInvoices.find((i) => i.party === "buyer");
              const seller = dealInvoices.find((i) => i.party === "seller");
              const label = buyer ? listingLabel(buyer) : seller ? listingLabel(seller) : did.slice(0, 8);
              return (
                <div
                  key={did}
                  className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {label} · 取引 {did.slice(0, 8)}…
                    </span>
                    <Link href={`/deals/${did}`} className="text-xs text-accent hover:underline">
                      取引詳細
                    </Link>
                  </div>
                  {buyer ? (
                    <p>
                      買い手請求: {formatYen(buyer.total_inc_tax)} ·{" "}
                      {INVOICE_STATUS_LABELS[buyer.status]}{" "}
                      <a
                        href={`/api/invoices/${buyer.id}/pdf`}
                        className="text-accent"
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    </p>
                  ) : null}
                  {seller ? (
                    <p>
                      売り手精算: {formatYen(seller.total_inc_tax)} ·{" "}
                      {INVOICE_STATUS_LABELS[seller.status]}{" "}
                      <a
                        href={`/api/invoices/${seller.id}/pdf`}
                        className="text-accent"
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => approveInvoices(did)}
                      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
                    >
                      {loading ? "処理中…" : "承認して送信"}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => regenerateDraft(did)}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      再生成
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">月額入金報告</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted">報告なし</p>
          ) : (
            payments.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm"
              >
                <span>
                  {r.user?.store_name ?? r.user?.email} · {r.billing_month} ·{" "}
                  {formatYen(r.reported_amount)} · {MONTHLY_PAYMENT_STATUS_LABELS[r.status]}
                </span>
                {r.status === "reported" ? (
                  <span className="flex gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => confirmPayment(r.id, "confirmed")}
                      className="text-xs text-accent disabled:opacity-50"
                    >
                      確認
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => confirmPayment(r.id, "rejected")}
                      className="text-xs text-red-400 disabled:opacity-50"
                    >
                      差戻し
                    </button>
                  </span>
                ) : null}
              </div>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">請求書一覧</h2>
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm"
            >
              <span>
                {inv.party === "buyer" ? "買い手" : "売り手"} · {listingLabel(inv)} ·{" "}
                {formatYen(inv.total_inc_tax)} · {INVOICE_STATUS_LABELS[inv.status]}
              </span>
              <span className="flex gap-2">
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  className="text-xs text-accent"
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF
                </a>
                {inv.status === "issued" ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => markInvoicePaid(inv.id)}
                    className="text-xs text-accent disabled:opacity-50"
                  >
                    入金確認
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">振込</h2>
          {payouts.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-3 text-sm"
            >
              <span>
                {p.seller?.store_name ?? p.seller?.email} · {formatYen(p.payout_amount)} ·{" "}
                {PAYOUT_STATUS_LABELS[p.status]}
              </span>
              <span className="flex gap-2">
                {p.status === "awaiting" ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPayoutReady(p.id)}
                    className="text-xs text-accent disabled:opacity-50"
                  >
                    準備完了
                  </button>
                ) : null}
                {p.status === "ready" ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => markPayoutPaid(p.id)}
                    className="text-xs text-accent disabled:opacity-50"
                  >
                    振込完了
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
