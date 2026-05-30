import { resolveDealFeeRates } from "@/lib/billing";
import { formatTransferDeadline } from "@/lib/deal-flow";
import type { DealStatus, InvoiceStatus } from "@/lib/types";

export type AdminDealOpsInput = {
  status: DealStatus;
  agreedPriceExTax: number;
  paymentInstructionStatus: InvoiceStatus | null;
  pickupCompletedAt: string | null;
  feeAccrualStatus: string | null;
  weeklyFeeInvoiceStatus: InvoiceStatus | null;
  buyerPaymentReported: boolean;
  sellerPaymentConfirmed: boolean;
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  requiresNameTransfer: boolean;
  transferCompletedAt: string | null;
  transferDeadlineAt: string | null;
  transferOverdue: boolean;
};

export type AdminOpsPrimaryAction = "complete_deal" | "mark_platform_fee_paid";

export type AdminOpsStep = {
  id: string;
  number: number;
  title: string;
  summary: string;
  state: "done" | "current" | "upcoming" | "skipped";
  primaryAction: AdminOpsPrimaryAction | null;
  primaryButtonLabel: string | null;
};

function paymentInstructionWasIssued(status: InvoiceStatus | null): boolean {
  return status === "issued" || status === "paid";
}

function weeklyFeeNeedsPayment(input: AdminDealOpsInput): boolean {
  const { feeWaived } = resolveDealFeeRates(input.agreedPriceExTax);
  if (feeWaived) return false;
  return input.weeklyFeeInvoiceStatus === "issued";
}

export function buildAdminDealOpsSteps(input: AdminDealOpsInput): AdminOpsStep[] {
  const { feeWaived } = resolveDealFeeRates(input.agreedPriceExTax);

  const step1Issued = paymentInstructionWasIssued(input.paymentInstructionStatus);
  const step1Done = step1Issued || input.status !== "awaiting_payment";
  const step1Current = false;

  const partiesDone =
    input.status === "payout_ready" ||
    input.status === "payout_done" ||
    input.status === "completed";
  const partiesCurrent =
    !partiesDone &&
    !["cancelled", "dispute", "inquiry", "negotiating", "agreed"].includes(input.status);

  const step3Done = input.status === "completed";
  const step3Current =
    input.status === "payout_ready" || input.status === "payout_done";

  const step4Done =
    feeWaived ||
    input.weeklyFeeInvoiceStatus === "paid" ||
    input.weeklyFeeInvoiceStatus === "cancelled" ||
    input.feeAccrualStatus === "waived";
  const step4Current =
    !step4Done && weeklyFeeNeedsPayment(input);

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

  const feeSummary = feeWaived
    ? "30,000円未満のため手数料対象外。"
    : !input.pickupCompletedAt
      ? "引取完了後に週次請求へ計上（毎週月曜発行）。"
      : input.weeklyFeeInvoiceStatus === "paid"
        ? "週次手数料請求書の入金を記録済み。"
        : input.weeklyFeeInvoiceStatus === "issued"
          ? "週次手数料請求書発行済み。売り手の入金を確認してください。"
          : input.feeAccrualStatus === "invoiced"
            ? "週次請求書発行済み。"
            : "週次請求へ計上済み（翌月曜に請求書発行）。";

  const steps: Omit<AdminOpsStep, "number">[] = [
    {
      id: "approve_invoices",
      title: "入金指示書（自動送信）",
      summary: step1Issued
        ? "成約確定時に買い手へ入金指示書を自動送信済み。"
        : "成約確定後、入金指示書が自動送信されます。",
      state: step1Done ? "done" : step1Current ? "current" : "upcoming",
      primaryAction: null,
      primaryButtonLabel: null,
    },
    {
      id: "party_progress",
      title: "当事者の入金・引取・完了確認",
      summary: partiesDone
        ? "双方の確認済み。次は運営が取引を閉じます。"
        : partiesCurrent
          ? `売り手入金確認: ${input.sellerPaymentConfirmed ? "済" : "待ち"} / 買い手振込報告: ${input.buyerPaymentReported ? "あり" : "—"} / 引取完了: ${input.pickupCompletedAt ? "済" : "未"} / 完了確認: 買${input.buyerConfirmed ? "済" : "未"}・売${input.sellerConfirmed ? "済" : "未"}`
          : "買い手の振込・売り手の入金確認・引取完了・双方の完了確認を待ちます。",
      state: partiesDone ? "done" : partiesCurrent ? "current" : "upcoming",
      primaryAction: null,
      primaryButtonLabel: null,
    },
    {
      id: "complete_deal",
      title: "取引を完了にする（運営）",
      summary: step3Done
        ? "Moto-Hub上の取引は完了です。"
        : "引取完了・双方確認が済んだら、ここで取引を閉じます。",
      state: step3Done ? "done" : step3Current ? "current" : "upcoming",
      primaryAction: step3Current ? "complete_deal" : null,
      primaryButtonLabel: step3Current ? "取引を完了にする" : null,
    },
    {
      id: "platform_fee",
      title: "Moto-Hub手数料（週次請求）",
      summary: feeSummary,
      state: feeWaived || step4Done ? "done" : step4Current ? "current" : "upcoming",
      primaryAction: step4Current ? "mark_platform_fee_paid" : null,
      primaryButtonLabel: step4Current ? "週次手数料の入金を確認した" : null,
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
