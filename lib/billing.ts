export const BUYER_FEE_RATE = 0;
export const SELLER_FEE_RATE = 0.05;
export const MIN_FEE_EX_TAX = 5000;
export const CONSUMPTION_TAX_RATE = 0.1;

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

export type DealBillingSummary = {
  vehiclePriceExTax: number;
  buyerFeeExTax: number;
  buyerFeeTax: number;
  buyerTotalIncTax: number;
  sellerFeeExTax: number;
  sellerFeeTax: number;
  sellerPayoutAmount: number;
};

export function summarizeDealBilling(
  vehiclePriceExTax: number,
  buyerFeeRate = BUYER_FEE_RATE,
  sellerFeeRate = SELLER_FEE_RATE,
): DealBillingSummary {
  const buyerFeeExTax = calcFeeExTax(vehiclePriceExTax, buyerFeeRate, 0);
  const sellerFeeExTax = calcFeeExTax(vehiclePriceExTax, sellerFeeRate, 0);
  const buyerFeeTax = calcTax(buyerFeeExTax);
  const sellerFeeTax = calcTax(sellerFeeExTax);

  return {
    vehiclePriceExTax,
    buyerFeeExTax,
    buyerFeeTax,
    buyerTotalIncTax: vehiclePriceExTax + buyerFeeExTax + buyerFeeTax,
    sellerFeeExTax,
    sellerFeeTax,
    sellerPayoutAmount: vehiclePriceExTax - sellerFeeExTax - sellerFeeTax,
  };
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

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
  ready: "振込準備完了",
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
