export type WithdrawCategory = "normal" | "trust_violation" | "forced";

export type MembershipStatus = "active" | "withdrawn" | "suspended";

export type MembershipEventType =
  | "joined"
  | "withdrawn"
  | "forced_withdrawn"
  | "rejoined"
  | "rejoin_denied"
  | "trust_inherited"
  | "identity_matched";

export type DealerMembershipReview = {
  profile_id: string;
  has_prior_membership: boolean;
  trust_inherit_target: boolean;
  match_score: number;
  match_reasons: string[];
  matched_identity_id: string | null;
  rejoin_blocked: boolean;
  rejoin_blocked_until: string | null;
  is_permanently_banned: boolean;
  prior_withdraw_count: number;
  current_trust_score: number | null;
  inherited_trust_score: number | null;
};

export const WITHDRAW_CATEGORY_LABELS: Record<WithdrawCategory, string> = {
  normal: "通常退会（90日再加盟不可）",
  trust_violation: "信用低下・重大違反（1年再加盟不可）",
  forced: "強制退会",
};

export const MEMBERSHIP_MATCH_REASON_LABELS: Record<string, string> = {
  antique_dealer_number: "古物商番号一致",
  invoice_number: "インボイス番号一致",
  bank_account: "口座情報一致",
  phone: "電話番号一致",
  representative_name: "代表者名一致",
  address: "住所一致",
};

export function formatMembershipReviewFlags(review: DealerMembershipReview): string[] {
  const flags: string[] = [];
  if (review.has_prior_membership) flags.push("過去加盟履歴あり");
  if (review.trust_inherit_target) flags.push("trust引継ぎ対象");
  if (review.is_permanently_banned) flags.push("永久拒否");
  else if (review.rejoin_blocked) flags.push("再加盟制限中");
  return flags;
}
