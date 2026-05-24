import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ActionCard, StatBadge } from "@/components/layout/DashboardCard";
import { fetchDealerActionStats } from "@/lib/dealer-action-stats";
import { createClient } from "@/lib/supabase/server";
import { fetchDealerDashboardStats } from "@/lib/dealer-dashboard";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function DealerHomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");

  const [actions, stats] = await Promise.all([
    fetchDealerActionStats(viewer.id),
    fetchDealerDashboardStats(viewer.id).catch(() => null),
  ]);

  const supabase = await createClient();
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("store_name, email")
    .eq("id", viewer.id)
    .maybeSingle();
  const storeName = profileRow?.store_name ?? profileRow?.email ?? "加盟店";

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">ホーム</h1>
          <p className="mt-1 text-sm text-muted">
            {storeName} さん、今日の業務状況です。
          </p>
          <p className="mt-2 inline-block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200">
            買い手手数料0円 · 成約時は売り手5% · ゴールド会員 月額¥15,000
          </p>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">要対応</h2>
          <div className="flex flex-wrap gap-3">
            <StatBadge
              count={actions.newInquiries}
              label="新着問い合わせ"
              href="/listings/mine"
              urgent
            />
            <StatBadge
              count={actions.negotiating}
              label="商談中"
              href="/deals"
            />
            <StatBadge
              count={actions.awaitingPayment}
              label="入金待ち"
              href="/deals"
              urgent={actions.awaitingPayment > 0}
            />
            <StatBadge
              count={actions.documentsPending}
              label="書類・引渡"
              href="/deals"
            />
            <StatBadge
              count={actions.unreadNotifications}
              label="運営通知"
              href="/notifications"
              urgent={actions.unreadNotifications > 0}
            />
          </div>
        </section>

        {stats ? (
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted">出品中</p>
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

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">業務メニュー</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionCard
              title="① 出品する"
              description="車両を登録して業販に出す"
              href="/listings/new"
            />
            <ActionCard
              title="② 商談管理"
              description="進行中の取引・問い合わせ"
              href="/deals"
              sublinks={[{ label: "自分の出品を見る", href: "/listings/mine" }]}
            />
            <ActionCard
              title="③ 売却済み"
              description="成約履歴と精算確認"
              href="/deals/history"
              sublinks={[{ label: "月額入金報告", href: "/my/payments" }]}
            />
            <ActionCard
              title="④ 車両を探す"
              description="業販在庫を検索・仕入れ"
              href="/search"
            />
            <ActionCard
              title="⑤ お気に入り"
              description="ウォッチリスト（準備中）"
              href="/favorites"
            />
            <ActionCard
              title="⑥ 評価・信用"
              description="加盟店スコアと公開プロフィール"
              href="/profile"
              sublinks={[{ label: "詳細統計", href: "/my/dashboard" }]}
            />
            <ActionCard
              title="⑦ 設定"
              description="会社情報・振込口座・本人確認"
              href="/settings"
              sublinks={[{ label: "運営サポート", href: "/support" }]}
            />
          </div>
        </section>

        <p className="text-xs text-muted">
          迷ったら <Link href="/deals" className="text-accent hover:underline">商談</Link>
          または{" "}
          <Link href="/support" className="text-accent hover:underline">運営サポート</Link>
          へ。
        </p>
      </div>
    </AuthenticatedShell>
  );
}
