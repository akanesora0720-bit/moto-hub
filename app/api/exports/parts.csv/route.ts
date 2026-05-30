import { NextResponse } from "next/server";
import { buildCsv, csvResponse } from "@/lib/csv-export";
import { getExportViewer } from "@/lib/export-auth";
import { formatYen } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getExportViewer();
  if (!viewer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let query = viewer.supabase
    .from("part_sales")
    .select(
      `
      id,
      agreed_price_ex_tax,
      seller_fee_ex_tax,
      completed_at,
      shipped_at,
      handover_at,
      buyer_id,
      seller_id,
      buyer:profiles!part_sales_buyer_id_fkey ( store_name ),
      seller:profiles!part_sales_seller_id_fkey ( store_name ),
      part_listings ( part_name, part_categories ( label ) )
    `,
    )
    .order("completed_at", { ascending: false });

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
    "発送完了日",
    "引渡し完了日",
    "売主",
    "買主",
    "商品名",
    "カテゴリ",
    "成約価格",
    "手数料",
    "状態",
  ];

  const fmt = (ts: string | null) =>
    ts ? new Date(ts).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";

  const csvRows = (rows ?? []).map((row) => {
    const pl = Array.isArray(row.part_listings) ? row.part_listings[0] : row.part_listings;
    const catRaw = pl?.part_categories as { label?: string } | { label?: string }[] | null | undefined;
    const category = Array.isArray(catRaw) ? catRaw[0]?.label : catRaw?.label;
    const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
    const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
    let status = "成約済";
    if (row.shipped_at) status = "発送完了";
    if (row.handover_at) status = "引渡し完了";
    return [
      fmt(row.completed_at as string),
      fmt(row.completed_at as string),
      fmt(row.shipped_at as string | null),
      fmt(row.handover_at as string | null),
      (seller as { store_name?: string })?.store_name ?? "",
      (buyer as { store_name?: string })?.store_name ?? "",
      pl?.part_name ?? "",
      category ?? "",
      row.agreed_price_ex_tax,
      (row.seller_fee_ex_tax as number) > 0 ? formatYen(row.seller_fee_ex_tax as number) : "0",
      status,
    ];
  });

  return csvResponse(
    buildCsv(headers, csvRows),
    viewer.isAdmin ? "parts-sales-all.csv" : "parts-sales-mine.csv",
  );
}
