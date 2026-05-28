"use client";

import { useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { useAsyncAction } from "@/lib/use-async-action";

export function PartInquiryForm({ partId, canInquire }: { partId: string; canInquire: boolean }) {
  const [message, setMessage] = useState("");
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
      const res = await fetch(`/api/parts/${partId}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) return { error: data.error ?? "問い合わせに失敗しました。" };
      setMessage("");
      return { okMessage: "問い合わせを送信しました。" };
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold">問い合わせ</h3>
      <p className="mt-1 text-sm text-muted">送料・支払い方法は当事者間で調整してください。</p>
      <div className="mt-3 space-y-3">
        <AsyncStatusBanner loading={loading} />
        <textarea
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded border border-border bg-zinc-950 px-3 py-2"
          placeholder="5文字以上で入力"
        />
        <AsyncMessage message={feedback} success={success} />
        <ActionButton loading={loading} success={success} onClick={submit} disabled={message.trim().length < 5} loadingLabel="送信中…" successLabel="送信済み">
          問い合わせを送る
        </ActionButton>
      </div>
    </div>
  );
}
