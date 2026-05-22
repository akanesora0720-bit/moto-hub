import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CreditLicenseCard } from "@/components/credit/CreditLicenseCard";
import { PenaltyHistoryList } from "@/components/credit/PenaltyHistoryList";
import { YearlyTrend } from "@/components/credit/YearlyTrend";
import { TrustBadge } from "@/components/TrustBadge";
import { TRUST_RANK_BANDS } from "@/lib/credit";
import { fetchDealerCreditData } from "@/lib/credit-data";
import { fetchMemberStats } from "@/lib/member-stats";
import { createClient } from "@/lib/supabase/server";
import type { TrustRank } from "@/lib/types";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();

  const isSelf = user!.id === id;
  const isAdmin = !!me?.is_admin;
  const showPrivate = isSelf || isAdmin;
  const showCreditDetail = isSelf || isAdmin;

  type PrivateProfile = {
    id: string;
    store_name: string | null;
    contact_name: string | null;
    prefecture: string | null;
    phone: string | null;
    trust_score: number;
    trust_rank: string;
    yearly_reset_at: string | null;
    is_active: boolean;
    verification_status: string;
  };

  type PublicProfile = {
    id: string;
    prefecture: string | null;
    trust_score: number;
    trust_rank: string;
    verification_status: string;
  };

  let profile: PrivateProfile | PublicProfile | null = null;

  if (showPrivate) {
    const { data } = await supabase
      .from("profiles")
      .select(
        "id, store_name, contact_name, prefecture, phone, trust_score, trust_rank, yearly_reset_at, is_active, verification_status",
      )
      .eq("id", id)
      .maybeSingle();
    profile = data as PrivateProfile | null;
    if (profile && !(profile as PrivateProfile).is_active && !isAdmin) notFound();
  } else {
    const { data } = await supabase
      .from("profiles_public")
      .select("id, prefecture, trust_score, trust_rank, verification_status")
      .eq("id", id)
      .maybeSingle();
    profile = data as PublicProfile | null;
  }

  if (!profile) notFound();

  const stats = await fetchMemberStats(id);
  const creditData = showCreditDetail
    ? await fetchDealerCreditData(id, isAdmin)
    : { penalties: [], snapshots: [], bans: [] };

  const inspectionRate =
    stats.total_listings > 0
      ? Math.round((stats.inspected_listings / stats.total_listings) * 100)
      : 0;

  const rank = profile.trust_rank as TrustRank;
  const privateProfile = showPrivate ? (profile as PrivateProfile) : null;
  const yearlyResetAt =
    privateProfile?.yearly_reset_at ?? null;

  return (
    <AppShell isAdmin={isAdmin}>
      <div className="mx-auto max-w-lg space-y-8">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 在庫一覧
        </Link>

        {showCreditDetail ? (
          <CreditLicenseCard
            score={profile.trust_score}
            badge={rank}
            yearlyResetAt={yearlyResetAt}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-xs font-medium tracking-[0.2em] text-accent uppercase">
              加盟店信用
            </p>
            <div className="mt-4">
              <TrustBadge rank={rank} score={profile.trust_score} />
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">
            {privateProfile?.store_name?.trim()
              ? privateProfile.store_name
              : "会員（店舗名非公開）"}
          </h1>
          <p className="mt-1 text-sm text-muted">エリア: {profile.prefecture ?? "—"}</p>

          {privateProfile ? (
            <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">担当</dt>
                <dd>{privateProfile.contact_name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">電話</dt>
                <dd>{privateProfile.phone ?? "—"}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              店舗名・連絡先は取引仲介のため非公開です。
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-zinc-500">
            RideWorks信用制度（運転免許型）: 毎年100点スタート。減点は理由付きで記録され、
            12/31時点の残点で翌年のバッジ（{TRUST_RANK_BANDS.GOLD.label}/
            {TRUST_RANK_BANDS.BLUE.label}/{TRUST_RANK_BANDS.YELLOW.label}/
            {TRUST_RANK_BANDS.RED.label}）が決まります。1/1に全員100点へリセット。
          </p>
        </div>

        {showCreditDetail ? (
          <>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">減点履歴</h2>
              <PenaltyHistoryList rows={creditData.penalties} />
            </section>

            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">年間推移（年末締め）</h2>
              <YearlyTrend snapshots={creditData.snapshots} />
            </section>

            {creditData.bans.length > 0 && isSelf ? (
              <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm">
                <h2 className="font-semibold text-rose-200">アカウント停止履歴</h2>
                <ul className="mt-2 space-y-2 text-xs text-zinc-400">
                  {creditData.bans.map((b) => (
                    <li key={b.id}>
                      {b.reason} — {new Date(b.banned_at).toLocaleDateString("ja-JP")}
                      {b.lifted_at ? "（解除済）" : ""}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-muted">当年点数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{profile.trust_score}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-muted">表示バッジ</dt>
            <dd className="mt-1 text-lg font-semibold">{TRUST_RANK_BANDS[rank].label}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-muted">成約数</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{stats.completed_deals}</dd>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <dt className="text-muted">査定済率</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{inspectionRate}%</dd>
            <dd className="mt-1 text-xs text-muted">
              {stats.inspected_listings} / {stats.total_listings} 台
            </dd>
          </div>
        </dl>
      </div>
    </AppShell>
  );
}
