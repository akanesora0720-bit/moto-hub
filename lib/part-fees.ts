/** 税抜成約価格がこの金額未満なら売主手数料無料、以上なら売主10%（DB resolve_part_fee_rates と同期） */
export const PART_FEE_THRESHOLD_EX_TAX = 10_000;
export const PART_SELLER_FEE_RATE = 0.1;
export const PART_BUYER_FEE_RATE = 0;

export const PART_FEE_NOTICE =
  "成約時の手数料（税抜成約価格ベース）: 1万円未満は売主0% · 1万円以上は売主10% · 買主は常に0%。発送または引渡完了後に週次計上し、毎週月曜に売主宛て請求書を発行（車両手数料とは別請求）。";

export const PART_FEE_NOTICE_SHORT =
  "税抜1万円未満: 売主0% · 1万円以上: 売主10%（買主0%）· 週次請求（月曜発行）";
