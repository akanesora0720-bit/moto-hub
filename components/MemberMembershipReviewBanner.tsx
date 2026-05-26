"use client";

import { useEffect, useState } from "react";
import {
  formatMembershipReviewFlags,
  MEMBERSHIP_MATCH_REASON_LABELS,
  type DealerMembershipReview,
} from "@/lib/dealer-membership";
import { createClient } from "@/lib/supabase/client";

export function MemberMembershipReviewBanner({ profileId }: { profileId: string }) {
  const [review, setReview] = useState<DealerMembershipReview | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .rpc("get_dealer_membership_review", { p_profile_id: profileId })
      .then(({ data, error }) => {
        if (!error && data) setReview(data as DealerMembershipReview);
      });
  }, [profileId]);

  if (!review) return null;

  const flags = formatMembershipReviewFlags(review);
  if (flags.length === 0 && review.match_score === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-sky-500/30 bg-sky-950/20 px-2 py-1.5 text-[11px] text-sky-100">
      {flags.length > 0 ? (
        <p className="font-medium">{flags.join(" · ")}</p>
      ) : null}
      {review.trust_inherit_target && review.inherited_trust_score != null ? (
        <p className="mt-0.5 text-sky-200/90">
          引継ぎ trust: {review.inherited_trust_score}点（現在入力: {review.current_trust_score ?? "—"}点）
        </p>
      ) : null}
      {review.match_reasons.length > 0 ? (
        <p className="mt-0.5 text-sky-200/80">
          一致:{" "}
          {review.match_reasons
            .map((r) => MEMBERSHIP_MATCH_REASON_LABELS[r] ?? r)
            .join("、")}
        </p>
      ) : null}
      {review.rejoin_blocked_until ? (
        <p className="mt-0.5 text-amber-200/90">
          再加盟制限:{" "}
          {new Date(review.rejoin_blocked_until).toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}
          まで
        </p>
      ) : null}
    </div>
  );
}
