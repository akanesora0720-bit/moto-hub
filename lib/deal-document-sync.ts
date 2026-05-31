import {
  dealDocumentTitle,
  publishDealDocument,
} from "@/lib/deal-document-publish";
import { buildReceiptPdf } from "@/lib/receipt-pdf";
import { buildTransactionRecordPdf } from "@/lib/transaction-record-pdf";
import type { DealGeneratedDocumentKind, TransactionRecord } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 取引に紐づく発行済み書類を Storage に同期し、未通知なら通知する */
export async function syncDealGeneratedDocuments(
  supabase: SupabaseClient,
  dealId: string,
): Promise<{ published: string[]; errors: string[] }> {
  const published: string[] = [];
  const errors: string[] = [];

  const { data: deal, error: dealErr } = await supabase
    .from("deals")
    .select(
      "id, agreed_price_ex_tax, status, funded_at, seller_payment_confirmed_at, buyer_id, seller_id, listings ( maker, model )",
    )
    .eq("id", dealId)
    .maybeSingle();

  if (dealErr || !deal) {
    errors.push(dealErr?.message ?? "deal not found");
    return { published, errors };
  }

  const listingRaw = deal.listings;
  const listing = Array.isArray(listingRaw) ? listingRaw[0] : listingRaw;
  const vehicleLabel = listing
    ? `${listing.maker} ${listing.model}`
    : "車両";

  const { data: record } = await supabase
    .from("transaction_records")
    .select("*")
    .eq("deal_id", dealId)
    .maybeSingle();

  if (record) {
    const row = record as TransactionRecord;
    for (const spec of [
      { kind: "sales_certificate" as DealGeneratedDocumentKind, title: "販売証明書（取引記録）" },
      { kind: "contract" as DealGeneratedDocumentKind, title: "契約書（取引記録）" },
    ]) {
      try {
        const pdf = await buildTransactionRecordPdf(row, {
          documentTitle: spec.kind === "contract" ? "契約書" : "販売証明書",
        });
        const r = await publishDealDocument(supabase, {
          dealId,
          documentKind: spec.kind,
          sourceType: "transaction_record",
          sourceId: row.id,
          title: spec.title,
          fileName: `${spec.kind}-${dealId.slice(0, 8)}.pdf`,
          pdfBytes: pdf,
          notify: true,
        });
        published.push(`${spec.kind}:${r.id}`);
      } catch (e) {
        errors.push(`${spec.kind}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (deal.funded_at || deal.seller_payment_confirmed_at) {
    try {
      const paidAt = deal.seller_payment_confirmed_at ?? deal.funded_at;
      const paidLabel = paidAt
        ? new Date(paidAt).toLocaleDateString("ja-JP")
        : new Date().toLocaleDateString("ja-JP");
      const taxInc = Math.round(Number(deal.agreed_price_ex_tax) * 1.1);
      const pdf = await buildReceiptPdf({
        dealId,
        receiptId: dealId,
        payerLabel: "買主",
        payeeLabel: "売主",
        vehicleLabel,
        amountIncTax: taxInc,
        paidAt: paidLabel,
      });
      const r = await publishDealDocument(supabase, {
        dealId,
        documentKind: "receipt",
        sourceType: "deal",
        sourceId: dealId,
        title: dealDocumentTitle("receipt"),
        fileName: `receipt-${dealId.slice(0, 8)}.pdf`,
        pdfBytes: pdf,
        notify: true,
      });
      published.push(`receipt:${r.id}`);
    } catch (e) {
      errors.push(`receipt: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { published, errors };
}
