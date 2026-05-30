/** 運営・スタッフ向けの取引・連絡板URL（加盟店用 /deals と分離） */

export function adminDealListPath(): string {
  return "/admin/deals";
}

export function adminDealDetailPath(dealId: string, hash?: string): string {
  const base = `/admin/deals/${dealId}`;
  return hash ? `${base}#${hash.replace(/^#/, "")}` : base;
}

export function dealerDealDetailPath(dealId: string, hash?: string): string {
  const base = `/deals/${dealId}`;
  return hash ? `${base}#${hash.replace(/^#/, "")}` : base;
}

/**
 * 通知の link_url を表示コンテキストに合わせて書き換え。
 */
export function resolveNotificationHref(
  linkUrl: string | null | undefined,
  isAdminContext: boolean,
  opts?: { entityType?: string | null; entityId?: string | null },
): string | null {
  if (!linkUrl?.trim()) return null;
  const url = linkUrl.trim();

  const entityDealId =
    opts?.entityType === "deals" && opts.entityId ? opts.entityId : null;

  if (!isAdminContext) {
    const adminDeal = url.match(/^\/admin\/deals\/([^/?#]+)(#.*)?$/);
    if (adminDeal) {
      return dealerDealDetailPath(adminDeal[1], adminDeal[2]?.slice(1));
    }
    if (entityDealId && (url.startsWith("/admin/workspace") || url === "/deals")) {
      return dealerDealDetailPath(entityDealId);
    }
    if (url.startsWith("/admin/")) {
      return entityDealId ? dealerDealDetailPath(entityDealId) : "/deals";
    }
    return url;
  }

  if (url === "/deals" || url.startsWith("/deals?")) {
    return adminDealListPath();
  }
  if (url.startsWith("/deals/")) {
    return url.replace(/^\/deals\//, "/admin/deals/");
  }
  if (entityDealId && url.startsWith("/admin/workspace")) {
    return adminDealDetailPath(entityDealId, "deal-primary-action");
  }
  return url;
}
