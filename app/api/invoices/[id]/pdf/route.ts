import { NextRequest, NextResponse } from "next/server";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
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
       deals ( id, listings ( maker, model ) )`,
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

  const pdfBytes = await buildInvoicePdf({
    invoiceId: invoice.id,
    dealId: invoice.deal_id,
    partyLabel: invoice.party === "buyer" ? "買い手請求書" : "売り手精算書",
    storeName: profile?.store_name ?? profile?.email ?? "—",
    qualifiedInvoiceNumber:
      process.env.MOTOHUB_QUALIFIED_INVOICE_NUMBER?.trim() ?? "T0000000000000",
    vehicleLabel: listing ? `${listing.maker} ${listing.model}` : "—",
    items: (items ?? []).map((i) => ({
      label: i.label,
      amountIncTax: i.amount_inc_tax,
    })),
    totalIncTax: invoice.total_inc_tax,
    issuedAt: invoice.issued_at
      ? new Date(invoice.issued_at).toLocaleDateString("ja-JP")
      : new Date().toLocaleDateString("ja-JP"),
  });

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.id.slice(0, 8)}.pdf"`,
    },
  });
}
