import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import { isDealerApproved } from "@/lib/account-status";
import type { DealStatus, Profile } from "@/lib/types";

export default async function DealsHistoryPage() {
  const viewer = await getViewer();
  const supabase = await createClient();
  const userId = viewer!.id;

  const canRecords = isDealerApproved(viewer!.profile as Profile);

  const { data: rows } = await supabase
    .from("deals")
    .select(
      `id, status, agreed_price_ex_tax, buyer_id, seller_id, completed_at,
       listings ( maker, model )`,
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .in("status", ["completed", "payout_done"])
    .order("updated_at", { ascending: false });

  const dealIds = (rows ?? []).map((r) => r.id);
  const { data: recordRows } =
    canRecords && dealIds.length > 0
      ? await supabase.from("transaction_records").select("id, deal_id").in("deal_id", dealIds)
      : { data: [] };
  const recordByDeal = new Map(
    (recordRows ?? []).map((r) => [r.deal_id as string, r.id as string]),
  );

  const deals = (rows ?? []).map((row) => {
    const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings;
    return {
      id: row.id,
      title: listing ? `${listing.maker} ${listing.model}` : "—",
      status: row.status as DealStatus,
      role: row.buyer_id === userId ? "購入" : "売却",
      price: row.agreed_price_ex_tax,
      completedAt: row.completed_at,
      recordId: recordByDeal.get(row.id) ?? null,
    };
  });

  return (
    <AuthenticatedShell mode="dealer">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">成約履歴</h1>
          <p className="mt-1 text-sm text-muted">完了した取引と精算確認</p>
        </div>

        {deals.length === 0 ? (
          <p className="text-sm text-muted">成約履歴はまだありません。</p>
        ) : (
          <ul className="space-y-3">
            {deals.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-border bg-card transition hover:border-accent/40"
              >
                <Link href={`/deals/${d.id}`} className="block p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{d.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {d.role} · {DEAL_STATUS_LABELS[d.status]}
                      </p>
                    </div>
                    <p className="font-semibold text-accent">{formatYen(d.price)}</p>
                  </div>
                </Link>
                {d.recordId ? (
                  <div className="border-t border-border/60 px-4 py-2">
                    <Link
                      href={`/transaction-records/${d.recordId}`}
                      className="text-xs text-accent hover:underline"
                    >
                      取引記録書 →
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/my/payments"
          className="inline-block text-sm text-accent hover:underline"
        >
          月額入金報告 →
        </Link>
      </div>
    </AuthenticatedShell>
  );
}
