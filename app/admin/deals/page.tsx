import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { adminDealDetailPath } from "@/lib/admin-deal-routes";
import { canAccessAdmin } from "@/lib/auth";
import { DEAL_STATUS_LABELS, isDealActive } from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { createServiceClient } from "@/lib/server-supabase";
import { getViewer } from "@/lib/viewer";
import type { DealStatus, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminDealsPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");

  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("deals")
    .select(
      `
      id, status, agreed_price_ex_tax, updated_at, buyer_payment_reported_at,
      listings ( maker, model ),
      buyer:profiles!deals_buyer_id_fkey ( store_name ),
      seller:profiles!deals_seller_id_fkey ( store_name )
    `,
    )
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(80);

  const deals = (rows ?? []).map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    const buyer = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer;
    const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
    const status = row.status as DealStatus;
    return {
      id: row.id,
      title: listing ? `${listing.maker} ${listing.model}` : "—",
      status,
      price: row.agreed_price_ex_tax as number,
      active: isDealActive(status),
      buyerPaymentReported: !!row.buyer_payment_reported_at,
      buyerName: (buyer as { store_name: string | null } | null)?.store_name ?? "買い手",
      sellerName: (seller as { store_name: string | null } | null)?.store_name ?? "売り手",
      updatedAt: row.updated_at as string,
    };
  });

  const active = deals.filter((d) => d.active);
  const closed = deals.filter((d) => !d.active);

  return (
    <AuthenticatedShell mode="admin">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">取引連絡</h1>
          <p className="mt-1 text-sm text-muted">
            入金確認後の引取・引渡し連絡板。運営は入金前から閲覧・投稿できます。
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">進行中・要確認</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted">対象の取引はありません。</p>
          ) : (
            active.map((d) => (
              <Link
                key={d.id}
                href={
                  d.status === "awaiting_payment" && d.buyerPaymentReported
                    ? adminDealDetailPath(d.id, "deal-primary-action")
                    : adminDealDetailPath(d.id)
                }
                className="block rounded-xl border border-border bg-card p-4 transition hover:border-accent/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-1 text-sm text-accent">
                      {DEAL_STATUS_LABELS[d.status]}
                      {d.status === "awaiting_payment" && d.buyerPaymentReported
                        ? " · 買い手振込報告あり"
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {d.buyerName} → {d.sellerName}
                    </p>
                  </div>
                  <p className="font-semibold text-accent">{formatYen(d.price)}</p>
                </div>
              </Link>
            ))
          )}
        </section>

        {closed.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted">完了</h2>
            {closed.map((d) => (
              <Link
                key={d.id}
                href={adminDealDetailPath(d.id)}
                className="block rounded-xl border border-border/60 bg-card/50 p-4 text-sm text-muted transition hover:border-border"
              >
                {d.title} · {DEAL_STATUS_LABELS[d.status]} · {formatYen(d.price)}
              </Link>
            ))}
          </section>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
