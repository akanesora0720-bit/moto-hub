export type NavItem = {
  href: string;
  label: string;
  badgeKey?: string;
  matchPrefix?: boolean;
};

/** 加盟店：日常で使う画面だけ。他はホーム・設定から。 */
export const dealerNavItems: NavItem[] = [
  { href: "/home", label: "ホーム" },
  { href: "/search", label: "車両を探す" },
  {
    href: "/deals",
    label: "商談",
    badgeKey: "dealsNeedingAttention",
    matchPrefix: true,
  },
  { href: "/listings", label: "出品", matchPrefix: true, badgeKey: "newInquiries" },
  { href: "/parts", label: "パーツ", matchPrefix: true },
  { href: "/settings", label: "設定", matchPrefix: true },
  { href: "/help", label: "操作説明" },
];

/** 運営：日常で使う画面だけ。他は管理センター・各画面から。 */
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
  { href: "/admin/billing", label: "精算", matchPrefix: true },
  { href: "/admin/credit", label: "加盟店・信用", matchPrefix: true },
  { href: "/admin/disputes", label: "トラブル", badgeKey: "openDisputes", matchPrefix: true },
  { href: "/admin/support", label: "サポート", badgeKey: "openSupport", matchPrefix: true },
  { href: "/admin/help", label: "操作説明" },
];

export const staffNavItems: NavItem[] = adminNavItems;
