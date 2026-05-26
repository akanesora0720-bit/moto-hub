"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  DEAL_TRANSFER_DOCUMENT_KIND_LABELS,
  DEAL_TRANSFER_PROOF_MAX_BYTES,
  DEAL_TRANSFER_PROOF_MAX_FILES,
  buildTransferProofStoragePath,
  isAllowedTransferProofMime,
  type DealTransferDocument,
  type DealTransferDocumentKind,
} from "@/lib/deal-transfer-proof";
import { formatPickupSchedule } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus } from "@/lib/types";

export function DealTransferProofPanel({
  dealId,
  status,
  requiresNameTransfer,
  viewerRole,
  readOnly = false,
  documents: initialDocuments,
}: {
  dealId: string;
  status: DealStatus;
  requiresNameTransfer: boolean;
  viewerRole: "buyer" | "seller" | "admin";
  readOnly?: boolean;
  documents: DealTransferDocument[];
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [kind, setKind] = useState<DealTransferDocumentKind>("shaken_sho");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const canUpload =
    !readOnly &&
    viewerRole === "buyer" &&
    status === "transfer_pending" &&
    requiresNameTransfer &&
    documents.length < DEAL_TRANSFER_PROOF_MAX_FILES;

  const canAcknowledge = viewerRole === "seller" || viewerRole === "admin";

  const refreshList = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_deal_transfer_documents", {
      p_deal_id: dealId,
    });
    if (!error && data) {
      setDocuments(data as DealTransferDocument[]);
    }
    router.refresh();
  }, [dealId, router]);

  const upload = async () => {
    if (!file) {
      setMessage("ファイルを選択してください。");
      return;
    }
    if (!isAllowedTransferProofMime(file.type)) {
      setMessage("PDF または画像（JPEG/PNG/HEIC）のみアップロードできます。");
      return;
    }
    if (file.size > DEAL_TRANSFER_PROOF_MAX_BYTES) {
      setMessage("ファイルサイズは 10MB 以下にしてください。");
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const documentId = crypto.randomUUID();
    const storagePath = buildTransferProofStoragePath(dealId, documentId, file.type);
    if (!storagePath) {
      setMessage("このファイル形式はアップロードできません。");
      setLoading(false);
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from("deal-docs")
      .upload(storagePath, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setLoading(false);
      setMessage(uploadError.message);
      return;
    }

    const { error: regError } = await supabase.rpc("register_deal_transfer_document", {
      p_deal_id: dealId,
      p_document_id: documentId,
      p_document_kind: kind,
      p_storage_path: storagePath,
      p_original_filename: file.name,
      p_mime_type: file.type,
      p_byte_size: file.size,
    });

    setLoading(false);
    if (regError) {
      await supabase.storage.from("deal-docs").remove([storagePath]);
      setMessage(regError.message);
      return;
    }

    setFile(null);
    setMessage("アップロードしました。売り手に通知されます。");
    await refreshList();
  };

  const openDocument = async (doc: DealTransferDocument) => {
    setOpeningId(doc.id);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("deal-docs")
      .createSignedUrl(doc.storage_path, 300);
    setOpeningId(null);
    if (error || !data?.signedUrl) {
      setMessage(error?.message ?? "ファイルを開けませんでした。");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const acknowledge = async (documentId: string) => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("seller_acknowledge_transfer_document", {
      p_document_id: documentId,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("確認済みにしました。");
    await refreshList();
  };

  const removeDoc = async (documentId: string) => {
    if (!confirm("この添付を削除しますか？")) return;
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const doc = documents.find((d) => d.id === documentId);
    const { error } = await supabase.rpc("delete_deal_transfer_document", {
      p_document_id: documentId,
    });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }
    if (doc) {
      await supabase.storage.from("deal-docs").remove([doc.storage_path]);
    }
    setLoading(false);
    setMessage("削除しました。");
    await refreshList();
  };

  if (!requiresNameTransfer) {
    return (
      <p className="text-sm text-muted">この取引は名義変更対象外です（車検残なし）。</p>
    );
  }

  return (
    <div id="deal-transfer-proof" className="space-y-4 text-sm">
      <p className="text-muted">
        名義変更後は、車検証または自動車検査証記録事項を添付してください。売り手が内容を確認できます。
      </p>

      {documents.length > 0 ? (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-border/80 bg-zinc-950/50 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {DEAL_TRANSFER_DOCUMENT_KIND_LABELS[doc.document_kind]}
                  </p>
                  <p className="text-xs text-muted">{doc.original_filename}</p>
                  <p className="text-xs text-muted">
                    提出: {formatPickupSchedule(doc.uploaded_at)}
                    {doc.seller_acknowledged_at
                      ? ` · 売り手確認済 (${formatPickupSchedule(doc.seller_acknowledged_at)})`
                      : viewerRole === "seller" || viewerRole === "admin"
                        ? " · 未確認"
                        : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={openingId === doc.id}
                    onClick={() => void openDocument(doc)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent/40"
                  >
                    {openingId === doc.id ? "…" : "開く"}
                  </button>
                  {canAcknowledge && !doc.seller_acknowledged_at ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void acknowledge(doc.id)}
                      className="rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-amber-500 disabled:opacity-50"
                    >
                      内容を確認した
                    </button>
                  ) : null}
                  {viewerRole === "buyer" && !readOnly && !doc.seller_acknowledged_at ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void removeDoc(doc.id)}
                      className="text-xs text-muted hover:text-rose-300"
                    >
                      削除
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">添付書類はまだありません。</p>
      )}

      {canUpload ? (
        <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-950/20 p-4 space-y-3">
          <p className="text-xs font-medium text-amber-100">名変後書類を添付（買い手）</p>
          <div className="flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="transfer-doc-kind"
                checked={kind === "shaken_sho"}
                onChange={() => setKind("shaken_sho")}
              />
              車検証
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="radio"
                name="transfer-doc-kind"
                checked={kind === "inspection_record"}
                onChange={() => setKind("inspection_record")}
              />
              記録事項
            </label>
          </div>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-muted file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-zinc-100"
          />
          <button
            type="button"
            disabled={loading || !file}
            onClick={() => void upload()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-zinc-950 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "送信中…" : "書類をアップロード"}
          </button>
          <p className="text-xs text-muted">
            PDF / JPEG / PNG / HEIC、10MB まで。最大 {DEAL_TRANSFER_PROOF_MAX_FILES} 件。
          </p>
        </div>
      ) : null}

      {canAcknowledge && documents.some((d) => !d.seller_acknowledged_at) ? (
        <p className="text-xs text-amber-200/90">
          買い手が名変後の書類を提出しました。「開く」で内容を確認し「内容を確認した」を押してください。
        </p>
      ) : null}

      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
    </div>
  );
}
