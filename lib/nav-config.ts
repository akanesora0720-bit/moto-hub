export type NavItem = {
  href: string;
  label: string;
  badgeKey?: string;
  matchPrefix?: boolean;
};

export const dealerNavItems: NavItem[] = [
  { href: "/home", label: "ホーム" },
  { href: "/inspections", label: "MotoHub査定", matchPrefix: true },
  { href: "/listings/new", label: "出品", matchPrefix: true, badgeKey: "newInquiries" },
  {
    href: "/deals",
    label: "商談",
    badgeKey: "negotiating",
    matchPrefix: true,
  },
  { href: "/support", label: "サポート", badgeKey: "openSupport", matchPrefix: true },
  { href: "/disputes/new", label: "トラブル", badgeKey: "openDisputes" },
  { href: "/search", label: "業販検索" },
  { href: "/deals/history", label: "成約履歴" },
  { href: "/profile", label: "評価", matchPrefix: true },
  { href: "/help", label: "操作説明" },
  { href: "/settings", label: "設定" },
];

export const adminNavItems: NavItem[] = [
  {
    href: "/admin",
    label: "管理センター",
    badgeKey: "adminHubPending",
    matchPrefix: true,
  },
  {
    href: "/admin/workspace",
    label: "商談・取引",
    badgeKey: "adminWorkspacePending",
    matchPrefix: true,
  },
  {
    href: "/admin/deals",
    label: "取引連絡",
    badgeKey: "adminDealsPending",
    matchPrefix: true,
  },
  { href: "/admin/billing", label: "精算", matchPrefix: true },
  { href: "/admin/support", label: "サポート", badgeKey: "openSupport", matchPrefix: true },
  { href: "/admin/disputes", label: "トラブル", badgeKey: "openDisputes", matchPrefix: true },
  { href: "/admin/credit", label: "加盟店・信用", matchPrefix: true },
  {
    href: "/admin/inspections",
    label: "MotoHub査定",
    badgeKey: "openInspectionRequests",
    matchPrefix: true,
  },
  { href: "/admin/messages", label: "メール" },
  { href: "/admin/help", label: "操作説明" },
];

export const staffNavItems: NavItem[] = adminNavItems;
