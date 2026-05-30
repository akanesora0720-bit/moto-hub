export const MOTOHUB_INSPECTION_FEE_EX_TAX = 3000;

export type InspectionRequestStatus =
  | "requested"
  | "awaiting_dealer"
  | "awaiting_staff"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type InspectionScheduleProposedBy = "staff" | "dealer";

export type InspectionBadgeType = "none" | "motohub_inspected";

export const INSPECTION_REQUEST_STATUS_LABELS: Record<InspectionRequestStatus, string> = {
  requested: "依頼受付",
  awaiting_dealer: "日程確認待ち（加盟店）",
  awaiting_staff: "日程確認待ち（スタッフ）",
  scheduled: "日程確定",
  in_progress: "査定中",
  completed: "完了",
  cancelled: "取消",
};

/** スタッフ・加盟店の日程調整が必要な状態 */
export const INSPECTION_SCHEDULE_NEGOTIATION_STATUSES: InspectionRequestStatus[] = [
  "requested",
  "awaiting_dealer",
  "awaiting_staff",
];

export const MOTOHUB_INSPECTION_BADGE_TITLE = "Moto-Hub査定済";

export const MOTOHUB_INSPECTION_BADGE_DESCRIPTION =
  "Moto-Hubスタッフが実車確認・出品登録を行った車両です";

export type InspectionRequest = {
  id: string;
  listing_id: string | null;
  dealer_id: string;
  requested_by: string;
  assigned_staff_id: string | null;
  status: InspectionRequestStatus;
  vehicle_name: string;
  storage_location: string;
  contact_name: string;
  preferred_at: string | null;
  schedule_proposed_at: string | null;
  schedule_proposed_note: string | null;
  schedule_proposed_by: InspectionScheduleProposedBy | null;
  schedule_confirmed_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  fee_ex_tax: number;
  notes: string | null;
  invoice_id: string | null;
  created_at: string;
  updated_at: string;
};

export function formatInspectionDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isMotohubInspected(badge: InspectionBadgeType | string | null | undefined): boolean {
  return badge === "motohub_inspected";
}
