import { NextRequest, NextResponse } from "next/server";
import { dealDocumentTitle, publishDealDocumentAfterPdf } from "@/lib/deal-document-after-pdf";
import { buildTransactionRecordPdf } from "@/lib/transaction-record-pdf";
import {
  canViewTransactionRecords,
  isTransactionRecordParty,
} from "@/lib/transaction-record";
import { canAccessAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile, TransactionRecord } from "@/lib/types";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("member_type, account_status, is_admin, is_active, is_banned")
    .eq("id", user.id)
    .maybeSingle();

  if (!canViewTransactionRecords(profile as Profile | null)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: record, error } = await supabase
    .from("transaction_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!record) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const row = record as TransactionRecord;
  const isAdmin = canAccessAdmin(profile as Profile);
  if (!isAdmin && !isTransactionRecordParty(row, user.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const viewerRole: "seller" | "buyer" | "admin" = isAdmin
    ? "admin"
    : row.seller_id === user.id
      ? "seller"
      : "buyer";

  try {
    const pdf = await buildTransactionRecordPdf(row, { viewerRole });
    const filename = `motohub-transaction-record-${row.deal_id.slice(0, 8)}.pdf`;

    const salesPdf = await buildTransactionRecordPdf(row, {
      viewerRole,
      documentTitle: "販売証明書",
    });
    await publishDealDocumentAfterPdf({
      dealId: row.deal_id,
      documentKind: "sales_certificate",
      sourceType: "transaction_record",
      sourceId: row.id,
      title: dealDocumentTitle("sales_certificate"),
      fileName: `sales-certificate-${row.deal_id.slice(0, 8)}.pdf`,
      pdfBytes: salesPdf,
    });

    const contractPdf = await buildTransactionRecordPdf(row, {
      viewerRole,
      documentTitle: "契約書",
    });
    await publishDealDocumentAfterPdf({
      dealId: row.deal_id,
      documentKind: "contract",
      sourceType: "transaction_record",
      sourceId: row.id,
      title: dealDocumentTitle("contract"),
      fileName: `contract-${row.deal_id.slice(0, 8)}.pdf`,
      pdfBytes: contractPdf,
    });

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
