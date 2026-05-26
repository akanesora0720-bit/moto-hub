/** 取引警告: DB の deal_alerts と現在の deals 状態を突き合わせて表示対象を絞る */

export type DealAlertRow = {
  id: string;
  deal_id: string;
  alert_type: string;
  message: string;
};

export type DealAlertContext = {
  id: string;
  status: string;
  seller_payment_confirmed_at?: string | null;
  funded_at?: string | null;
  transfer_completed_at?: string | null;
  requires_name_transfer?: boolean;
  transfer_overdue?: boolean;
  transfer_deadline_at?: string | null;
};

export function isDealAlertStillActionable(
  alert: Pick<DealAlertRow, "alert_type" | "deal_id">,
  deal: DealAlertContext | undefined,
): boolean {
  if (!deal) return false;

  switch (alert.alert_type) {
    case "buyer_payment_reported":
      return (
        deal.status === "awaiting_payment" &&
        !deal.seller_payment_confirmed_at &&
        !deal.funded_at
      );
    case "transfer_overdue":
      return deal.status === "transfer_pending" && !!deal.transfer_overdue;
    case "transfer_due_soon":
      return (
        deal.status === "transfer_pending" &&
        !!deal.transfer_deadline_at &&
        !deal.transfer_overdue
      );
    default:
      return true;
  }
}

export function filterActionableDealAlerts<T extends DealAlertRow>(
  alerts: T[],
  deals: DealAlertContext[],
): T[] {
  const byId = new Map(deals.map((d) => [d.id, d]));
  return alerts.filter((a) => isDealAlertStillActionable(a, byId.get(a.deal_id)));
}
