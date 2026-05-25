import { resolveDealFeeRates } from "@/lib/billing";
import { formatTransferDeadline } from "@/lib/deal-flow";
import type { DealStatus, InvoiceStatus } from "@/lib/types";

export type AdminDealOpsInput = {
  status: DealStatus;
  agreedPriceExTax: number;
  paymentInstructionStatus: InvoiceStatus | null;
  platformFeeStatus: InvoiceStatus | null;
  buyerPaymentReported: boolean;
  sellerPaymentConfirmed: boolean;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  requiresNameTransfer: boolean;
  transferCompletedAt: string | null;
  transferDeadlineAt: string | null;
  transferOverdue: boolean;
};

export type AdminOpsPrimaryAction =
  | "approve_invoices"
  | "complete_deal"
  | "mark_platform_fee_paid";

export type AdminOpsStep = {
  id: string;
  number: number;
  title: string;
  summary: string;
  state: "done" | "current" | "upcoming";
  primaryAction: AdminOpsPrimaryAction | null;
  primaryButtonLabel: string | null;
};

function paymentInstructionNeedsApproval(status: InvoiceStatus | null): boolean {
  return status === "draft" || status === "review_pending";
}

function platformFeeNeedsPayment(
  input: AdminDealOpsInput,
): boolean {
  const { feeWaived } = resolveDealFeeRates(input.agreedPriceExTax);
  if (feeWaived) return false;
  return input.platformFeeStatus === "issued";
}

export function buildAdminDealOpsSteps(input: AdminDealOpsInput): AdminOpsStep[] {
  const { feeWaived } = resolveDealFeeRates(input.agreedPriceExTax);

  const step1Done =
    input.status !== "awaiting_payment" ||
    !paymentInstructionNeedsApproval(input.paymentInstructionStatus);
  const step1Current =
    input.status === "awaiting_payment" &&
    paymentInstructionNeedsApproval(input.paymentInstructionStatus);

  const partiesDone =
    input.status === "payout_ready" ||
    input.status === "payout_done" ||
    input.status === "completed";
  const partiesCurrent =
    !step1Current &&
    !partiesDone &&
    !["cancelled", "dispute", "inquiry", "negotiating", "agreed"].includes(input.status);

  const step3Done = input.status === "completed";
  const step3Current =
    input.status === "payout_ready" || input.status === "payout_done";

  const step4Done =
    feeWaived ||
    input.platformFeeStatus === "paid" ||
    input.platformFeeStatus === "cancelled" ||
    input.status === "inquiry" ||
    input.status === "negotiating";
  const step4Current =
    !step4Done &&
    platformFeeNeedsPayment(input) &&
    (input.sellerPaymentConfirmed || ["funded", "handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(input.status));

  const nameTransferOpen =
    input.requiresNameTransfer && !input.transferCompletedAt;
  const step5Done = !nameTransferOpen || !!input.transferCompletedAt;
  const step5Current =
    nameTransferOpen &&
    (input.status === "transfer_pending" ||
      input.status === "completed" ||
      input.transferOverdue);

  const deadlineNote = input.transferDeadlineAt
    ? `期限: ${formatTransferDeadline(input.transferDeadlineAt)}`
    : "期限未設定";

  const steps: Omit<AdminOpsStep, "number">[] = [
    {
      id: "approve_invoices",
      title: "入金指示書を承認して送る",
      summary: step1Done
        ? "買い手へ入金指示を送信済み。車両代金は買い手→売り手へ直接振込。"
        : "成約後、買い手が売り手へ振込できるよう入金指示書を承認します。",
      state: step1Done ? "done" : step1Current ? "current" : "upcoming",
      primaryAction: step1Current ? "approve_invoices" : null,
      primaryButtonLabel: step1Current ? "入金指示書を承認して送信" : null,
    },
    {
      id: "party_progress",
      title: "当事者の入金・引渡・完了確認",
      summary: partiesDone
        ? "双方の確認済み。次は運営が取引を閉じます。"
        : partiesCurrent
          ? `売り手入金確認: ${input.sellerPaymentConfirmed ? "済" : "待ち"} / 買い手振込報告: ${input.buyerPaymentReported ? "あり" : "—"} / 完了確認: 買${input.buyerConfirmed ? "済" : "未"}・売${input.sellerConfirmed ? "済" : "未"}`
          : "買い手の振込・売り手の入金確認・引渡・双方の完了確認を待ちます。",
      state: partiesDone ? "done" : partiesCurrent ? "current" : step1Done ? "upcoming" : "upcoming",
      primaryAction: null,
      primaryButtonLabel: null,
    },
    {
      id: "complete_deal",
      title: "取引を完了にする（運営）",
      summary: step3Done
        ? "MotoHub上の取引は完了です。"
        : "車両・書類の引渡しと双方確認が済んだら、ここで取引を閉じます（車両代金の送金操作ではありません）。",
      state: step3Done ? "done" : step3Current ? "current" : "upcoming",
      primaryAction: step3Current ? "complete_deal" : null,
      primaryButtonLabel: step3Current ? "取引を完了にする" : null,
    },
    {
      id: "platform_fee",
      title: "MotoHub手数料の入金確認",
      summary: feeWaived
        ? "30,000円以下のため手数料対象外。"
        : step4Done
          ? "売り手からの手数料入金を記録済み。"
          : "売り手入金確認後に発行された手数料請求書の入金を確認します。",
      state: feeWaived || step4Done ? "done" : step4Current ? "current" : "upcoming",
      primaryAction: step4Current ? "mark_platform_fee_paid" : null,
      primaryButtonLabel: step4Current ? "手数料の入金を確認した" : null,
    },
    {
      id: "name_transfer",
      title: "名義変更のフォロー",
      summary: !input.requiresNameTransfer
        ? "名義変更の対象外（車検残なし等）。"
        : input.transferCompletedAt
          ? "名義変更完了を記録済み。"
          : `${deadlineNote}${input.transferOverdue ? " · 期限超過" : ""}`,
      state: !input.requiresNameTransfer || step5Done ? "done" : step5Current ? "current" : "upcoming",
      primaryAction: null,
      primaryButtonLabel: null,
    },
  ];

  return steps.map((s, i) => ({ ...s, number: i + 1 }));
}

export function getCurrentAdminOpsStep(steps: AdminOpsStep[]): AdminOpsStep | null {
  return steps.find((s) => s.state === "current") ?? null;
}
