"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PartImage } from "@/components/PartImage";
import {
  formatPartInquiryMessageTime,
  type PartInquiryMessageRow,
} from "@/lib/part-inquiry-board";
import {
  PART_CHAT_MAX_FILES,
  partChatImagePath,
  partImagePathsFromJson,
  uploadPartFiles,
} from "@/lib/part-images";
import { createClient } from "@/lib/supabase/client";

export function PartInquiryChatPanel({
  inquiryId,
  partListingId,
  sellerId,
  viewerId,
  readOnly = false,
}: {
  inquiryId: string;
  partListingId: string;
  sellerId: string;
  viewerId: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<PartInquiryMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("list_part_inquiry_messages", {
      p_inquiry_id: inquiryId,
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setMessages((data ?? []) as PartInquiryMessageRow[]);
    setLoading(false);
  }, [inquiryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if ((!text && files.length === 0) || posting || readOnly) return;

    setPosting(true);
    setError("");
    const supabase = createClient();
    let attachmentPaths: string[] = [];

    if (files.length > 0) {
      const paths = files.map((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
        return partChatImagePath(
          sellerId,
          partListingId,
          inquiryId,
          `${crypto.randomUUID()}.${safeExt}`,
        );
      });
      const uploaded = await uploadPartFiles(supabase, paths, files);
      if (uploaded.error) {
        setPosting(false);
        setError(uploaded.error);
        return;
      }
      attachmentPaths = uploaded.paths;
    }

    const { error: err } = await supabase.rpc("post_part_inquiry_message", {
      p_inquiry_id: inquiryId,
      p_message: text,
      p_attachment_paths: attachmentPaths,
    });
    setPosting(false);
    if (err) {
      if (attachmentPaths.length > 0) {
        await supabase.storage.from("part-images").remove(attachmentPaths);
      }
      setError(err.message);
      return;
    }
    setDraft("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
    router.refresh();
    window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 100);
  };

  const onPickFiles = (picked: FileList | null) => {
    if (!picked?.length) return;
    const next = [...files, ...Array.from(picked)].slice(0, PART_CHAT_MAX_FILES);
    setFiles(next);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold">問い合わせチャット</h3>
      <p className="text-xs text-muted">
        問い合わせ直後からやり取りできます。写真は1通あたり最大{PART_CHAT_MAX_FILES}枚（各10MB目安）。
      </p>

      <div
        className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border/80 bg-zinc-950/60 p-3"
        aria-label="パーツ問い合わせの履歴"
      >
        {loading ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">まだメッセージはありません。</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === viewerId;
            const attachments = partImagePathsFromJson(m.attachment_paths);
            return (
              <article
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  mine ? "ml-6 bg-accent/15" : "mr-6 bg-zinc-900"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="font-medium text-zinc-300">
                    {m.sender_label ?? (mine ? "あなた" : "相手")}
                  </span>
                  <time dateTime={m.created_at}>
                    {formatPartInquiryMessageTime(m.created_at)}
                  </time>
                </div>
                {m.message && m.message !== "（写真）" ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-zinc-100">{m.message}</p>
                ) : null}
                {attachments.length > 0 ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {attachments.map((path) => (
                      <a
                        key={path}
                        href="#"
                        className="relative block aspect-square overflow-hidden rounded-md border border-border"
                        onClick={(e) => {
                          e.preventDefault();
                          const supabase = createClient();
                          void supabase.storage
                            .from("part-images")
                            .createSignedUrl(path, 300)
                            .then(({ data }) => {
                              if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                            });
                        }}
                      >
                        <PartImage path={path} alt="添付写真" fill className="rounded-md" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="text-xs text-muted">この商談は終了しています。</p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="text-muted">メッセージ</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="送料・支払方法・状態確認など"
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:border-accent"
            >
              写真を添付
            </button>
            {files.length > 0 ? (
              <span className="text-xs text-muted">{files.length}枚選択中</span>
            ) : null}
          </div>
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-xs text-muted">
              {files.map((f) => (
                <li key={f.name + f.size} className="rounded bg-zinc-900 px-2 py-1">
                  {f.name}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            disabled={posting || (draft.trim().length < 1 && files.length < 1)}
            onClick={() => void submit()}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {posting ? "送信中…" : "送信"}
          </button>
        </>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
