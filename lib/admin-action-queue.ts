import type { AdminPendingCounts } from "@/lib/admin-pending-counts";
import type { AdminKpiSnapshot } from "@/lib/operations-kpi";

export type ActionQueueItem = {
  label: string;
  count: number;
  href: string;
  urgent?: boolean;
};

/** 件数があるものだけ。減点調整は「未対応」扱いにしない（自動記録は基本そのまま）。 */
export function buildAdminActionQueue(
  pending: AdminPendingCounts,
  kpi: AdminKpiSnapshot,
): ActionQueueItem[] {
  const raw: ActionQueueItem[] = [
    {
      label: "加盟審査待ち",
      count: pending.dealerMembershipReviewPending,
      href: "/admin/workspace?tab=members",
      urgent: true,
    },
    {
      label: "請求書確認待ち",
      count: pending.invoicesReviewPending,
      href: "/admin/billing",
    },
    {
      label: "月額入金報告の確認",
      count: pending.paymentReportsPending,
      href: "/admin/billing",
    },
    {
      label: "商談・問い合わせ",
      count: pending.adminNegotiationPending,
      href: "/admin/workspace?tab=inquiries",
    },
    {
      label: "買い手の振込報告",
      count: pending.buyerPaymentReportedPending,
      href: "/admin/workspace?tab=deals",
    },
    {
      label: "取引完了の確認",
      count: pending.dealsClosurePending,
      href: "/admin/workspace?tab=deals",
    },
    {
      label: "引渡・名変フェーズ",
      count: pending.handoverPhasePending,
      href: "/admin/workspace?tab=deals",
    },
    {
      label: "名変期限超過",
      count: pending.transferOverdue,
      href: "/admin/workspace?tab=deals",
      urgent: true,
    },
    {
      label: "トラブル・通報",
      count: pending.openDisputes,
      href: "/admin/disputes",
      urgent: true,
    },
    {
      label: "運営サポート",
      count: pending.openSupport,
      href: "/admin/support",
    },
    {
      label: "Moto-Hub査定",
      count: pending.openInspectionRequests,
      href: "/admin/inspections",
    },
    {
      label: "クレーム",
      count: kpi.complaintsOpen,
      href: "/admin/workspace?tab=complaints",
    },
  ];

  return raw
    .filter((item) => item.count > 0)
    .sort((a, b) => {
      if (a.urgent !== b.urgent) {
        return a.urgent ? -1 : 1;
      }
      return b.count - a.count;
    });
}
