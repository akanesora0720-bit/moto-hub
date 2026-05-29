import { NextRequest, NextResponse } from "next/server";
import { formatBankAccount } from "@/lib/billing";
import { buildInvoicePdf } from "@/lib/invoice-pdf";
import { getMotohubIssuer } from "@/lib/motohub-issuer";
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
    .select("label, amount_ex_tax, tax_amount, amount_inc_tax, sort_order")
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
  const inspectionRequestId = (invoice as { inspection_request_id?: string | null })
    .inspection_request_id;
  const billingMonth = (invoice as { billing_month?: string | null }).billing_month;
  const invoicePaymentDueAt = (invoice as { payment_due_at?: string | null }).payment_due_at;
  const partSaleId = (invoice as { part_sale_id?: string | null }).part_sale_id;

  try {
    if (
      (documentKind === "part_payment_instruction" || documentKind === "part_platform_fee") &&
      partSaleId
    ) {
      const { data: sale, error: saleError } = await supabase
        .from("part_sales")
        .select(
          "id, agreed_price_ex_tax, seller_id, part_listings ( part_name, manufacturer )",
        )
        .eq("id", partSaleId)
        .maybeSingle();

      if (saleError || !sale) {
        return NextResponse.json({ error: "part sale not found" }, { status: 404 });
      }

      const partRaw = sale.part_listings;
      const part = Array.isArray(partRaw) ? partRaw[0] : partRaw;
      const partLabel = part
        ? `${part.manufacturer ?? ""} ${part.part_name}`.trim()
        : "パーツ";

      if (documentKind === "part_payment_instruction") {
        let seller: Record<string, string | null | undefined> | null = null;
        const extended = await supabase
          .from("profiles")
          .select(SELLER_PROFILE_EXTENDED)
          .eq("id", sale.seller_id)
          .maybeSingle();
        if (!extended.error && extended.data) {
          seller = extended.data;
        } else {
          const fallback = await supabase
            .from("profiles")
            .select(SELLER_PROFILE_BASE)
            .eq("id", sale.seller_id)
            .maybeSingle();
          seller = fallback.data;
        }

        const pdfBytes = await buildPaymentInstructionPdf({
          dealId: partSaleId,
          vehicleLabel: partLabel,
          frameNumber: "—",
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
          paymentDueAt: invoicePaymentDueAt
            ? new Date(invoicePaymentDueAt).toLocaleDateString("ja-JP")
            : null,
          issuedAt,
        });

        return pdfResponse(pdfBytes, `part-payment-${invoice.id.slice(0, 8)}.pdf`);
      }

      const issuer = await getMotohubIssuer(supabase);
      const pdfBytes = await buildInvoicePdf({
        invoiceId: invoice.id,
        referenceLabel: "パーツ成約ID",
        referenceId: partSaleId,
        partyLabel: "Moto-Hubパーツ手数料請求書",
        billToName: profile?.store_name ?? profile?.email ?? "—",
        vehicleLabel: partLabel,
        items: (items ?? []).map((i) => ({
          label: i.label,
          amountExTax: i.amount_ex_tax,
          taxAmount: i.tax_amount,
          amountIncTax: i.amount_inc_tax,
        })),
        totalExTax: invoice.total_ex_tax,
        totalTax: invoice.total_tax,
        totalIncTax: invoice.total_inc_tax,
        issuedAt,
        issuer,
        paymentDueAt: invoicePaymentDueAt
          ? new Date(invoicePaymentDueAt).toLocaleDateString("ja-JP")
          : null,
      });

      return pdfResponse(pdfBytes, `part-fee-${invoice.id.slice(0, 8)}.pdf`);
    }

    if (documentKind === "monthly_membership") {
      const issuer = await getMotohubIssuer(supabase);
      const monthLabel = billingMonth
        ? new Date(billingMonth).toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "long",
          })
        : "—";
      const paymentDueAt = invoicePaymentDueAt
        ? new Date(invoicePaymentDueAt).toLocaleDateString("ja-JP")
        : null;

      const pdfBytes = await buildInvoicePdf({
        invoiceId: invoice.id,
        referenceLabel: "対象月",
        referenceId: billingMonth ?? invoice.id,
        partyLabel: "Moto-Hub加盟店 月額会費請求書",
        billToName: profile?.store_name ?? profile?.email ?? "—",
        vehicleLabel: monthLabel,
        items: (items ?? []).map((i) => ({
          label: i.label,
          amountExTax: i.amount_ex_tax,
          taxAmount: i.tax_amount,
          amountIncTax: i.amount_inc_tax,
        })),
        totalExTax: invoice.total_ex_tax,
        totalTax: invoice.total_tax,
        totalIncTax: invoice.total_inc_tax,
        issuedAt,
        issuer,
        paymentDueAt,
      });

      return pdfResponse(pdfBytes, `membership-invoice-${invoice.id.slice(0, 8)}.pdf`);
    }

    if (documentKind === "motohub_inspection") {
      let vehicleLabel = "—";
      let referenceId = inspectionRequestId ?? invoice.id;
      if (inspectionRequestId) {
        const { data: req } = await supabase
          .from("inspection_requests")
          .select("id, vehicle_name, listings ( maker, model )")
          .eq("id", inspectionRequestId)
          .maybeSingle();
        if (req) {
          referenceId = req.id;
          const li = Array.isArray(req.listings) ? req.listings[0] : req.listings;
          vehicleLabel = li
            ? `${li.maker} ${li.model}`
            : (req.vehicle_name as string) ?? "—";
        }
      }

      const issuer = await getMotohubIssuer(supabase);
      const pdfBytes = await buildInvoicePdf({
        invoiceId: invoice.id,
        referenceLabel: "査定依頼ID",
        referenceId,
        partyLabel: "Moto-Hub査定サービス請求書",
        billToName: profile?.store_name ?? profile?.email ?? "—",
        vehicleLabel,
        items: (items ?? []).map((i) => ({
          label: i.label,
          amountExTax: i.amount_ex_tax,
          taxAmount: i.tax_amount,
          amountIncTax: i.amount_inc_tax,
        })),
        totalExTax: invoice.total_ex_tax,
        totalTax: invoice.total_tax,
        totalIncTax: invoice.total_inc_tax,
        issuedAt,
        issuer,
      });

      return pdfResponse(pdfBytes, `inspection-invoice-${invoice.id.slice(0, 8)}.pdf`);
    }

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
        ? "Moto-Hub手数料請求書"
        : invoice.party === "buyer"
          ? "買い手請求書"
          : "売り手精算書";

    const issuer =
      documentKind === "platform_fee" ? await getMotohubIssuer(supabase) : undefined;

    let paymentDueAt: string | null = null;
    if (documentKind === "platform_fee") {
      const dueRes = await supabase
        .from("deals")
        .select("platform_fee_due_at")
        .eq("id", invoice.deal_id)
        .maybeSingle();
      if (dueRes.data?.platform_fee_due_at) {
        paymentDueAt = new Date(dueRes.data.platform_fee_due_at).toLocaleDateString("ja-JP");
      }
    }

    const pdfBytes = await buildInvoicePdf({
      invoiceId: invoice.id,
      dealId: invoice.deal_id,
      partyLabel,
      billToName: profile?.store_name ?? profile?.email ?? "—",
      vehicleLabel,
      items: (items ?? []).map((i) => ({
        label: i.label,
        amountExTax: i.amount_ex_tax,
        taxAmount: i.tax_amount,
        amountIncTax: i.amount_inc_tax,
      })),
      totalExTax: invoice.total_ex_tax,
      totalTax: invoice.total_tax,
      totalIncTax: invoice.total_inc_tax,
      issuedAt,
      issuer,
      paymentDueAt,
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
