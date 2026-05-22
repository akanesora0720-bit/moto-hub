import Link from "next/link";
import { TrustBadge } from "@/components/TrustBadge";
import { VerificationBadge } from "@/components/VerificationBadge";
import { TRUST_RANK_BANDS } from "@/lib/credit";
import type { TrustRank, VerificationStatus } from "@/lib/types";

export type SellerPublic = {
  id: string;
  prefecture: string | null;
  trust_score: number;
  trust_rank: TrustRank;
  verification_status: VerificationStatus;
};

export function SellerPublicSummary({
  seller,
  memberHref,
}: {
  seller: SellerPublic;
  memberHref?: string;
}) {
  const rank = seller.trust_rank;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">出品者</h2>
        <div className="flex flex-wrap gap-1">
          <VerificationBadge status={seller.verification_status} />
          <TrustBadge rank={rank} score={seller.trust_score} compact />
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">エリア</dt>
          <dd>{seller.prefecture ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">バッジ（前年末確定）</dt>
          <dd>{TRUST_RANK_BANDS[rank].label}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">当年点数</dt>
          <dd className="tabular-nums">{seller.trust_score}</dd>
        </div>
      </dl>
      {memberHref ? (
        <p className="mt-4 text-xs text-muted">
          <Link href={memberHref} className="text-accent hover:underline">
            信用証の詳細を見る
          </Link>
          （店舗名・連絡先は非公開）
        </p>
      ) : null}
      <p className="mt-3 text-xs leading-relaxed text-zinc-500">
        取引のご連絡は運営を介して行います。問い合わせからお進みください。
      </p>
    </div>
  );
}
