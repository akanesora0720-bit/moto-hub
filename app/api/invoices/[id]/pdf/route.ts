import { NextRequest, NextResponse } from "next/server";
import { formatBankAccount } from "@/lib/billing";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { buildPaymentInstructionPdf } from "@/lib/payment-instruction-pdf";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      `*, profiles!invoices_user_id_fkey ( store_name, email ),
       deals (
         id, payment_due_at, agreed_price_ex_tax,
         seller_id,
         listings ( maker, model, frame_number )
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("label, amount_inc_tax, sort_order")
    .eq("invoice_id", id)
    .order("sort_order");

  const profile = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles;
  const deal = Array.isArray(invoice.deals) ? invoice.deals[0] : invoice.deals;
  const listingRaw = deal?.listings;
  const listing = Array.isArray(listingRaw) ? listingRaw[0] : listingRaw;
  const vehicleLabel = listing ? `${listing.maker} ${listing.model}` : "—";
  const issuedAt = invoice.issued_at
    ? new Date(invoice.issued_at).toLocaleDateString("ja-JP")
    : new Date().toLocaleDateString("ja-JP");

  const documentKind = (invoice as { document_kind?: string }).document_kind ?? "legacy";

  if (documentKind === "payment_instruction") {
    const { data: seller } = await supabase
      .from("profiles")
      .select(
        "store_name, trade_name, contact_name, invoice_number, phone, bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder",
      )
      .eq("id", deal?.seller_id)
      .maybeSingle();

    const pdfBytes = await buildPaymentInstructionPdf({
      dealId: invoice.deal_id,
      vehicleLabel,
      frameNumber: listing?.frame_number ?? "—",
      seller: {
        storeName: seller?.store_name ?? "—",
        tradeName: seller?.trade_name ?? null,
        contactName: seller?.contact_name ?? null,
        invoiceNumber: seller?.invoice_number ?? null,
        phone: seller?.phone ?? null,
        bankLine: seller ? formatBankAccount(seller) : null,
      },
      vehiclePriceExTax: invoice.total_ex_tax,
      vehicleTax: invoice.total_tax,
      totalIncTax: invoice.total_inc_tax,
      paymentDueAt: deal?.payment_due_at
        ? new Date(deal.payment_due_at).toLocaleDateString("ja-JP")
        : null,
      issuedAt,
    });

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="payment-${invoice.id.slice(0, 8)}.pdf"`,
      },
    });
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

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.id.slice(0, 8)}.pdf"`,
    },
  });
}
