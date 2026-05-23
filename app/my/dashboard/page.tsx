import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { formatYen } from "@/lib/format";
import { fetchDealerDashboardStats } from "@/lib/dealer-dashboard";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function MyDashboardPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");

  let stats;
  let error: string | null = null;
  try {
    stats = await fetchDealerDashboardStats(viewer.id);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const cards = stats
    ? [
        { label: "出品台数", value: String(stats.listing_count), suffix: "台" },
        { label: "成約台数", value: String(stats.completed_count), suffix: "台" },
        { label: "成約率", value: String(stats.completion_rate), suffix: "%" },
        { label: "平均成約単価", value: formatYen(stats.avg_completed_price), suffix: "" },
        { label: "査定済台数", value: String(stats.inspected_count), suffix: "台" },
        { label: "平均掲載日数", value: String(stats.avg_listing_days), suffix: "日" },
        { label: "今月売上（税抜）", value: formatYen(stats.monthly_sales_ex_tax), suffix: "" },
      ]
    : [];

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <Link href="/profile" className="text-sm text-muted hover:text-accent">
            ← 信用証
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">マイ統計</h1>
          <p className="mt-1 text-sm text-muted">
            本人のみ閲覧可能。他会員には公開しません。
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-border bg-card px-4 py-4"
            >
              <p className="text-xs text-muted">{c.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {c.value}
                {c.suffix ? (
                  <span className="ml-0.5 text-sm font-normal text-muted">{c.suffix}</span>
                ) : null}
              </p>
            </div>
          ))}
        </div>

        <p className="text-xs leading-relaxed text-zinc-500">
          公開プロフィールには信用ランク・点数・査定済・距離減算申告のみ表示します。
        </p>
      </div>
    </AuthenticatedShell>
  );
}
