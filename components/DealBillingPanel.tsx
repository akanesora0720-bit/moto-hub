import Link from "next/link";
import {
  INVOICE_STATUS_LABELS,
  PAYOUT_STATUS_LABELS,
  formatYen,
  summarizeDealBilling,
} from "@/lib/billing";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/server";
import type { DealStatus, Invoice, Payout } from "@/lib/types";

export async function DealBillingPanel({
  dealId,
  userId,
  role,
  status,
  agreedPriceExTax,
}: {
  dealId: string;
  userId: string;
  role: "buyer" | "seller";
  status: DealStatus;
  agreedPriceExTax: number;
}) {
  const supabase = await createClient();
  const summary = summarizeDealBilling(agreedPriceExTax);

  const [{ data: invoices }, { data: payout }] = await Promise.all([
    supabase.from("invoices").select("*").eq("deal_id", dealId),
    supabase.from("payouts").select("*").eq("deal_id", dealId).maybeSingle(),
  ]);

  const buyerInv = (invoices ?? []).find(
    (i) => i.party === "buyer" && i.user_id === userId,
  ) as Invoice | undefined;
  const sellerInv = (invoices ?? []).find(
    (i) => i.party === "seller" && i.user_id === userId,
  ) as Invoice | undefined;
  const payoutRow = payout as Payout | null;

  const showBilling =
    status !== "inquiry" &&
    status !== "negotiating" &&
    status !== "cancelled";

  if (!showBilling) return null;

  const sellerNetExTax = summary.vehiclePriceExTax - summary.sellerFeeExTax;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium">請求・精算</h2>
      <p className="text-xs text-muted">取引ステータス: {DEAL_STATUS_LABELS[status]}</p>

      {role === "buyer" ? (
        <div className="space-y-2 text-sm">
          <Row label="落札価格" value={formatYen(summary.vehiclePriceExTax)} />
          <Row label="手数料" value="¥0" valueClass="font-semibold text-accent" />
          <Row
            label="お支払い総額"
            value={formatYen(summary.vehiclePriceExTax)}
            bold
          />
          <p className="text-xs text-emerald-300/90">買い手手数料0円 — 落札価格のみお支払い</p>
          {buyerInv ? (
            <p className="text-xs text-muted">
              請求書: {INVOICE_STATUS_LABELS[buyerInv.status]}
              {["review_pending", "issued", "paid"].includes(buyerInv.status) ? (
                <>
                  {" "}
                  ·{" "}
                  <Link
                    href={`/api/invoices/${buyerInv.id}/pdf`}
                    className="text-accent hover:underline"
                    target="_blank"
                  >
                    PDF
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <PaymentHint status={status} />
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <Row label="成約価格" value={formatYen(summary.vehiclePriceExTax)} />
          <Row
            label="売り手手数料（5%）"
            value={`−${formatYen(summary.sellerFeeExTax)}`}
            valueClass="text-rose-300"
          />
          <Row label="精算予定額" value={formatYen(sellerNetExTax)} bold />
          {summary.sellerFeeTax > 0 ? (
            <p className="text-xs text-muted">
              手数料消費税 {formatYen(summary.sellerFeeTax)} 差引後の実振込{" "}
              {formatYen(summary.sellerPayoutAmount)}
            </p>
          ) : null}
          {sellerInv ? (
            <p className="text-xs text-muted">精算書: {INVOICE_STATUS_LABELS[sellerInv.status]}</p>
          ) : null}
          {payoutRow ? (
            <p className="text-xs text-muted">振込: {PAYOUT_STATUS_LABELS[payoutRow.status]}</p>
          ) : (
            <p className="text-xs text-zinc-500">振込待ち</p>
          )}
        </div>
      )}

      <Link
        href={`/support/new?deal=${dealId}`}
        className="inline-block text-xs text-accent hover:underline"
      >
        運営サポートに相談 →
      </Link>
    </section>
  );
}

function Row({
  label,
  value,
  bold,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0 ${
        bold ? "pt-1 font-medium" : ""
      }`}
    >
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "text-lg font-semibold text-accent" : "font-medium"} ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentHint({ status }: { status: DealStatus }) {
  const text =
    status === "awaiting_payment"
      ? "入金待ち"
      : ["funded", "handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(
            status,
          )
        ? "入金確認済"
        : "—";
  return <p className="text-xs text-zinc-500">{text}</p>;
}
