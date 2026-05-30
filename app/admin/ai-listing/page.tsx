import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/server-supabase";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminAiListingPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");

  const service = createServiceClient();

  const [
    totalRes,
    completedRes,
    failedRes,
    savedRes,
    recentRes,
  ] = await Promise.all([
    service.from("ai_listing_import_jobs").select("id", { count: "exact", head: true }),
    service
      .from("ai_listing_import_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed"),
    service
      .from("ai_listing_import_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    service
      .from("ai_listing_import_jobs")
      .select("saved_draft_count"),
    service
      .from("ai_listing_import_jobs")
      .select(
        "id, seller_id, status, detected_count, saved_draft_count, source_filename, created_at, completed_at, error_message, model_name",
      )
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const totalDrafts = (savedRes.data ?? []).reduce(
    (sum, r) => sum + (r.saved_draft_count ?? 0),
    0,
  );

  const recent = recentRes.data ?? [];
  const sellerIds = [...new Set(recent.map((r) => r.seller_id))];
  const { data: sellers } = sellerIds.length
    ? await service.from("profiles").select("id, store_name").in("id", sellerIds)
    : { data: [] };
  const storeById = new Map((sellers ?? []).map((p) => [p.id, p.store_name]));

  return (
    <AuthenticatedShell mode="admin">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">AI出品サポート</h1>
          <p className="mt-1 text-sm text-muted">解析ジョブの集計（運営用）</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="解析件数" value={totalRes.count ?? 0} />
          <StatCard label="成功" value={completedRes.count ?? 0} />
          <StatCard label="失敗" value={failedRes.count ?? 0} />
          <StatCard label="作成下書き数（累計）" value={totalDrafts} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">直近のジョブ</h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border bg-zinc-900/50 text-muted">
                <tr>
                  <th className="px-3 py-2">日時</th>
                  <th className="px-3 py-2">店舗</th>
                  <th className="px-3 py-2">状態</th>
                  <th className="px-3 py-2">検出</th>
                  <th className="px-3 py-2">下書き</th>
                  <th className="px-3 py-2">モデル</th>
                </tr>
              </thead>
              <tbody>
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-muted">
                      まだジョブがありません。
                    </td>
                  </tr>
                ) : (
                  recent.map((row) => (
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-muted">
                          {new Date(row.created_at).toLocaleString("ja-JP")}
                        </td>
                        <td className="px-3 py-2">{storeById.get(row.seller_id) ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} error={row.error_message} />
                        </td>
                        <td className="px-3 py-2">{row.detected_count}</td>
                        <td className="px-3 py-2">{row.saved_draft_count}</td>
                        <td className="px-3 py-2 text-xs text-muted">{row.model_name ?? "—"}</td>
                      </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AuthenticatedShell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status, error }: { status: string; error: string | null }) {
  const colors: Record<string, string> = {
    completed: "text-emerald-400",
    failed: "text-red-400",
    processing: "text-amber-400",
    uploaded: "text-muted",
  };
  return (
    <span className={colors[status] ?? "text-muted"} title={error ?? undefined}>
      {status}
    </span>
  );
}
