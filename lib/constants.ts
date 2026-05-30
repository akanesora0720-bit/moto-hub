export { PREFECTURES } from "@/lib/prefectures";
export type { Prefecture } from "@/lib/prefectures";

export const CREDIT_RANKS = ["S", "A", "B", "C", "D"] as const;

/** 車種区分（排気量・車名と独立して登録） */
export const VEHICLE_CLASSES = [
  { value: "gentsuki_1", label: "原付一種（50cc以下）" },
  { value: "gentsuki_2", label: "原付二種（51〜125cc）" },
  { value: "medium", label: "中型（126〜400cc）" },
  { value: "large", label: "大型（401cc以上）" },
  { value: "three_wheel", label: "三輪（トライク）" },
  { value: "kid_bike", label: "キットバイク" },
  { value: "light_moped", label: "軽二輪（旧データ）" },
] as const;

export type VehicleClass = (typeof VEHICLE_CLASSES)[number]["value"];

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  gentsuki_1: "原付一種",
  gentsuki_2: "原付二種",
  light_moped: "軽二輪",
  medium: "中型",
  large: "大型",
  three_wheel: "三輪",
  kid_bike: "キットバイク",
};

export const MAKERS = [
  "Honda",
  "Yamaha",
  "Suzuki",
  "Kawasaki",
  "Harley-Davidson",
  "BMW",
  "Ducati",
  "Triumph",
  "KTM",
  "その他",
] as const;

export const FEE_RATE = 0.05;

export const MILEAGE_ROLLBACK_OPTIONS = [
  { value: "none", label: "申告なし（問題なし）" },
  { value: "suspected", label: "距離減算の疑いあり" },
  { value: "confirmed", label: "距離減算歴あり" },
] as const;

export type MileageRollbackStatus = (typeof MILEAGE_ROLLBACK_OPTIONS)[number]["value"];

export { ACCOUNT_STATUS_LABELS } from "@/lib/account-status";

export const VERIFICATION_STATUS_LABELS: Record<
  "unverified" | "pending" | "verified" | "rejected",
  string
> = {
  unverified: "未提出",
  pending: "確認中",
  verified: "確認済",
  rejected: "要再提出",
};
