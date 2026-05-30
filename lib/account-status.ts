import type { AccountStatus, Profile } from "@/lib/types";

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pre_registered: "仮登録",
  pending_review: "加盟審査中",
  approved: "加盟完了",
  rejected: "審査否認",
  suspended: "停止中",
};

/** 正式加盟契約・全機能利用可能 */
export function isDealerApproved(profile: Pick<Profile, "account_status" | "member_type"> | null): boolean {
  return profile?.member_type === "dealer" && profile.account_status === "approved";
}

/** 仮登録または審査待ち（機能制限あり） */
export function isDealerLimited(profile: Pick<Profile, "account_status" | "member_type"> | null): boolean {
  if (profile?.member_type !== "dealer") return false;
  return profile.account_status === "pre_registered" || profile.account_status === "pending_review";
}

export function isDealerPendingReview(
  profile: Pick<Profile, "account_status" | "member_type"> | null,
): boolean {
  return profile?.member_type === "dealer" && profile.account_status === "pending_review";
}

export function isDealerPreRegistered(
  profile: Pick<Profile, "account_status" | "member_type"> | null,
): boolean {
  return profile?.member_type === "dealer" && profile.account_status === "pre_registered";
}

const LIMITED_DEALER_EXACT = ["/listings"] as const;

/** 仮登録・審査待ちの加盟店がアクセス可能なパス */
export function isDealerLimitedPathAllowed(pathname: string): boolean {
  if (LIMITED_DEALER_EXACT.some((p) => pathname === p)) return true;
  if (
    pathname === "/home" ||
    pathname === "/help" ||
    pathname === "/onboarding" ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/membership") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/terms") ||
    pathname === "/privacy" ||
    pathname === "/pricing"
  ) {
    return true;
  }
  if (/^\/listings\/[^/]+$/.test(pathname) && pathname !== "/listings/new" && pathname !== "/listings/mine") {
    return true;
  }
  return false;
}

/** 審査待ち・仮登録向けナビ（閲覧・設定のみ） */
export function dealerNavForLimitedAccess<T extends { href: string }>(items: T[]): T[] {
  const allowed = new Set(["/home", "/search", "/settings", "/help", "/onboarding"]);
  return items.filter((item) => allowed.has(item.href.split("?")[0]));
}
