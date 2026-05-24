import type { MessageImportance, TrustRank } from "@/lib/types";

export const MESSAGE_IMPORTANCE_OPTIONS: {
  value: MessageImportance;
  label: string;
}[] = [
  { value: "normal", label: "通常" },
  { value: "important", label: "重要" },
  { value: "urgent", label: "緊急" },
];

export const BULK_FILTER_PRESETS: {
  id: string;
  label: string;
  filter: Record<string, string | boolean | null>;
}[] = [
  { id: "all", label: "全加盟店", filter: {} },
  { id: "gold", label: "GOLDのみ", filter: { trust_rank: "GOLD" } },
  { id: "blue", label: "BLUEのみ", filter: { trust_rank: "BLUE" } },
  { id: "yellow", label: "YELLOWのみ", filter: { trust_rank: "YELLOW" } },
  { id: "red", label: "REDのみ", filter: { trust_rank: "RED" } },
  { id: "not_banned", label: "BAN以外", filter: { exclude_banned: true } },
  { id: "active_deals", label: "取引中加盟店", filter: { active_deals: true } },
];

export type BulkFilterJson = {
  trust_rank?: TrustRank | null;
  prefecture?: string | null;
  exclude_banned?: boolean;
  active_deals?: boolean;
};
