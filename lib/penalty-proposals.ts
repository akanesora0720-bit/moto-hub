export type PenaltyProposalStatus =
  | "pending"
  | "approved"
  | "waived"
  | "reduced"
  | "deferred";

export const PENALTY_PROPOSAL_STATUS_LABELS: Record<PenaltyProposalStatus, string> = {
  pending: "審査待ち",
  approved: "減点済み",
  waived: "免除",
  reduced: "軽減減点",
  deferred: "延期",
};

export const PENALTY_SOURCE_LABELS: Record<string, string> = {
  transfer_deadline: "名義変更期限",
  payment_deadline: "入金・手数料期限",
};

export const PENALTY_AUTO_RULE_LABELS: Record<string, string> = {
  transfer_deadline_overdue: "名変期限超過（営業日）",
  vehicle_payment_overdue: "車両代金入金期限超過",
  platform_fee_overdue: "Moto-Hub手数料期限超過",
};

export function formatPenaltySource(source: string): string {
  return PENALTY_SOURCE_LABELS[source] ?? source;
}

export function formatAutoRule(rule: string): string {
  return PENALTY_AUTO_RULE_LABELS[rule] ?? rule;
}
