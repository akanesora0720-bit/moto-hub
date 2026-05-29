export type PartInquiryMessageRow = {
  id: string;
  sender_user_id: string;
  sender_label: string | null;
  message: string;
  attachment_paths: string[] | unknown;
  created_at: string;
};

export function formatPartInquiryMessageTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
