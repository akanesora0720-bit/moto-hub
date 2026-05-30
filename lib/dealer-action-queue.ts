import type { ActionQueueItem } from "@/lib/admin-action-queue";
import type { DealerActionStats } from "@/lib/dealer-action-stats";

/** 件数があるものだけ。信用スコアの減点は「やること」に含めない。 */
export function buildDealerActionQueue(stats: DealerActionStats): ActionQueueItem[] {
  const raw: ActionQueueItem[] = [
    {
      label: "新しい問い合わせ",
      count: stats.newInquiries,
      href: "/listings/mine",
      urgent: true,
    },
    {
      label: "商談・取引の対応",
      count: stats.dealsNeedingAttention,
      href: "/deals",
      urgent: true,
    },
    {
      label: "運営からのお知らせ",
      count: stats.unreadNotifications,
      href: "/notifications",
    },
    {
      label: "サポートの返信",
      count: stats.openSupport,
      href: "/support",
    },
    {
      label: "トラブル報告の対応",
      count: stats.openDisputes,
      href: "/disputes/new",
    },
  ];

  return raw
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return b.count - a.count;
    });
}
