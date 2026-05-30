import {
  BUYER_FEE_RATE,
  FEE_FREE_MAX_PRICE_EX_TAX,
  MONTHLY_MEMBERSHIP_FEE_BY_RANK,
  SELLER_FEE_RATE,
} from "@/lib/billing";
import {
  PART_BUYER_FEE_RATE,
  PART_FEE_THRESHOLD_EX_TAX,
  PART_SELLER_FEE_RATE,
} from "@/lib/part-fees";
import { TRUST_RANK_LABELS } from "@/lib/credit";
import type { TrustRank } from "@/lib/types";

export const FEE_SCHEDULE_ROWS = {
  vehicle: [
    { label: "買い手手数料", value: `${BUYER_FEE_RATE * 100}%（無料）` },
    {
      label: `税抜成約価格が${FEE_FREE_MAX_PRICE_EX_TAX.toLocaleString("ja-JP")}円未満`,
      value: "売主・買主とも手数料無料",
    },
    {
      label: `税抜成約価格が${FEE_FREE_MAX_PRICE_EX_TAX.toLocaleString("ja-JP")}円以上`,
      value: `売主 ${SELLER_FEE_RATE * 100}%（税抜＋消費税）`,
    },
    { label: "請求タイミング", value: "引取完了で計上 → 毎週月曜に週次請求書発行" },
    { label: "集計週", value: "土曜0:00〜金曜23:59（JST）" },
    { label: "支払期限", value: "発行日を含む3営業日" },
  ],
  parts: [
    { label: "買い手手数料", value: `${PART_BUYER_FEE_RATE * 100}%（無料）` },
    {
      label: `税抜成約価格が${PART_FEE_THRESHOLD_EX_TAX.toLocaleString("ja-JP")}円未満`,
      value: "売主手数料無料",
    },
    {
      label: `税抜成約価格が${PART_FEE_THRESHOLD_EX_TAX.toLocaleString("ja-JP")}円以上`,
      value: `売主 ${PART_SELLER_FEE_RATE * 100}%（税抜＋消費税）`,
    },
    { label: "請求タイミング", value: "発送または引渡完了で計上 → 毎週月曜に週次請求書発行" },
    { label: "車両との請求", value: "パーツ用・車両用は別請求書" },
  ],
  membership: (Object.keys(MONTHLY_MEMBERSHIP_FEE_BY_RANK) as TrustRank[]).map((rank) => ({
    label: TRUST_RANK_LABELS[rank],
    value: `税抜 ${MONTHLY_MEMBERSHIP_FEE_BY_RANK[rank].toLocaleString("ja-JP")}円／月`,
  })),
  inspection: [{ label: "Moto-Hub査定（完了時）", value: "税抜 3,000円／台" }],
} as const;
