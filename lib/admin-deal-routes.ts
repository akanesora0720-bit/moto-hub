/** 運営・スタッフ向けの取引・連絡板URL（加盟店用 /deals と分離） */

export function adminDealListPath(): string {
  return "/admin/deals";
}

export function adminDealDetailPath(dealId: string, hash?: string): string {
  const base = `/admin/deals/${dealId}`;
  return hash ? `${base}#${hash.replace(/^#/, "")}` : base;
}

/**
 * 通知の link_url を表示コンテキストに合わせて書き換え。
 * 加盟店画面では /deals のまま。運営画面では /admin/deals へ。
 */
export function resolveNotificationHref(
  linkUrl: string | null | undefined,
  isAdminContext: boolean,
): string | null {
  if (!linkUrl?.trim()) return null;
  if (!isAdminContext) {
    if (linkUrl.startsWith("/admin/deals")) {
      return linkUrl.replace(/^\/admin\/deals/, "/deals");
    }
    if (linkUrl.startsWith("/admin/workspace")) {
      return "/deals";
    }
    return linkUrl;
  }
  if (linkUrl === "/deals" || linkUrl.startsWith("/deals?")) {
    return adminDealListPath();
  }
  if (linkUrl.startsWith("/deals/")) {
    return linkUrl.replace(/^\/deals\//, "/admin/deals/");
  }
  return linkUrl;
}
