import type { DealStatus } from "@/lib/types";
import type { DealPartyRole } from "@/lib/deal-flow";

export type DealPrimaryAction =
  | "buyer_report_payment"
  | "seller_confirm_payment"
  | "mark_handover"
  | "buyer_confirm"
  | "seller_confirm"
  | null;

export type DealNextStep = {
  phase: string;
  stepNumber: number;
  stepTotal: number;
  title: string;
  instructions: string[];
  primaryAction: DealPrimaryAction;
  primaryButtonLabel: string | null;
  waitOnly: boolean;
  scrollTargetId: string | null;
};

export type DealNextStepOpts = {
  buyerConfirmed: boolean;
  sellerConfirmed: boolean;
  hasPickupScheduled: boolean;
  buyerPaymentReported: boolean;
};

export function getDealNextStep(
  status: DealStatus,
  role: DealPartyRole,
  opts: DealNextStepOpts,
): DealNextStep | null {
  if (status === "completed" || status === "cancelled" || status === "dispute") {
    return status === "completed"
      ? {
          phase: "完了",
          stepNumber: 4,
          stepTotal: 4,
          title: "取引が完了しました",
          instructions: ["ありがとうございました。履歴は成約履歴から確認できます。"],
          primaryAction: null,
          primaryButtonLabel: null,
          waitOnly: true,
          scrollTargetId: null,
        }
      : null;
  }

  if (role === "seller") {
    return getSellerNextStep(status, opts);
  }
  return getBuyerNextStep(status, opts);
}

function getSellerNextStep(
  status: DealStatus,
  opts: DealNextStepOpts,
): DealNextStep | null {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
      return {
        phase: "商談",
        stepNumber: 1,
        stepTotal: 4,
        title: "運営が商談・合意を進めます",
        instructions: ["合意後、この画面に入金・引渡の手順が表示されます。"],
        primaryAction: null,
        primaryButtonLabel: null,
        waitOnly: true,
        scrollTargetId: null,
      };
    case "awaiting_payment":
      return {
        phase: "入金確認",
        stepNumber: opts.buyerPaymentReported ? 4 : 2,
        stepTotal: 4,
        title: opts.buyerPaymentReported
          ? "買い手が振込済みと報告しています"
          : "買い手からの入金を確認してください",
        instructions: opts.buyerPaymentReported
          ? [
              "買い手が「振込した」と報告しました。運営にも通知済みです。",
              "① あなたの口座に着金したか確認。",
              "② 確認できたら、下の黄色いボタンをタップしてください。",
            ]
          : [
              "① 下の「請求・入金」で、買い手が振込む金額を確認できます。",
              "② 買い手の振込報告後、口座着金を確認したら、",
              "③ この画面の黄色いボタンをタップしてください。",
            ],
        primaryAction: "seller_confirm_payment",
        primaryButtonLabel: opts.buyerPaymentReported
          ? "④ 買い手からの入金を確認した"
          : "③ 買い手からの入金を確認した",
        waitOnly: false,
        scrollTargetId: opts.buyerPaymentReported
          ? "deal-primary-action"
          : "deal-billing",
      };
    case "funded":
      return {
        phase: "引渡",
        stepNumber: 3,
        stepTotal: 4,
        title: "車両・書類の引渡し",
        instructions: opts.hasPickupScheduled
          ? [
              "① 下の「引取・引渡」で引取予定日時を確認。",
              "② 現地で車両と書類を渡したら、黄色いボタンをタップ。",
            ]
          : [
              "① 買い手の引取予定日時の登録をお待ちください。",
              "② 登録後、現地で引渡したら黄色いボタンをタップ。",
            ],
        primaryAction: opts.hasPickupScheduled ? "mark_handover" : null,
        primaryButtonLabel: opts.hasPickupScheduled
          ? "② 車両・書類の引渡が完了した"
          : null,
        waitOnly: !opts.hasPickupScheduled,
        scrollTargetId: "deal-pickup",
      };
    case "handover_done":
    case "transfer_pending":
      if (opts.sellerConfirmed) {
        return {
          phase: "完了待ち",
          stepNumber: 4,
          stepTotal: 4,
          title: "あなたの確認は完了しています",
          instructions: ["買い手の確認または運営の処理をお待ちください。"],
          primaryAction: null,
          primaryButtonLabel: null,
          waitOnly: true,
          scrollTargetId: null,
        };
      }
      return {
        phase: "完了確認",
        stepNumber: 4,
        stepTotal: 4,
        title: "取引完了の最終確認",
        instructions: [
          "引渡しに問題がなければ、下の黄色いボタンをタップしてください。",
          "（名変がある場合は名変後でも構いません）",
        ],
        primaryAction: "seller_confirm",
        primaryButtonLabel: "取引完了を確認する（売り手）",
        waitOnly: false,
        scrollTargetId: "deal-primary-action",
      };
    case "payout_ready":
    case "payout_done":
      return {
        phase: "締結",
        stepNumber: 4,
        stepTotal: 4,
        title: "運営が取引を完了にします",
        instructions: [
          "車両代金は入金確認済みです。",
          "追加のボタン操作は不要です。完了までお待ちください。",
        ],
        primaryAction: null,
        primaryButtonLabel: null,
        waitOnly: true,
        scrollTargetId: null,
      };
    default:
      return null;
  }
}

function getBuyerNextStep(
  status: DealStatus,
  opts: DealNextStepOpts,
): DealNextStep | null {
  switch (status) {
    case "inquiry":
    case "negotiating":
    case "agreed":
      return {
        phase: "商談",
        stepNumber: 1,
        stepTotal: 4,
        title: "運営が商談・合意を進めます",
        instructions: ["合意後、入金・引取の手順が表示されます。"],
        primaryAction: null,
        primaryButtonLabel: null,
        waitOnly: true,
        scrollTargetId: null,
      };
    case "awaiting_payment":
      if (opts.buyerPaymentReported) {
        return {
          phase: "入金",
          stepNumber: 2,
          stepTotal: 4,
          title: "振込報告済み — 売り手の確認待ち",
          instructions: [
            "振込完了を売り手・運営に通知しました。",
            "売り手が口座入金を確認するまでお待ちください。",
            "確認後、引取予定日時の登録へ進みます。",
          ],
          primaryAction: null,
          primaryButtonLabel: null,
          waitOnly: true,
          scrollTargetId: "deal-billing",
        };
      }
      return {
        phase: "入金",
        stepNumber: 2,
        stepTotal: 4,
        title: "売り手へ車両代金を振込んでください",
        instructions: [
          "① 下の「請求・入金」で入金指示書（PDF）と振込先口座を開く。",
          "② 表示された税込金額を、売り手口座へ振込。",
          "③ 振込が終わったら、下の黄色いボタンをタップ（売り手・運営に知らせます）。",
        ],
        primaryAction: "buyer_report_payment",
        primaryButtonLabel: "③ 入金（振込）した — 売り手・運営に知らせる",
        waitOnly: false,
        scrollTargetId: "deal-billing",
      };
    case "funded":
      return {
        phase: "引取",
        stepNumber: 3,
        stepTotal: 4,
        title: "引取予定日時を登録してください",
        instructions: [
          "① 下の「引取・引渡」フォームで日時を入力して保存。",
          "② 現地で車両・書類を受け取ったら、後ほど完了確認ボタンを押します。",
        ],
        primaryAction: null,
        primaryButtonLabel: null,
        waitOnly: false,
        scrollTargetId: "deal-pickup",
      };
    case "handover_done":
    case "transfer_pending":
      if (opts.buyerConfirmed) {
        return {
          phase: "完了待ち",
          stepNumber: 4,
          stepTotal: 4,
          title: "あなたの確認は完了しています",
          instructions: ["売り手の確認または運営の処理をお待ちください。"],
          primaryAction: null,
          primaryButtonLabel: null,
          waitOnly: true,
          scrollTargetId: null,
        };
      }
      return {
        phase: "完了確認",
        stepNumber: 4,
        stepTotal: 4,
        title: "取引完了の最終確認",
        instructions: [
          "引渡しに問題がなければ、下の黄色いボタンをタップしてください。",
        ],
        primaryAction: "buyer_confirm",
        primaryButtonLabel: "取引完了を確認する（買い手）",
        waitOnly: false,
        scrollTargetId: "deal-primary-action",
      };
    case "payout_ready":
    case "payout_done":
      return {
        phase: "締結",
        stepNumber: 4,
        stepTotal: 4,
        title: "運営が取引を完了にします",
        instructions: ["追加の操作は不要です。完了までお待ちください。"],
        primaryAction: null,
        primaryButtonLabel: null,
        waitOnly: true,
        scrollTargetId: null,
      };
    default:
      return null;
  }
}
