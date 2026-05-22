import type { SellerPublic } from "@/components/SellerPublicSummary";
import type { TrustRank, VerificationStatus } from "@/lib/types";

export const LISTING_SELLER_PUBLIC_SELECT =
  "profiles_public!seller_id ( id, prefecture, trust_score, trust_rank, verification_status )";

type SellerPublicRow = {
  id: string;
  prefecture: string | null;
  trust_score: number;
  trust_rank: string;
  verification_status: string;
};

export function normalizeSellerPublicRow(
  row: SellerPublicRow | SellerPublicRow[] | null | undefined,
): SellerPublic | null {
  if (!row) return null;
  const p = Array.isArray(row) ? row[0] : row;
  if (!p?.id) return null;
  return {
    id: p.id,
    prefecture: p.prefecture ?? null,
    trust_score: p.trust_score ?? 100,
    trust_rank: (p.trust_rank ?? "GOLD") as TrustRank,
    verification_status: (p.verification_status ?? "unverified") as VerificationStatus,
  };
}
