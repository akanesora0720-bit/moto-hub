/** 税抜成約価格がこの金額未満なら売主手数料無料、以上なら売主10%（DB resolve_part_fee_rates と同期） */
export const PART_FEE_THRESHOLD_EX_TAX = 10_000;
export const PART_SELLER_FEE_RATE = 0.1;
export const PART_BUYER_FEE_RATE = 0;

export const PART_FEE_NOTICE =
  "成約時の手数料（税抜成約価格ベース）: 1万円未満は売主0% · 1万円以上は売主10% · 買主は常に0%。1万円以上の成約では売主宛に手数料請求書を発行します。";

export const PART_FEE_NOTICE_SHORT =
  "税抜1万円未満: 売主手数料0% · 税抜1万円以上: 売主10%（買主0%）";
