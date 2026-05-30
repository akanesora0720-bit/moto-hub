import type { VehicleClass } from "@/lib/constants";
import {
  inferVehicleClassFromCc,
  resolveVehicleClass,
  type ResolveVehicleClassInput,
} from "@/lib/vehicle-class";

export { inferVehicleClassFromCc, resolveVehicleClass, type ResolveVehicleClassInput };

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
  vehicle_class: VehicleClass | null;
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
  raw_extract?: Record<string, unknown> | null;
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

/** "400cc" / 400 → 400 */
export function parseDisplacementCcFromAi(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 10000) {
    return Math.round(raw);
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  if (/未記入|不明|−|-/.test(s) && !/\d/.test(s)) return null;
  const cc = s.match(/(\d{2,4})\s*cc/i);
  if (cc) return parseInt(cc[1], 10);
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return n > 0 && n < 10000 ? n : null;
}

/** "2023年" / 2023 → 2023。未記入は null */
export function parseModelYearFromAi(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const y = Math.round(raw);
    if (y >= 1950 && y <= 2100) return y;
    if (y >= 50 && y <= 99) return 1900 + y;
    return null;
  }
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  if (/未記入|不明/.test(s)) return null;
  const jp = s.match(/(19|20)\d{2}\s*年?/);
  if (jp) return parseInt(jp[0].replace(/\D/g, "").slice(0, 4), 10);
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length === 4) {
    const y = parseInt(digits, 10);
    if (y >= 1950 && y <= 2100) return y;
  }
  return null;
}

/** "走行距離2843Km" / 2843 → 2843 */
export function parseMileageKmFromAi(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  if (/未記入|不明/.test(s) && !/\d/.test(s)) return null;
  const labeled = s.match(/走行(?:距離)?\s*([\d,]+)\s*(?:km|Km|KM|キロ)?/i);
  if (labeled) return parseInt(labeled[1].replace(/,/g, ""), 10);
  const km = s.match(/([\d,]+)\s*(?:km|Km|KM)/i);
  if (km) return parseInt(km[1].replace(/,/g, ""), 10);
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
}

function pickStringField(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickFromSpecBlob(blob: string): {
  displacement_cc: number | null;
  year: number | null;
  mileage: number | null;
  color: string | null;
  inspection_text: string | null;
} {
  const displacement_cc = parseDisplacementCcFromAi(blob);
  const year = parseModelYearFromAi(blob);
  const mileage = parseMileageKmFromAi(blob);
  const inspection = blob.match(/検\s*((?:19|20)\d{2}年\d{1,2}月)/);
  const inspection_text = inspection ? inspection[0].replace(/\s+/g, "") : null;
  let color: string | null = null;
  const colorMatch = blob.match(/色[：:\s]+([^0-9０-９\n]+?)(?:\s+車台|車体|$)/);
  if (colorMatch) color = colorMatch[1].trim();
  return { displacement_cc, year, mileage, color, inspection_text };
}

export function normalizeAiVehicle(raw: Record<string, unknown>): AiExtractedVehicle {
  const confRaw = (raw.confidence ?? raw.field_confidence ?? {}) as Record<string, unknown>;
  const confidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(confRaw)) {
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) confidence[k] = n;
  }

  const specBlob = [
    raw.spec_line,
    raw.specs_line,
    raw.specs,
    raw.details,
    raw.description,
    raw.subtitle,
  ]
    .filter((v) => typeof v === "string")
    .join(" ");
  const fromSpec = specBlob.trim() ? pickFromSpecBlob(specBlob) : null;

  const displacement_cc =
    parseDisplacementCcFromAi(raw.displacement_cc) ??
    parseDisplacementCcFromAi(raw.displacement) ??
    parseDisplacementCcFromAi(raw["排気量"]) ??
    fromSpec?.displacement_cc ??
    null;

  const year =
    parseModelYearFromAi(raw.year) ??
    parseModelYearFromAi(raw["年式"]) ??
    fromSpec?.year ??
    null;

  const mileage =
    parseMileageKmFromAi(raw.mileage) ??
    parseMileageKmFromAi(raw["走行距離"]) ??
    parseMileageKmFromAi(raw.distance_km) ??
    fromSpec?.mileage ??
    null;

  const color =
    pickStringField(raw, ["color", "色", "カラー"]) ?? fromSpec?.color ?? null;

  const maker =
    pickStringField(raw, ["maker", "メーカー", "manufacturer"]) ??
    (typeof raw.maker === "string" ? raw.maker.trim() || null : null);
  const model =
    pickStringField(raw, ["model", "車種名", "車名", "model_name"]) ??
    (typeof raw.model === "string" ? raw.model.trim() || null : null);
  const comment =
    typeof raw.comment === "string" ? raw.comment.trim() || null : null;

  const vehicle_class =
    resolveVehicleClass({
      maker,
      model,
      displacement_cc,
      comment,
      ai_vehicle_class: raw.vehicle_class ?? raw["車種区分"],
    }) || null;

  return {
    maker,
    model,
    displacement_cc,
    year,
    mileage,
    inspection_text:
      pickStringField(raw, ["inspection_text", "車検", "inspection"]) ??
      fromSpec?.inspection_text ??
      null,
    insurance_text:
      typeof raw.insurance_text === "string" ? raw.insurance_text.trim() || null : null,
    color: typeof raw.color === "string" ? raw.color.trim() || null : null,
    frame_number:
      pickStringField(raw, ["frame_number", "車台番号", "車体番号", "chassis_number"]) ??
      null,
    price_ex_tax: parseYenFromAi(raw.price_ex_tax),
    total_price_inc_tax: parseYenFromAi(raw.total_price_inc_tax),
    repair_history:
      typeof raw.repair_history === "string" ? raw.repair_history.trim() || null : null,
    warranty_text:
      typeof raw.warranty_text === "string" ? raw.warranty_text.trim() || null : null,
    maintenance_text:
      typeof raw.maintenance_text === "string" ? raw.maintenance_text.trim() || null : null,
    comment,
    vehicle_class,
    confidence,
  };
}
