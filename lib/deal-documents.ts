import type { DealGeneratedDocumentKind } from "@/lib/types";

/** Storage 1ファイルあたりの上限（バイト）。DB制約・バケット設定と一致 */
export const DEAL_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

export const DEAL_DOCUMENT_SIGNED_URL_TTL_SEC = 3600;

export const DEAL_GENERATED_DOCS_BUCKET = "deal-generated-docs";

export const DEAL_DOCUMENT_KIND_LABELS: Record<DealGeneratedDocumentKind, string> = {
  sales_certificate: "販売証明書",
  invoice: "請求書",
  receipt: "領収書",
  contract: "契約書",
  vehicle_inspection: "車検証",
  name_transfer: "名義変更書類",
};

export function dealDocumentDownloadPath(documentId: string): string {
  return `/api/deal-documents/${documentId}/download`;
}

export function storagePathForDealDocument(
  dealId: string,
  kind: DealGeneratedDocumentKind,
  documentId: string,
): string {
  return `${dealId}/${kind}/${documentId}.pdf`;
}

export function invoiceToDealDocumentKind(
  documentKind: string | null | undefined,
): DealGeneratedDocumentKind {
  return "invoice";
}
