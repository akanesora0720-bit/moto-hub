/** 運営・スタッフ向けの取引・連絡板URL（加盟店用 /deals と分離） */

export function adminDealListPath(): string {
  return "/admin/deals";
}

export function adminDealDetailPath(dealId: string, hash?: string): string {
  const base = `/admin/deals/${dealId}`;
  return hash ? `${base}#${hash.replace(/^#/, "")}` : base;
}

/** 通知の link_url を運営コンテキスト用に書き換え */
export function resolveNotificationHref(
  linkUrl: string | null | undefined,
  isAdminContext: boolean,
): string | null {
  if (!linkUrl?.trim()) return null;
  if (!isAdminContext) return linkUrl;
  if (linkUrl === "/deals" || linkUrl.startsWith("/deals?")) {
    return adminDealListPath();
  }
  if (linkUrl.startsWith("/deals/")) {
    return linkUrl.replace(/^\/deals\//, "/admin/deals/");
  }
  return linkUrl;
}
