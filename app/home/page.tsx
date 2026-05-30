import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ActionCard, ActionQueue } from "@/components/layout/DashboardCard";
import { buildDealerActionQueue } from "@/lib/dealer-action-queue";
import { fetchDealerActionStats } from "@/lib/dealer-action-stats";
import { createClient } from "@/lib/supabase/server";
import { DealerMembershipBanner } from "@/components/DealerMembershipBanner";
import { isDealerApproved } from "@/lib/account-status";
import { fetchDealerDashboardStats } from "@/lib/dealer-dashboard";
import { getViewer } from "@/lib/viewer";
import type { AccountStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEALER_QUICK_LINKS = [
  { label: "商談", href: "/deals", desc: "進行中の取引・連絡" },
  { label: "出品する", href: "/listings/new", desc: "車両を業販に出す" },
  { label: "車両を探す", href: "/search", desc: "全国の加盟店在庫" },
  { label: "パーツ", href: "/parts", desc: "検索・出品・成約" },
  { label: "設定", href: "/settings", desc: "会社情報・請求・サポート" },
  { label: "操作説明", href: "/help", desc: "手順の確認" },
] as const;

export default async function DealerHomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");

  const supabase = await createClient();

  const [actions, stats] = await Promise.all([
    fetchDealerActionStats(viewer.id),
    fetchDealerDashboardStats(viewer.id).catch(() => null),
  ]);
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("store_name, email, account_status, profile_completed")
    .eq("id", viewer.id)
    .maybeSingle();
  const storeName = profileRow?.store_name ?? profileRow?.email ?? "加盟店";
  const accountStatus = (profileRow?.account_status ?? "pre_registered") as AccountStatus;
  const tradingEnabled = isDealerApproved({
    member_type: "dealer",
    account_status: accountStatus,
  });
  const actionQueue = tradingEnabled ? buildDealerActionQueue(actions) : [];

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <DealerMembershipBanner
          accountStatus={accountStatus}
          profileCompleted={profileRow?.profile_completed ?? false}
        />
        <div>
          <h1 className="text-2xl font-semibold">ホーム</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {storeName} さん、今日は
            <strong className="text-foreground"> 要対応</strong>
            があるものだけ下に並びます。減点は自動記録されることがありますが、毎回の報告は不要です。
          </p>
        </div>

        {tradingEnabled ? (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted">要対応</h2>
              <ActionQueue
                items={actionQueue}
                emptyMessage="今は要対応の項目はありません。車両を探す・出品は下のメニューから。"
              />
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted">よく使う</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEALER_QUICK_LINKS.map((link) => (
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

            {stats ? (
              <section className="grid gap-2 border-t border-border pt-6 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted">出品</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{stats.listing_count} 台</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted">成約率</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{stats.completion_rate}%</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted">今月売上（税抜）</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    ¥{stats.monthly_sales_ex_tax.toLocaleString("ja-JP")}
                  </p>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <ActionCard
                hero
                ctaLabel="在庫を見る"
                title="車両を探す"
                description="審査完了前も閲覧できます"
                href="/search"
              />
              {!profileRow?.profile_completed ? (
                <ActionCard
                  hero
                  ctaLabel="登録する"
                  title="加盟店情報"
                  description="審査に必要な情報を入力"
                  href="/onboarding"
                />
              ) : (
                <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border bg-zinc-900/30 p-6 text-sm text-muted">
                  <p className="font-medium text-zinc-300">加盟審査中</p>
                  <p className="mt-2">承認後に出品・商談が使えます。</p>
                </div>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href="/help"
                className="rounded-xl border border-border bg-card px-4 py-4 hover:border-accent/40"
              >
                <p className="font-medium">操作説明</p>
                <p className="mt-1 text-xs text-muted">登録・審査の流れ</p>
              </Link>
              <Link
                href="/settings"
                className="rounded-xl border border-border bg-card px-4 py-4 hover:border-accent/40"
              >
                <p className="font-medium">設定</p>
                <p className="mt-1 text-xs text-muted">アカウント・会社情報</p>
              </Link>
            </div>
          </section>
        )}

        <p className="text-xs text-muted">
          迷ったら{" "}
          <Link href="/deals" className="text-accent hover:underline">
            商談
          </Link>
          または{" "}
          <Link href="/support" className="text-accent hover:underline">
            運営サポート
          </Link>
          ・
          <Link href="/help" className="text-accent hover:underline">
            操作説明
          </Link>
        </p>
      </div>
    </AuthenticatedShell>
  );
}
