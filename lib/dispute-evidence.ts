export type DisputeEvidenceItem = {
  id: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
};

export const DISPUTE_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const DISPUTE_EVIDENCE_MAX_FILES = 5;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
]);

export function isAllowedDisputeEvidenceMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

function evidenceExtension(mime: string): string | null {
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
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    default:
      return null;
  }
}

export function buildDisputeEvidenceStoragePath(
  dealId: string,
  evidenceId: string,
  mime: string,
): string | null {
  const ext = evidenceExtension(mime);
  if (!ext) return null;
  return `${dealId}/dispute-evidence/${evidenceId}.${ext}`;
}
