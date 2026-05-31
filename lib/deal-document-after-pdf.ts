import {
  dealDocumentTitle,
  publishDealDocument,
} from "@/lib/deal-document-publish";
import type { DealGeneratedDocumentKind } from "@/lib/types";
import { createServiceClient } from "@/lib/server-supabase";

/** PDF API 生成後に Storage 登録・通知（失敗時は PDF 応答のみ継続） */
export async function publishDealDocumentAfterPdf(input: {
  dealId: string | null | undefined;
  documentKind: DealGeneratedDocumentKind;
  sourceType: string;
  sourceId: string;
  title: string;
  fileName: string;
  pdfBytes: Uint8Array;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!input.dealId) return;

  try {
    const service = createServiceClient();
    await publishDealDocument(service, {
      dealId: input.dealId,
      documentKind: input.documentKind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      fileName: input.fileName,
      pdfBytes: input.pdfBytes,
      metadata: input.metadata,
      notify: true,
    });
  } catch (e) {
    console.error("publishDealDocumentAfterPdf:", e);
  }
}

export { dealDocumentTitle };
