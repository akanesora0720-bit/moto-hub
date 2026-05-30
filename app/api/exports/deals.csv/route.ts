import { NextResponse } from "next/server";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { buildCsv, csvResponse } from "@/lib/csv-export";
import { getExportViewer } from "@/lib/export-auth";
import { formatYen } from "@/lib/format";
import { resolveDealFeeRates } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getExportViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query = viewer.supabase
    .from("deals")
    .select(
      `
      id,
      status,
      agreed_price_ex_tax,
      created_at,
      completed_at,
      pickup_completed_at,
      buyer_id,
      seller_id,
      buyer:profiles!deals_buyer_id_fkey ( store_name ),
      seller:profiles!deals_seller_id_fkey ( store_name ),
      listings ( maker, model, frame_number )
    `,
    )
    .in("status", ["completed", "payout_done", "handover_done", "transfer_pending", "payout_ready", "funded", "awaiting_payment", "cancelled", "dispute"])
    .order("created_at", { ascending: false });

  if (!viewer.isAdmin) {
    query = query.or(`buyer_id.eq.${viewer.userId},seller_id.eq.${viewer.userId}`);
  }

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "取引日",
    "成約日",
    "引取完了日",
    "売主",
    "買主",
    "車種",
    "車体番号",
    "成約価格",
    "手数料",
    "状態",
  ];

  const csvRows = (rows ?? []).map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
    const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
    const fee = resolveDealFeeRates(row.agreed_price_ex_tax as number);
    const feeLabel = fee.feeWaived
      ? "0"
      : formatYen(Math.round((row.agreed_price_ex_tax as number) * 0.05));
    const fmt = (ts: string | null) =>
      ts
        ? new Date(ts).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })
        : "";
    return [
      fmt(row.created_at as string),
      fmt(row.completed_at as string | null),
      fmt(row.pickup_completed_at as string | null),
      (seller as { store_name?: string })?.store_name ?? "",
      (buyer as { store_name?: string })?.store_name ?? "",
      listing ? `${listing.maker} ${listing.model}` : "",
      listing?.frame_number ?? "",
      row.agreed_price_ex_tax,
      feeLabel,
      DEAL_STATUS_LABELS[row.status as keyof typeof DEAL_STATUS_LABELS] ?? row.status,
    ];
  });

  return csvResponse(
    buildCsv(headers, csvRows),
    viewer.isAdmin ? "deals-all.csv" : "deals-mine.csv",
  );
}
