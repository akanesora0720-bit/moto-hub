import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import {
  DEAL_STATUS_LABELS,
  buyerDealLabel,
  isDealActive,
  partyDealStatusBadge,
  sellerDealLabel,
} from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { DealStatus } from "@/lib/types";

export default async function DealsPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const userId = viewer!.id;

  const { data: rows } = await supabase
    .from("deals")
    .select(
      `
      id, status, agreed_price_ex_tax, buyer_id, seller_id, transfer_overdue,
      listings ( maker, model )
    `,
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("updated_at", { ascending: false });

  const deals = (rows ?? []).map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    const isBuyer = row.buyer_id === userId;
    const status = row.status as DealStatus;
    return {
      id: row.id,
      title: listing ? `${listing.maker} ${listing.model}` : "—",
      status,
      role: isBuyer ? ("buyer" as const) : ("seller" as const),
      label: isBuyer ? buyerDealLabel(status) : sellerDealLabel(status),
      price: row.agreed_price_ex_tax,
      overdue: row.transfer_overdue,
      active: isDealActive(status),
    };
  });

  const active = deals.filter((d) => d.active);
  const closed = deals.filter((d) => !d.active && d.status !== "cancelled");

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">取引</h1>
          <p className="mt-1 text-sm text-muted">
            車両代金は買い手が売り手へ直接お振込み。引渡後に双方で完了確認し、運営が取引を完了にします。
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">進行中</h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted">進行中の取引はありません。</p>
          ) : (
            active.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="block rounded-xl border border-border bg-card p-4 transition hover:border-accent/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-1 text-sm text-accent">{d.label}</p>
                    <p className="mt-1 text-xs text-muted">
                      {d.role === "buyer" ? "購入" : "出品"} · {partyDealStatusBadge(d.status, d.role)}
                      {d.overdue ? " · 名変期限超過" : ""}
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
            <h2 className="text-sm font-medium text-muted">終了</h2>
            {closed.map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
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
