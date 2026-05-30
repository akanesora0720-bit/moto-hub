import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
import { formatBillingWeekLabel } from "@/lib/billing-week";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminPartSalesPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("part_sales")
    .select(
      "id, part_listing_id, agreed_price_ex_tax, seller_fee_ex_tax, completed_at, shipped_at, handover_at, fee_accrued_at, part_listings ( part_name )",
    )
    .order("completed_at", { ascending: false })
    .limit(100);

  const saleIds = (data ?? []).map((s) => s.id);
  const { data: accruals } =
    saleIds.length > 0
      ? await supabase
          .from("platform_fee_accruals")
          .select("part_sale_id, billing_week_start, billing_week_end, status")
          .in("part_sale_id", saleIds)
      : { data: [] };

  const accrualBySale = new Map(
    (accruals ?? []).map((a) => [a.part_sale_id as string, a]),
  );

  return (
    <AuthenticatedShell mode="admin">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">管理: パーツ成約一覧</h1>
        <Link href="/api/exports/parts.csv" className="text-sm text-accent hover:underline">
          パーツ取引CSV（全件）
        </Link>
        <div className="space-y-2">
          {(data ?? []).map((s) => {
            const pl = Array.isArray(s.part_listings) ? s.part_listings[0] : s.part_listings;
            const accrual = accrualBySale.get(s.id);
            return (
              <div key={s.id} className="rounded border border-border bg-card px-3 py-2 text-sm">
                <p className="font-medium">{pl?.part_name ?? s.id.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-muted">
                  成約: {formatYen(s.agreed_price_ex_tax)} · 手数料(税抜):{" "}
                  {formatYen(s.seller_fee_ex_tax)}
                </p>
                <p className="text-xs text-muted">
                  発送: {s.shipped_at ? new Date(s.shipped_at).toLocaleDateString("ja-JP") : "—"}
                  {" · "}
                  引渡: {s.handover_at ? new Date(s.handover_at).toLocaleDateString("ja-JP") : "—"}
                </p>
                {accrual ? (
                  <p className="text-xs text-accent">
                    請求週:{" "}
                    {formatBillingWeekLabel(
                      accrual.billing_week_start as string,
                      accrual.billing_week_end as string,
                    )}{" "}
                    ({accrual.status})
                  </p>
                ) : null}
              </div>
            );
          })}
          {(data ?? []).length === 0 ? <p className="text-sm text-muted">データなし</p> : null}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
