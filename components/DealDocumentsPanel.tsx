"use client";

import { useCallback, useEffect, useState } from "react";
import { AsyncMessage } from "@/components/ui/async-ui";
import { DEAL_DOCUMENT_KIND_LABELS } from "@/lib/deal-documents";
import { createClient } from "@/lib/supabase/client";
import type { DealGeneratedDocument } from "@/lib/types";

export function DealDocumentsPanel({ dealId }: { dealId: string }) {
  const [docs, setDocs] = useState<DealGeneratedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_deal_generated_documents", {
      p_deal_id: dealId,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    setDocs((data ?? []) as DealGeneratedDocument[]);
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncDocuments = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/documents/sync`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        published?: string[];
        errors?: string[];
        error?: string;
      };
      if (!res.ok) {
        setMessage(json.error ?? "同期に失敗しました");
        setMessageOk(false);
      } else if (json.errors?.length) {
        setMessage(
          `一部完了（${json.published?.length ?? 0}件）。エラー: ${json.errors.join("; ")}`,
        );
        setMessageOk(false);
      } else {
        setMessage(
          json.published?.length
            ? `書類を ${json.published.length} 件同期しました`
            : "新しく同期する書類はありませんでした",
        );
        setMessageOk(true);
      }
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setMessageOk(false);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        請求書・販売証明書・領収書・契約書は PDF として保管されます。ダウンロードリンクは期限付きです。通知履歴からも再取得できます。
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncDocuments()}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-accent/40 disabled:opacity-50"
        >
          {syncing ? "同期中…" : "書類を同期"}
        </button>
      </div>
      {message ? <AsyncMessage message={message} success={messageOk} /> : null}
      {loading ? (
        <p className="text-sm text-muted">読み込み中…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted">
          まだ登録された書類がありません。請求書 PDF の表示や「書類を同期」で登録されます。
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {DEAL_DOCUMENT_KIND_LABELS[d.document_kind] ?? d.title}
                </p>
                <p className="text-xs text-muted">
                  {d.file_name} · {new Date(d.created_at).toLocaleString("ja-JP")}
                </p>
              </div>
              <a
                href={`/api/deal-documents/${d.id}/download`}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
              >
                PDFをダウンロード
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        将来: 車検証（vehicle_inspection）・名義変更書類（name_transfer）もこの一覧に追加予定です。
      </p>
    </div>
  );
}
