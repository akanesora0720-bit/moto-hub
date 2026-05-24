import type { SupportTicketCategory, SupportTicketStatus } from "@/lib/types";

export const SUPPORT_CATEGORIES: {
  value: SupportTicketCategory;
  label: string;
}[] = [
  { value: "name_transfer", label: "名義変更" },
  { value: "documents", label: "書類" },
  { value: "payment", label: "入金" },
  { value: "deal", label: "取引" },
  { value: "billing", label: "請求" },
  { value: "system", label: "システム不具合" },
  { value: "other", label: "その他" },
];

export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "未対応",
  reviewing: "対応中",
  answered: "回答済",
  closed: "クローズ",
};

export function supportCategoryLabel(cat: SupportTicketCategory): string {
  return SUPPORT_CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
