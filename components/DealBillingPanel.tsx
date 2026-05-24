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
  buyerFeeRate,
  sellerFeeRate,
}: {
  dealId: string;
  userId: string;
  role: "buyer" | "seller";
  status: DealStatus;
  agreedPriceExTax: number;
  buyerFeeRate: number;
  sellerFeeRate: number;
}) {
  const supabase = await createClient();
  const summary = summarizeDealBilling(agreedPriceExTax, buyerFeeRate, sellerFeeRate);

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

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium">請求・精算</h2>
      <p className="text-xs text-muted">取引ステータス: {DEAL_STATUS_LABELS[status]}</p>

      {role === "buyer" ? (
        <div className="space-y-1 text-sm">
          <p>車両価格（税抜）: {formatYen(summary.vehiclePriceExTax)}</p>
          <p>買い手手数料 4%（最低 ¥5,000）: {formatYen(summary.buyerFeeExTax)} + 税 {formatYen(summary.buyerFeeTax)}</p>
          <p className="font-semibold">合計請求: {formatYen(summary.buyerTotalIncTax)}</p>
          {buyerInv ? (
            <p className="text-xs text-muted">
              請求書: {INVOICE_STATUS_LABELS[buyerInv.status]}
              {["review_pending", "issued", "paid"].includes(buyerInv.status) ? (
                <>
                  {" "}
                  ·{" "}
                  <Link href={`/api/invoices/${buyerInv.id}/pdf`} className="text-accent hover:underline" target="_blank">
                    PDF
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-zinc-500">
            {status === "awaiting_payment"
              ? "入金待ち"
              : ["funded", "handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(status)
                ? "入金確認済"
                : "—"}
          </p>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <p>売却価格（税抜）: {formatYen(summary.vehiclePriceExTax)}</p>
          <p>売り手手数料 5%（最低 ¥5,000）: −{formatYen(summary.sellerFeeExTax)} − 税 {formatYen(summary.sellerFeeTax)}</p>
          <p className="font-semibold">差引振込予定: {formatYen(summary.sellerPayoutAmount)}</p>
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
