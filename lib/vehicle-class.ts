import type { VehicleClass } from "@/lib/constants";

/** 車種区分の排気量境界（Moto-Hub 運用ルール） */
export const VEHICLE_CLASS_CC = {
  gentsuki1Max: 50,
  gentsuki2Max: 125,
  mediumMax: 400,
} as const;

const TRIKE_PATTERN =
  /トライク|三輪|３輪|3輪|スパイダー|Spyder|トライデント|Trike|タンデムトライク/i;

const KIT_BIKE_PATTERN =
  /キットバイク|組立|組み立て|ビルドタンク|ビルドキット|キット車/i;

/** AI・画面表記の車種区分 → DB enum */
const VEHICLE_CLASS_ALIASES: Record<string, VehicleClass> = {
  gentsuki_1: "gentsuki_1",
  gentsuki1: "gentsuki_1",
  原付一種: "gentsuki_1",
  原付1種: "gentsuki_1",
  原付１種: "gentsuki_1",
  gentsuki_2: "gentsuki_2",
  gentsuki2: "gentsuki_2",
  原付二種: "gentsuki_2",
  原付2種: "gentsuki_2",
  原付２種: "gentsuki_2",
  light_moped: "light_moped",
  軽二輪: "light_moped",
  medium: "medium",
  中型: "medium",
  large: "large",
  大型: "large",
  three_wheel: "three_wheel",
  三輪: "three_wheel",
  kid_bike: "kid_bike",
  kit_bike: "kid_bike",
  キットバイク: "kid_bike",
  キッドバイク: "kid_bike",
};

export function parseVehicleClassFromAi(raw: unknown): VehicleClass | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.trim().replace(/\s+/g, "");
  return VEHICLE_CLASS_ALIASES[key] ?? VEHICLE_CLASS_ALIASES[raw.trim()] ?? null;
}

/** 排気量のみから推定（三輪・キットは判定しない） */
export function inferVehicleClassFromCc(cc: number | null): VehicleClass | "" {
  if (cc == null || cc <= 0) return "";
  if (cc <= VEHICLE_CLASS_CC.gentsuki1Max) return "gentsuki_1";
  if (cc <= VEHICLE_CLASS_CC.gentsuki2Max) return "gentsuki_2";
  if (cc <= VEHICLE_CLASS_CC.mediumMax) return "medium";
  return "large";
}

function combinedVehicleText(parts: {
  maker?: string | null;
  model?: string | null;
  comment?: string | null;
}): string {
  return [parts.maker, parts.model, parts.comment].filter(Boolean).join(" ");
}

export function isTrikeVehicleText(text: string): boolean {
  return TRIKE_PATTERN.test(text);
}

export function isKitBikeVehicleText(text: string): boolean {
  return KIT_BIKE_PATTERN.test(text);
}

export type ResolveVehicleClassInput = {
  maker?: string | null;
  model?: string | null;
  displacement_cc?: number | null;
  comment?: string | null;
  /** Vision API が返した vehicle_class（任意） */
  ai_vehicle_class?: unknown;
};

/**
 * 車種区分を決定。三輪・キットバイクを車名で優先し、それ以外は排気量。
 * 表記が「50cc」「125cc」の在庫表記も displacement_cc パース後に境界へマップされる。
 */
export function resolveVehicleClass(input: ResolveVehicleClassInput): VehicleClass | "" {
  const fromAi = parseVehicleClassFromAi(input.ai_vehicle_class);
  const text = combinedVehicleText(input);

  if (isTrikeVehicleText(text)) return "three_wheel";
  if (isKitBikeVehicleText(text)) return "kid_bike";

  const fromCc = inferVehicleClassFromCc(input.displacement_cc ?? null);
  if (fromCc) return fromCc;

  if (fromAi === "three_wheel" || fromAi === "kid_bike") return fromAi;
  if (fromAi) return fromAi;

  return "";
}

export const VEHICLE_CLASS_HINT =
  "原付一種≦50cc・原付二種51〜125cc・中型126〜400cc・大型401cc〜。三輪は排気量不問。キットバイクは組立車等。";
