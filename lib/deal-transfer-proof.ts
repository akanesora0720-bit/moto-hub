export type DealTransferDocumentKind = "shaken_sho" | "inspection_record";

export type DealTransferDocument = {
  id: string;
  deal_id: string;
  document_kind: DealTransferDocumentKind;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  uploaded_by: string;
  uploaded_at: string;
  seller_acknowledged_at: string | null;
  seller_acknowledged_by: string | null;
};

export const DEAL_TRANSFER_DOCUMENT_KIND_LABELS: Record<
  DealTransferDocumentKind,
  string
> = {
  shaken_sho: "車検証",
  inspection_record: "自動車検査証記録事項",
};

export const DEAL_TRANSFER_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const DEAL_TRANSFER_PROOF_MAX_FILES = 3;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

export function isAllowedTransferProofMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function transferProofExtension(mime: string): string | null {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    default:
      return null;
  }
}

export function buildTransferProofStoragePath(
  dealId: string,
  documentId: string,
  mime: string,
): string | null {
  const ext = transferProofExtension(mime);
  if (!ext) return null;
  return `${dealId}/${documentId}.${ext}`;
}
