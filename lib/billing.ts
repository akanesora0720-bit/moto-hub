import type { TrustRank } from "@/lib/types";

export const BUYER_FEE_RATE = 0;
export const SELLER_FEE_RATE = 0.05;
/** 税抜成約価格がこの金額未満なら手数料無料、以上なら売主5%（DB resolve_deal_fee_rates と同期） */
export const FEE_FREE_MAX_PRICE_EX_TAX = 30_000;
export const MIN_FEE_EX_TAX = 0;
export const CONSUMPTION_TAX_RATE = 0.1;
export const PAYMENT_DUE_DAYS = 7;

/** 加盟店月額会費（税抜）— DB system_settings.billing.monthly_membership_fee_by_rank と同期 */
export const MONTHLY_MEMBERSHIP_FEE_BY_RANK: Record<TrustRank, number> = {
  GOLD: 15_000,
  BLUE: 18_000,
  YELLOW: 25_000,
  RED: 30_000,
};

/** @deprecated 単一金額。ランク別は MONTHLY_MEMBERSHIP_FEE_BY_RANK を使用 */
export const MONTHLY_MEMBERSHIP_FEE_EX_TAX = MONTHLY_MEMBERSHIP_FEE_BY_RANK.GOLD;

export const MONTHLY_MEMBERSHIP_ISSUE_DAY = 20;
export const MONTHLY_MEMBERSHIP_DUE_DAY = 26;

export function monthlyMembershipFeeExTax(rank: TrustRank): number {
  return MONTHLY_MEMBERSHIP_FEE_BY_RANK[rank] ?? MONTHLY_MEMBERSHIP_FEE_EX_TAX;
}

export function monthlyMembershipFeeIncTax(rank: TrustRank): number {
  const ex = monthlyMembershipFeeExTax(rank);
  return ex + calcTax(ex);
}

export type FeeTier = "waived_low_price" | "standard";

export type ResolvedFeeRates = {
  buyerFeeRate: number;
  sellerFeeRate: number;
  feeTier: FeeTier;
  feeWaived: boolean;
};

/** 税抜車両価格に応じた手数料率（DB resolve_deal_fee_rates と同一） */
export function resolveDealFeeRates(vehiclePriceExTax: number): ResolvedFeeRates {
  if (vehiclePriceExTax < FEE_FREE_MAX_PRICE_EX_TAX) {
    return {
      buyerFeeRate: 0,
      sellerFeeRate: 0,
      feeTier: "waived_low_price",
      feeWaived: true,
    };
  }
  return {
    buyerFeeRate: 0,
    sellerFeeRate: SELLER_FEE_RATE,
    feeTier: "standard",
    feeWaived: false,
  };
}

export function calcFeeExTax(
  amountExTax: number,
  rate: number,
  minExTax = MIN_FEE_EX_TAX,
): number {
  if (rate <= 0) return 0;
  const fee = Math.round(amountExTax * rate);
  if (minExTax <= 0) return fee;
  return Math.max(minExTax, fee);
}

export function calcTax(amountExTax: number): number {
  return Math.round(amountExTax * CONSUMPTION_TAX_RATE);
}

export function calcVehiclePriceIncTax(vehiclePriceExTax: number): number {
  return vehiclePriceExTax + calcTax(vehiclePriceExTax);
}

export type DealBillingSummary = {
  vehiclePriceExTax: number;
  vehicleTax: number;
  buyerTotalIncTax: number;
  platformFeeExTax: number;
  platformFeeTax: number;
  platformFeeIncTax: number;
  sellerReceivesIncTax: number;
  feeTier: FeeTier;
  feeWaived: boolean;
};

export function summarizeDealBilling(vehiclePriceExTax: number): DealBillingSummary {
  const { sellerFeeRate, feeTier, feeWaived } = resolveDealFeeRates(vehiclePriceExTax);
  const vehicleTax = calcTax(vehiclePriceExTax);
  const platformFeeExTax = calcFeeExTax(vehiclePriceExTax, sellerFeeRate, 0);
  const platformFeeTax = calcTax(platformFeeExTax);

  return {
    vehiclePriceExTax,
    vehicleTax,
    buyerTotalIncTax: vehiclePriceExTax + vehicleTax,
    platformFeeExTax,
    platformFeeTax,
    platformFeeIncTax: platformFeeExTax + platformFeeTax,
    sellerReceivesIncTax: vehiclePriceExTax + vehicleTax,
    feeTier,
    feeWaived,
  };
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export function formatBankAccount(profile: {
  bank_name?: string | null;
  bank_branch?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  bank_account_holder?: string | null;
}): string | null {
  if (!profile.bank_name || !profile.bank_account_number) return null;
  const type = profile.bank_account_type ?? "普通";
  const branch = profile.bank_branch ? ` ${profile.bank_branch}支店` : "";
  return `${profile.bank_name}${branch} ${type} ${profile.bank_account_number} ${profile.bank_account_holder ?? ""}`.trim();
}

export const DOCUMENT_KIND_LABELS: Record<
  | "legacy"
  | "payment_instruction"
  | "platform_fee"
  | "motohub_inspection"
  | "monthly_membership"
  | "part_payment_instruction"
  | "part_platform_fee"
  | "weekly_vehicle_platform_fee"
  | "weekly_part_platform_fee",
  string
> = {
  legacy: "請求書",
  payment_instruction: "入金指示書",
  platform_fee: "Moto-Hub手数料請求書",
  motohub_inspection: "Moto-Hub査定",
  monthly_membership: "月額会費請求書",
  part_payment_instruction: "パーツ入金指示書",
  part_platform_fee: "パーツ手数料請求書",
  weekly_vehicle_platform_fee: "車両手数料請求書（週次）",
  weekly_part_platform_fee: "パーツ手数料請求書（週次）",
};

export const MONTHLY_PAYMENT_STATUS_LABELS: Record<
  "reported" | "unconfirmed" | "confirmed" | "rejected",
  string
> = {
  reported: "報告済",
  unconfirmed: "未確認",
  confirmed: "確認済",
  rejected: "差戻し",
};

export const PAYOUT_STATUS_LABELS: Record<
  "awaiting" | "ready" | "paid" | "cancelled",
  string
> = {
  awaiting: "振込待ち",
  ready: "双方確認済（運営完了待ち）",
  paid: "振込済",
  cancelled: "取消",
};

export const INVOICE_STATUS_LABELS: Record<
  "draft" | "review_pending" | "issued" | "paid" | "cancelled",
  string
> = {
  draft: "下書き",
  review_pending: "確認待ち",
  issued: "送信済",
  paid: "入金確認済",
  cancelled: "取消",
};
