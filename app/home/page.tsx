import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { MarketStatsBar } from "@/components/MarketStatsBar";
import { fetchMarketStats } from "@/lib/market-stats";
import { ActionCard, StatBadge } from "@/components/layout/DashboardCard";
import { fetchDealerActionStats } from "@/lib/dealer-action-stats";
import { createClient } from "@/lib/supabase/server";
import { DealerMembershipBanner } from "@/components/DealerMembershipBanner";
import { isDealerApproved } from "@/lib/account-status";
import { fetchDealerDashboardStats } from "@/lib/dealer-dashboard";
import { getViewer } from "@/lib/viewer";
import type { AccountStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DealerHomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");

  const supabase = await createClient();

  const [actions, stats, marketStats] = await Promise.all([
    fetchDealerActionStats(viewer.id),
    fetchDealerDashboardStats(viewer.id).catch(() => null),
    fetchMarketStats(supabase).catch(() => ({ listings: 0, parts: 0 })),
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

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <DealerMembershipBanner
          accountStatus={accountStatus}
          profileCompleted={profileRow?.profile_completed ?? false}
        />
        <div>
          <h1 className="text-2xl font-semibold">ホーム</h1>
          <p className="mt-1 text-sm text-muted">
            {storeName} さん、今日の業務状況です。
          </p>
          <p className="mt-2 inline-block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
            全国の加盟店在庫を検索できます · Moto-Hub β版運用中
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">仕入れ・検索</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              hero
              ctaLabel="在庫を見る"
              title="車両を探す"
              description="全国の加盟店在庫を検索・仕入れ（エリア・都道府県で引取目安）"
              href="/search"
            />
            {tradingEnabled ? (
              <ActionCard
                hero
                ctaLabel="パーツを探す"
                title="パーツを探す"
                description="メーカー・車種・品番で検索。出品・問い合わせ・成約"
                href="/parts"
              />
            ) : (
              <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border bg-zinc-900/30 p-6 text-sm text-muted">
                <p className="font-medium text-zinc-300">パーツを探す</p>
                <p className="mt-2">加盟審査完了後にご利用いただけます。</p>
              </div>
            )}
          </div>
        </section>

        <MarketStatsBar stats={marketStats} />

        {tradingEnabled ? (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted">要対応</h2>
            <div className="flex flex-wrap gap-3">
              {actions.newInquiries > 0 ? (
                <StatBadge
                  count={actions.newInquiries}
                  label="新着問い合わせ"
                  href="/listings/mine"
                  urgent
                />
              ) : null}
              {actions.awaitingPayment > 0 ? (
                <StatBadge
                  count={actions.awaitingPayment}
                  label="入金待ち"
                  href="/deals"
                  urgent
                />
              ) : null}
              {actions.handoverPending > 0 ? (
                <StatBadge
                  count={actions.handoverPending}
                  label="引取・引渡"
                  href="/deals"
                  urgent
                />
              ) : null}
              {actions.unreadNotifications > 0 ? (
                <StatBadge
                  count={actions.unreadNotifications}
                  label="運営通知"
                  href="/notifications"
                  urgent
                />
              ) : null}
              {actions.newInquiries === 0 &&
              actions.awaitingPayment === 0 &&
              actions.handoverPending === 0 &&
              actions.unreadNotifications === 0 ? (
                <p className="text-sm text-muted">現在、要対応の項目はありません。</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {tradingEnabled && stats ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted">出品</p>
              <p className="mt-1 text-xl font-semibold">{stats.listing_count} 台</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted">成約率</p>
              <p className="mt-1 text-xl font-semibold">{stats.completion_rate}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted">今月売上（税抜）</p>
              <p className="mt-1 text-xl font-semibold">
                ¥{stats.monthly_sales_ex_tax.toLocaleString("ja-JP")}
              </p>
            </div>
          </section>
        ) : null}

        {tradingEnabled ? (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted">業務メニュー</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <ActionCard
                title="商談管理"
                description="進行中の取引・問い合わせ"
                href="/deals"
                sublinks={[{ label: "自分の出品を見る", href: "/listings/mine" }]}
              />
              <ActionCard
                title="出品する"
                description="車両を登録して業販に出す"
                href="/listings/new"
              />
              <ActionCard
                title="売却済み"
                description="成約履歴と精算確認"
                href="/deals/history"
                sublinks={[{ label: "月額入金報告", href: "/my/payments" }]}
              />
              <ActionCard
                title="Moto-Hub査定依頼"
                description="現車確認・出品代行（税抜¥3,000/台）"
                href="/inspections"
              />
              <ActionCard
                title="お気に入り"
                description="ウォッチリスト（準備中）"
                href="/favorites"
              />
              <ActionCard
                title="信用ランク"
                description="取引に基づく信用スコアと公開プロフィール"
                href="/profile"
                sublinks={[{ label: "詳細統計", href: "/my/dashboard" }]}
              />
              <ActionCard
                title="設定"
                description="会社情報・振込口座・本人確認"
                href="/settings"
                sublinks={[
                  { label: "操作説明", href: "/help" },
                  { label: "運営サポート", href: "/support" },
                ]}
              />
            </div>
          </section>
        ) : (
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted">利用可能なメニュー</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {!profileRow?.profile_completed ? (
                <ActionCard
                  title="加盟店情報の登録"
                  description="審査に必要な会社情報・書類を入力"
                  href="/onboarding"
                />
              ) : null}
              <ActionCard
                title="操作説明"
                description="登録・検索・審査の流れ"
                href="/help"
              />
              <ActionCard
                title="設定"
                description="アカウント・会社情報"
                href="/settings"
              />
            </div>
          </section>
        )}

        <p className="text-xs text-muted">
          {tradingEnabled ? (
            <>
              迷ったら <Link href="/deals" className="text-accent hover:underline">商談</Link>
              ・
              <Link href="/support" className="text-accent hover:underline">運営サポート</Link>
              ・
            </>
          ) : null}
          <Link href="/help" className="text-accent hover:underline">
            操作説明
          </Link>
          をご覧ください。
        </p>
      </div>
    </AuthenticatedShell>
  );
}
