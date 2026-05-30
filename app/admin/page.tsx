import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
import { fetchAdminPendingCounts } from "@/lib/admin-pending-counts";
import { fetchAdminKpi } from "@/lib/operations-kpi";
import { buildAdminActionQueue } from "@/lib/admin-action-queue";
import { ActionQueue, KpiCard } from "@/components/layout/DashboardCard";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const QUICK_LINKS = [
  { label: "商談・取引", href: "/admin/workspace", desc: "問い合わせ・取引・加盟審査" },
  { label: "精算", href: "/admin/billing", desc: "請求・入金確認" },
  { label: "加盟店・信用", href: "/admin/credit", desc: "審査・減点・BAN" },
  { label: "操作説明", href: "/admin/help", desc: "手順の確認" },
] as const;

export default async function AdminHubPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");

  let kpi;
  let pending;
  let kpiError: string | null = null;

  try {
    [kpi, pending] = await Promise.all([
      fetchAdminKpi(),
      fetchAdminPendingCounts(viewer.id),
    ]);
  } catch (e) {
    kpiError = e instanceof Error ? e.message : String(e);
  }

  const actionQueue =
    kpi && pending ? buildAdminActionQueue(pending, kpi) : [];

  return (
    <AuthenticatedShell mode="admin">
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">管理センター</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            件数があるものだけ下に並びます。自動減点は基本そのままでよく、毎件の報告や承認は不要です。
          </p>
        </div>

        {kpiError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            KPI取得エラー: {kpiError}
          </p>
        ) : null}

        {kpi && pending ? (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted">要対応</h2>
              <ActionQueue items={actionQueue} />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted">よく使う</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUICK_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="rounded-xl border border-border bg-card px-4 py-4 transition hover:border-accent/40"
                  >
                    <p className="font-medium">{link.label}</p>
                    <p className="mt-1 text-xs text-muted">{link.desc}</p>
                  </Link>
                ))}
              </div>
            </section>

            {pending.openDealPenaltiesPending > 0 ? (
              <p className="text-xs text-muted">
                進行中取引の自動減点が {pending.openDealPenaltiesPending}{" "}
                件ありますが、対応必須ではありません。戻す必要があるときだけ{" "}
                <Link href="/admin/credit/adjust" className="text-accent hover:underline">
                  信用管理 › 減点の調整
                </Link>
                から行ってください。
              </p>
            ) : null}

            <section className="space-y-3 border-t border-border pt-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-muted">数字の確認</h2>
                <Link
                  href="/admin/dashboard"
                  className="text-xs text-accent hover:underline"
                >
                  詳細 KPI →
                </Link>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <KpiCard
                  label="商談中"
                  value={pending.negotiationDeals}
                  href="/admin/workspace?tab=deals"
                />
                <KpiCard
                  label="精算待ち"
                  value={pending.invoicesReviewPending}
                  href="/admin/billing"
                  highlight={pending.invoicesReviewPending > 0}
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
