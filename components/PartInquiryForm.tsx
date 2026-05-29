"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { PART_CHAT_MAX_FILES } from "@/lib/part-images";
import { useAsyncAction } from "@/lib/use-async-action";

export function PartInquiryForm({
  partId,
  canInquire,
  onCreated,
}: {
  partId: string;
  canInquire: boolean;
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { loading, success, message: feedback, run } = useAsyncAction();

  if (!canInquire) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted">
        現在このパーツには問い合わせできません。
      </div>
    );
  }

  const submit = async () => {
    await run(async () => {
      const trimmed = message.trim();
      if (trimmed.length < 5 && files.length === 0) {
        return { error: "メッセージは5文字以上、または写真を添付してください。" };
      }

      const form = new FormData();
      form.set("message", trimmed);
      files.forEach((f) => form.append("images", f));

      const res = await fetch(`/api/parts/${partId}/inquiry`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return { error: data.error ?? "問い合わせに失敗しました。" };

      setMessage("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onCreated?.();
      router.refresh();
      return { okMessage: "問い合わせを送信しました。チャットでやり取りできます。" };
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold">問い合わせ</h3>
      <p className="mt-1 text-sm text-muted">
        送信後すぐにチャットが開きます。送料・支払い方法は当事者間で調整してください。
      </p>
      <div className="mt-3 space-y-3">
        <AsyncStatusBanner loading={loading} />
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded border border-border bg-zinc-950 px-3 py-2"
          placeholder="5文字以上で入力（写真のみの場合は省略可）"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files;
              if (!picked?.length) return;
              setFiles((prev) => [...prev, ...Array.from(picked)].slice(0, PART_CHAT_MAX_FILES));
            }}
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
        <AsyncMessage message={feedback} success={success} />
        <ActionButton
          loading={loading}
          success={success}
          onClick={submit}
          disabled={message.trim().length < 5 && files.length < 1}
          loadingLabel="送信中…"
          successLabel="送信済み"
        >
          問い合わせを送る
        </ActionButton>
      </div>
    </div>
  );
}
