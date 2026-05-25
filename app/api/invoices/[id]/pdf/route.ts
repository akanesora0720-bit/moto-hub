import { NextRequest, NextResponse } from "next/server";
import { formatBankAccount } from "@/lib/billing";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { buildPaymentInstructionPdf } from "@/lib/payment-instruction-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** 027未適用DBでも動くよう、存在が確実なカラムのみ参照 */
const INVOICE_SELECT = `
  *, profiles!invoices_user_id_fkey ( store_name, email ),
  deals (
    id, agreed_price_ex_tax, seller_id,
    listings ( maker, model, frame_number )
  )
`;

const SELLER_PROFILE_BASE =
  "store_name, contact_name, invoice_number, phone, email";

const SELLER_PROFILE_EXTENDED = `${SELLER_PROFILE_BASE}, trade_name, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(INVOICE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (invoiceError) {
    console.error("invoice pdf fetch:", invoiceError.message);
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }

  if (!invoice) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("label, amount_inc_tax, sort_order")
    .eq("invoice_id", id)
    .order("sort_order");

  if (itemsError) {
    console.error("invoice items pdf:", itemsError.message);
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const profile = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles;
  const deal = Array.isArray(invoice.deals) ? invoice.deals[0] : invoice.deals;
  const listingRaw = deal?.listings;
  const listing = Array.isArray(listingRaw) ? listingRaw[0] : listingRaw;
  const vehicleLabel = listing ? `${listing.maker} ${listing.model}` : "—";
  const issuedAt = invoice.issued_at
    ? new Date(invoice.issued_at).toLocaleDateString("ja-JP")
    : new Date().toLocaleDateString("ja-JP");

  const documentKind =
    (invoice as { document_kind?: string }).document_kind ?? "legacy";

  try {
    if (documentKind === "payment_instruction") {
      let seller: Record<string, string | null | undefined> | null = null;
      const extended = await supabase
        .from("profiles")
        .select(SELLER_PROFILE_EXTENDED)
        .eq("id", deal?.seller_id)
        .maybeSingle();
      if (!extended.error && extended.data) {
        seller = extended.data;
      } else {
        const fallback = await supabase
          .from("profiles")
          .select(SELLER_PROFILE_BASE)
          .eq("id", deal?.seller_id)
          .maybeSingle();
        seller = fallback.data;
      }

      let paymentDueAt: string | null = null;
      const dueRes = await supabase
        .from("deals")
        .select("payment_due_at")
        .eq("id", invoice.deal_id)
        .maybeSingle();
      if (!dueRes.error && dueRes.data?.payment_due_at) {
        paymentDueAt = new Date(dueRes.data.payment_due_at).toLocaleDateString("ja-JP");
      }

      const pdfBytes = await buildPaymentInstructionPdf({
        dealId: invoice.deal_id,
        vehicleLabel,
        frameNumber: listing?.frame_number ?? "—",
        seller: {
          storeName: seller?.store_name ?? "—",
          tradeName: (seller as { trade_name?: string })?.trade_name ?? null,
          contactName: seller?.contact_name ?? null,
          invoiceNumber: seller?.invoice_number ?? null,
          phone: seller?.phone ?? null,
          bankLine: seller ? formatBankAccount(seller) : null,
        },
        vehiclePriceExTax: invoice.total_ex_tax,
        vehicleTax: invoice.total_tax,
        totalIncTax: invoice.total_inc_tax,
        paymentDueAt,
        issuedAt,
      });

      return pdfResponse(pdfBytes, `payment-${invoice.id.slice(0, 8)}.pdf`);
    }

    const partyLabel =
      documentKind === "platform_fee"
        ? "MotoHub手数料請求書"
        : invoice.party === "buyer"
          ? "買い手請求書"
          : "売り手精算書";

    const pdfBytes = await buildInvoicePdf({
      invoiceId: invoice.id,
      dealId: invoice.deal_id,
      partyLabel,
      storeName: profile?.store_name ?? profile?.email ?? "—",
      qualifiedInvoiceNumber:
        process.env.MOTOHUB_QUALIFIED_INVOICE_NUMBER?.trim() ?? "T0000000000000",
      vehicleLabel,
      items: (items ?? []).map((i) => ({
        label: i.label,
        amountIncTax: i.amount_inc_tax,
      })),
      totalExTax: invoice.total_ex_tax,
      totalTax: invoice.total_tax,
      totalIncTax: invoice.total_inc_tax,
      issuedAt,
    });

    return pdfResponse(pdfBytes, `invoice-${invoice.id.slice(0, 8)}.pdf`);
  } catch (e) {
    console.error("pdf build:", e);
    const message = e instanceof Error ? e.message : "pdf generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function pdfResponse(pdfBytes: Uint8Array, filename: string) {
  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
