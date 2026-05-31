import {
  DEAL_DOCUMENT_MAX_BYTES,
  DEAL_GENERATED_DOCS_BUCKET,
  DEAL_DOCUMENT_KIND_LABELS,
  storagePathForDealDocument,
} from "@/lib/deal-documents";
import type { DealGeneratedDocumentKind } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublishDealDocumentInput = {
  dealId: string;
  documentKind: DealGeneratedDocumentKind;
  sourceType: string;
  sourceId: string;
  title: string;
  fileName: string;
  pdfBytes: Uint8Array;
  metadata?: Record<string, unknown>;
  /** false = 登録のみ（再通知しない） */
  notify?: boolean;
};

export async function publishDealDocument(
  supabase: SupabaseClient,
  input: PublishDealDocumentInput,
): Promise<{ id: string; storagePath: string; created: boolean }> {
  if (input.pdfBytes.byteLength > DEAL_DOCUMENT_MAX_BYTES) {
    throw new Error(
      `PDF size exceeds limit (${DEAL_DOCUMENT_MAX_BYTES} bytes)`,
    );
  }

  const { data: existing } = await supabase
    .from("deal_generated_documents")
    .select("id, storage_path")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("document_kind", input.documentKind)
    .maybeSingle();

  const documentId = existing?.id ?? crypto.randomUUID();
  const storagePath =
    existing?.storage_path ??
    storagePathForDealDocument(input.dealId, input.documentKind, documentId);

  const { error: uploadError } = await supabase.storage
    .from(DEAL_GENERATED_DOCS_BUCKET)
    .upload(storagePath, input.pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`storage upload failed: ${uploadError.message}`);
  }

  const { data: row, error: regError } = await supabase.rpc(
    "register_deal_generated_document",
    {
      p_deal_id: input.dealId,
      p_document_kind: input.documentKind,
      p_storage_path: storagePath,
      p_file_name: input.fileName,
      p_byte_size: input.pdfBytes.byteLength,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId,
      p_title: input.title,
      p_metadata: input.metadata ?? {},
      p_notify: input.notify !== false,
    },
  );

  if (regError) {
    await supabase.storage.from(DEAL_GENERATED_DOCS_BUCKET).remove([storagePath]);
    throw new Error(`register document failed: ${regError.message}`);
  }

  const doc = row as { id: string };
  return { id: doc.id, storagePath, created: true };
}

export function dealDocumentTitle(
  kind: DealGeneratedDocumentKind,
  detail?: string,
): string {
  const base = DEAL_DOCUMENT_KIND_LABELS[kind];
  return detail ? `${base}（${detail}）` : base;
}
