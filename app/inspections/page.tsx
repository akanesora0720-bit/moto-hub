import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { InspectionRequestForm } from "@/components/InspectionRequestForm";
import {
  INSPECTION_REQUEST_STATUS_LABELS,
  formatInspectionDateTime,
  type InspectionRequest,
  type InspectionRequestStatus,
} from "@/lib/inspection";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function InspectionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin/inspections");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("inspection_requests")
    .select("*")
    .eq("dealer_id", viewer.id)
    .order("created_at", { ascending: false });

  const requests = (rows ?? []) as InspectionRequest[];

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Moto-Hub査定</h1>
          <p className="mt-1 text-sm text-muted">
            現車確認と出品代行の依頼・進捗確認。自己出品の評価入力とは別サービスです。
          </p>
        </div>

        <InspectionRequestForm />

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted">依頼履歴</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted">まだ依頼はありません。</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{r.vehicle_name}</p>
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">
                      {INSPECTION_REQUEST_STATUS_LABELS[r.status as InspectionRequestStatus]}
                    </span>
                  </div>
                  <p className="mt-1 text-muted">{r.storage_location}</p>
                  <dl className="mt-3 grid gap-1 text-xs text-muted">
                    <div className="flex justify-between gap-4">
                      <dt>希望日時</dt>
                      <dd>{formatInspectionDateTime(r.preferred_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>査定日（確定）</dt>
                      <dd>{formatInspectionDateTime(r.scheduled_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>料金（税抜）</dt>
                      <dd>{formatYen(r.fee_ex_tax)}</dd>
                    </div>
                    {r.status === "completed" && r.completed_at ? (
                      <div className="flex justify-between gap-4">
                        <dt>完了日時</dt>
                        <dd>{formatInspectionDateTime(r.completed_at)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {r.invoice_id ? (
                      <a
                        href={`/api/invoices/${r.invoice_id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-accent hover:underline"
                      >
                        請求書PDF（査定完了時発行）→
                      </a>
                    ) : r.status === "completed" ? (
                      <span className="text-muted">請求書発行処理中</span>
                    ) : null}
                    {r.listing_id ? (
                      <Link href={`/listings/${r.listing_id}`} className="text-accent hover:underline">
                        出品を見る →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AuthenticatedShell>
  );
}
