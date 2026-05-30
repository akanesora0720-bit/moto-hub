import { NextResponse } from "next/server";
import { INVOICE_STATUS_LABELS, DOCUMENT_KIND_LABELS } from "@/lib/billing";
import { buildCsv, csvResponse } from "@/lib/csv-export";
import { getExportViewer } from "@/lib/export-auth";
import { formatBillingWeekLabel, isWeeklyPlatformFeeKind } from "@/lib/billing-week";
import { formatYen } from "@/lib/format";
import type { InvoiceDocumentKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getExportViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query = viewer.supabase
    .from("invoices")
    .select(
      "id, invoice_number, document_kind, status, total_inc_tax, issued_at, payment_due_at, paid_at, billing_month, billing_week_start, billing_week_end, user_id",
    )
    .in("document_kind", [
      "monthly_membership",
      "weekly_vehicle_platform_fee",
      "weekly_part_platform_fee",
      "platform_fee",
      "part_platform_fee",
    ])
    .order("issued_at", { ascending: false });

  if (!viewer.isAdmin) {
    query = query.eq("user_id", viewer.userId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "請求番号",
    "請求期間",
    "請求日",
    "支払期限",
    "請求金額",
    "支払状況",
    "種別",
  ];

  const fmt = (ts: string | null) =>
    ts ? new Date(ts).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";

  const csvRows = (rows ?? []).map((row) => {
    const kind = row.document_kind as InvoiceDocumentKind;
    let period = "";
    if (row.billing_week_start && row.billing_week_end) {
      period = formatBillingWeekLabel(
        row.billing_week_start as string,
        row.billing_week_end as string,
      );
    } else if (row.billing_month) {
      period = new Date(row.billing_month as string).toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        timeZone: "Asia/Tokyo",
      });
    }
    const now = Date.now();
    const due = row.payment_due_at ? new Date(row.payment_due_at as string).getTime() : null;
    let payStatus = INVOICE_STATUS_LABELS[row.status as keyof typeof INVOICE_STATUS_LABELS] ?? row.status;
    if (row.status === "issued" && due && due < now) {
      payStatus = "期限超過";
    } else if (row.status === "issued") {
      payStatus = "未払い";
    }

    return [
      row.invoice_number ?? row.id.slice(0, 8),
      period,
      fmt(row.issued_at as string | null),
      fmt(row.payment_due_at as string | null),
      formatYen(row.total_inc_tax as number),
      payStatus,
      DOCUMENT_KIND_LABELS[kind] ??
        (isWeeklyPlatformFeeKind(kind) ? kind : row.document_kind),
    ];
  });

  return csvResponse(
    buildCsv(headers, csvRows),
    viewer.isAdmin ? "invoices-all.csv" : "invoices-mine.csv",
  );
}
