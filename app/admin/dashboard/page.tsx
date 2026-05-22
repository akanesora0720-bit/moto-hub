import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { fetchAdminKpi } from "@/lib/operations-kpi";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/server-supabase";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!me?.is_admin) redirect("/");

  let kpi;
  let kpiError: string | null = null;
  try {
    kpi = await fetchAdminKpi();
  } catch (e) {
    kpiError = e instanceof Error ? e.message : String(e);
  }

  const service = createServiceClient();
  const { data: risks } = await service
    .from("risk_flags")
    .select("id, flag_type, severity, message, dealer_id, entity_type, entity_id, created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const cards = kpi
    ? [
        { label: "今月の出品", value: kpi.listingsThisMonth },
        { label: "今月の成約", value: kpi.dealsCompletedThisMonth },
        { label: "今月の funded", value: kpi.dealsFundedThisMonth },
        { label: "名変超過（進行中）", value: kpi.transferOverdueOpen },
        { label: "未対応クレーム", value: kpi.complaintsOpen },
        { label: "Yellow", value: kpi.dealersYellow },
        { label: "Red", value: kpi.dealersRed },
        { label: "BAN", value: kpi.dealersBanned },
        { label: "未解決リスク", value: kpi.openRiskFlags },
      ]
    : [];

  return (
    <AppShell isAdmin>
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">運営 KPI</h1>
            <p className="mt-1 text-sm text-muted">
              出品・成約・信用・リスクのスナップショット
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <Link href="/admin" className="text-accent hover:underline">
              管理画面
            </Link>
            <Link href="/admin/credit" className="text-accent hover:underline">
              信用管理
            </Link>
          </div>
        </div>

        {kpiError ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            KPI取得エラー: {kpiError}（SUPABASE_SERVICE_ROLE_KEY を確認）
          </p>
        ) : null}

        {kpi ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {cards.map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <p className="text-xs text-muted">{c.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {c.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <TrendBlock title="出品（月次）" rows={kpi.monthlyListings} />
              <TrendBlock title="成約（月次）" rows={kpi.monthlyDeals} />
            </div>
          </>
        ) : null}

        <section>
          <h2 className="text-lg font-medium">未解決リスクフラグ</h2>
          <ul className="mt-3 space-y-2">
            {(risks ?? []).length === 0 ? (
              <li className="text-sm text-muted">なし</li>
            ) : (
              risks!.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-border bg-zinc-950/40 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-amber-400">
                    [{r.severity}] {r.flag_type}
                  </span>
                  <p className="mt-1 text-muted">{r.message}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                    {r.entity_id ? ` · ${r.entity_type} ${r.entity_id}` : ""}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}

function TrendBlock({
  title,
  rows,
}: {
  title: string;
  rows: { month: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <li className="text-xs text-muted">データなし</li>
        ) : (
          rows.map((r) => (
            <li key={r.month} className="flex items-center gap-3 text-xs">
              <span className="w-14 shrink-0 text-muted">{r.month}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-800">
                <div
                  className="h-full bg-accent/70"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums">{r.count}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
