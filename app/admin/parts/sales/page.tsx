import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
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
    .select("id, part_listing_id, agreed_price_ex_tax, seller_fee_ex_tax, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AuthenticatedShell mode="admin">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">管理: パーツ成約一覧</h1>
        <div className="space-y-2">
          {(data ?? []).map((s) => (
            <div key={s.id} className="rounded border border-border bg-card px-3 py-2 text-sm">
              <span>sale: {s.id.slice(0, 8)}</span>
              <span className="ml-2">成約: {formatYen(s.agreed_price_ex_tax)}</span>
              <span className="ml-2 text-accent">手数料(税抜): {formatYen(s.seller_fee_ex_tax)}</span>
            </div>
          ))}
          {(data ?? []).length === 0 ? <p className="text-sm text-muted">データなし</p> : null}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
