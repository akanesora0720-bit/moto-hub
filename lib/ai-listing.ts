import type { VehicleClass } from "@/lib/constants";

/** AIが返す1台分の抽出結果 */
export type AiExtractedVehicle = {
  maker: string | null;
  model: string | null;
  displacement_cc: number | null;
  year: number | null;
  mileage: number | null;
  inspection_text: string | null;
  insurance_text: string | null;
  color: string | null;
  frame_number: string | null;
  price_ex_tax: number | null;
  total_price_inc_tax: number | null;
  repair_history: string | null;
  warranty_text: string | null;
  maintenance_text: string | null;
  comment: string | null;
  confidence: Record<string, number>;
};

export type AiListingDraftItemRow = {
  id: string;
  job_id: string;
  sort_order: number;
  maker: string | null;
  model: string | null;
  displacement_cc: number | null;
  year: number | null;
  mileage: number | null;
  inspection_text: string | null;
  insurance_text: string | null;
  color: string | null;
  frame_number: string | null;
  price_ex_tax: number | null;
  total_price_inc_tax: number | null;
  repair_history: string | null;
  warranty_text: string | null;
  maintenance_text: string | null;
  comment: string | null;
  field_confidence: Record<string, number>;
  listing_id: string | null;
  saved_at: string | null;
};

export const AI_LISTING_FIELD_LABELS: Record<string, string> = {
  maker: "メーカー",
  model: "車種名",
  displacement_cc: "排気量",
  year: "年式",
  mileage: "走行距離",
  inspection_text: "車検",
  insurance_text: "保険",
  color: "色",
  frame_number: "車体番号",
  price_ex_tax: "本体価格（税抜）",
  total_price_inc_tax: "支払総額",
  repair_history: "修復歴",
  warranty_text: "保証",
  maintenance_text: "整備",
  comment: "コメント",
  vehicle_class: "車種区分",
};

export const AI_CONFIDENCE_WARN_THRESHOLD = 0.75;

export function confidencePercent(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function isLowConfidence(value: number | undefined): boolean {
  if (value == null || !Number.isFinite(value)) return true;
  return value < AI_CONFIDENCE_WARN_THRESHOLD;
}

/** 万円表記・カンマ付き文字列を円整数に */
export function parseYenFromAi(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    if (raw < 10000) return Math.round(raw * 10000);
    return Math.round(raw);
  }
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[,，\s]/g, "");
  const man = s.match(/([\d.]+)\s*万/);
  if (man) {
    const n = parseFloat(man[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 10000);
  }
  const digits = s.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = parseFloat(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 10000 && /万/.test(raw)) return Math.round(n * 10000);
  return Math.round(n);
}

export function buildDraftConditionComment(item: {
  color?: string | null;
  inspection_text?: string | null;
  insurance_text?: string | null;
  repair_history?: string | null;
  warranty_text?: string | null;
  maintenance_text?: string | null;
  comment?: string | null;
  total_price_inc_tax?: number | null;
}): string {
  const parts: string[] = [];
  if (item.comment?.trim()) parts.push(item.comment.trim());
  if (item.color?.trim()) parts.push(`色: ${item.color.trim()}`);
  if (item.inspection_text?.trim()) parts.push(`車検: ${item.inspection_text.trim()}`);
  if (item.insurance_text?.trim()) parts.push(`保険: ${item.insurance_text.trim()}`);
  if (item.repair_history?.trim()) parts.push(`修復歴: ${item.repair_history.trim()}`);
  if (item.warranty_text?.trim()) parts.push(`保証: ${item.warranty_text.trim()}`);
  if (item.maintenance_text?.trim()) parts.push(`整備: ${item.maintenance_text.trim()}`);
  if (item.total_price_inc_tax != null && item.total_price_inc_tax > 0) {
    parts.push(`支払総額（参考）: ${item.total_price_inc_tax.toLocaleString("ja-JP")}円`);
  }
  return parts.join("\n") || "（AI出品サポートから作成した下書き）";
}

export function inferVehicleClassFromCc(cc: number | null): VehicleClass | "" {
  if (cc == null || cc <= 0) return "";
  if (cc <= 50) return "gentsuki_1";
  if (cc <= 125) return "gentsuki_2";
  return "light_moped";
}

export function normalizeAiVehicle(raw: Record<string, unknown>): AiExtractedVehicle {
  const confRaw = (raw.confidence ?? raw.field_confidence ?? {}) as Record<string, unknown>;
  const confidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(confRaw)) {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) confidence[k] = n;
  }

  const num = (k: string) => {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string" && v.trim()) {
      const n = parseInt(v.replace(/[^\d]/g, ""), 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  return {
    maker: typeof raw.maker === "string" ? raw.maker.trim() || null : null,
    model: typeof raw.model === "string" ? raw.model.trim() || null : null,
    displacement_cc: num("displacement_cc"),
    year: num("year"),
    mileage: num("mileage"),
    inspection_text:
      typeof raw.inspection_text === "string" ? raw.inspection_text.trim() || null : null,
    insurance_text:
      typeof raw.insurance_text === "string" ? raw.insurance_text.trim() || null : null,
    color: typeof raw.color === "string" ? raw.color.trim() || null : null,
    frame_number:
      typeof raw.frame_number === "string" ? raw.frame_number.trim() || null : null,
    price_ex_tax: parseYenFromAi(raw.price_ex_tax),
    total_price_inc_tax: parseYenFromAi(raw.total_price_inc_tax),
    repair_history:
      typeof raw.repair_history === "string" ? raw.repair_history.trim() || null : null,
    warranty_text:
      typeof raw.warranty_text === "string" ? raw.warranty_text.trim() || null : null,
    maintenance_text:
      typeof raw.maintenance_text === "string" ? raw.maintenance_text.trim() || null : null,
    comment: typeof raw.comment === "string" ? raw.comment.trim() || null : null,
    confidence,
  };
}
