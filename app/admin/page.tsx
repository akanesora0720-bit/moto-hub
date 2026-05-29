import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { canAccessAdmin } from "@/lib/auth";
import { fetchAdminPendingCounts } from "@/lib/admin-pending-counts";
import { fetchAdminKpi } from "@/lib/operations-kpi";
import { KpiCard, ManagementSection } from "@/components/layout/DashboardCard";
import { createServiceClient } from "@/lib/server-supabase";
import { formatYen } from "@/lib/format";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminHubPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");

  let kpi;
  let pending;
  let dealerCount = 0;
  let todayVolume = 0;
  let kpiError: string | null = null;

  try {
    const service = createServiceClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [k, p, dealers, fundedToday] = await Promise.all([
      fetchAdminKpi(),
      fetchAdminPendingCounts(viewer.id),
      service
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("member_type", "dealer")
        .eq("is_active", true),
      service
        .from("deals")
        .select("agreed_price_ex_tax")
        .eq("status", "funded")
        .gte("funded_at", todayStart.toISOString()),
    ]);

    kpi = k;
    pending = p;
    dealerCount = dealers.count ?? 0;
    todayVolume = (fundedToday.data ?? []).reduce(
      (sum, d) => sum + (d.agreed_price_ex_tax as number),
      0,
    );
  } catch (e) {
    kpiError = e instanceof Error ? e.message : String(e);
  }

  const dangerAccounts = kpi ? kpi.dealersRed + kpi.dealersBanned : 0;

  return (
    <AuthenticatedShell mode="admin">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">管理センター</h1>
          <p className="mt-1 text-sm text-muted">
            未対応を優先し、必要な画面へ最短で移動できます。
          </p>
        </div>

        {kpiError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            KPI取得エラー: {kpiError}
          </p>
        ) : null}

        {kpi && pending ? (
          <>
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted">KPI スナップショット</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="商談中"
                  value={pending.negotiationDeals}
                  href="/admin/workspace?tab=deals"
                  highlight={pending.negotiationDeals > 0}
                />
                <KpiCard label="本日流通額" value={formatYen(todayVolume)} />
                <KpiCard
                  label="月間成約台数"
                  value={kpi.dealsCompletedThisMonth}
                  href="/admin/workspace"
                />
                <KpiCard
                  label="未対応問い合わせ"
                  value={pending.openInquiries}
                  href="/admin/workspace"
                  highlight={pending.openInquiries > 0}
                />
                <KpiCard
                  label="精算待ち"
                  value={pending.invoicesReviewPending}
                  href="/admin/billing"
                  highlight={pending.invoicesReviewPending > 0}
                />
                <KpiCard label="加盟店数" value={dealerCount} href="/admin/credit" />
                <KpiCard
                  label="危険アカウント"
                  value={dangerAccounts}
                  href="/admin/credit"
                  highlight={dangerAccounts > 0}
                />
                <KpiCard
                  label="名変超過"
                  value={kpi.transferOverdueOpen}
                  href="/admin/workspace"
                  highlight={kpi.transferOverdueOpen > 0}
                />
                <KpiCard
                  label="未解決リスク"
                  value={kpi.openRiskFlags}
                  href="/admin/credit"
                  highlight={kpi.openRiskFlags > 0}
                />
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <ManagementSection
                title="① 商談監視"
                items={[
                  {
                    label: "MotoHub査定依頼",
                    count: pending.openInspectionRequests,
                    href: "/admin/inspections",
                  },
                  {
                    label: "商談中（取引）",
                    count: pending.negotiationDeals,
                    href: "/admin/workspace?tab=deals",
                    note: "inquiry / negotiating",
                  },
                  {
                    label: "商談・新規リード",
                    count: pending.adminNegotiationPending,
                    href: "/admin/workspace?tab=inquiries",
                    note: "商談中の取引＋未紐づき問い合わせ",
                  },
                  {
                    label: "買い手振込報告",
                    count: pending.buyerPaymentReportedPending,
                    href: "/admin/workspace?tab=deals",
                  },
                  {
                    label: "引渡・名変フェーズ",
                    count: pending.handoverPhasePending,
                    href: "/admin/workspace?tab=deals",
                  },
                  {
                    label: "取引完了待ち",
                    count: pending.dealsClosurePending,
                    href: "/admin/workspace?tab=deals",
                  },
                  {
                    label: "トラブル案件",
                    count: pending.openDisputes,
                    href: "/admin/disputes",
                  },
                  {
                    label: "名変期限超過",
                    count: pending.transferOverdue,
                    href: "/admin/workspace",
                  },
                  {
                    label: "引取予定 入力待ち",
                    count: pending.pickupSchedulePending,
                    href: "/admin/workspace",
                    note: "入金確認済・日時未登録",
                  },
                  {
                    label: "取引・商談一覧",
                    count: 0,
                    href: "/admin/workspace",
                    note: "詳細操作",
                  },
                ]}
              />
              <ManagementSection
                title="② 精算管理"
                items={[
                  {
                    label: "請求書確認待ち",
                    count: pending.invoicesReviewPending,
                    href: "/admin/billing",
                  },
                  {
                    label: "入金報告未確認",
                    count: pending.paymentReportsPending,
                    href: "/admin/billing",
                  },
                ]}
              />
              <ManagementSection
                title="③ 加盟店審査"
                items={[
                  {
                    label: "信用・本人確認",
                    count: kpi.dealersYellow,
                    href: "/admin/credit",
                    note: "Yellow 要確認",
                  },
                  {
                    label: "クレーム未処理",
                    count: kpi.complaintsOpen,
                    href: "/admin/workspace",
                  },
                  {
                    label: "運営サポート",
                    count: pending.openSupport,
                    href: "/admin/support",
                  },
                ]}
              />
              <ManagementSection
                title="④ 違反監視"
                items={[
                  {
                    label: "通報・dispute",
                    count: pending.openDisputes,
                    href: "/admin/disputes",
                  },
                  {
                    label: "リスクフラグ",
                    count: kpi.openRiskFlags,
                    href: "/admin/credit",
                  },
                  {
                    label: "BAN / Red",
                    count: dangerAccounts,
                    href: "/admin/credit",
                  },
                ]}
              />
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="/admin/help"
                className="rounded-lg border border-border px-4 py-2 hover:border-accent/40"
              >
                運営 操作説明
              </Link>
              <Link
                href="/admin/workspace"
                className="rounded-lg bg-accent px-4 py-2 font-semibold text-black"
              >
                商談・取引ワークスペース →
              </Link>
              <Link
                href="/admin/dashboard"
                className="rounded-lg border border-border px-4 py-2 hover:border-accent/40"
              >
                詳細 KPI グラフ
              </Link>
              <Link
                href="/admin/messages"
                className="rounded-lg border border-border px-4 py-2 hover:border-accent/40"
              >
                メール送信
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </AuthenticatedShell>
  );
}
