"use client";

import { useState } from "react";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";
import type { ListingStatus } from "@/lib/types";
import { isListingInquirable } from "@/lib/listing-status";

export function InquiryForm({
  listingId,
  sellerId,
  listingStatus,
}: {
  listingId: string;
  sellerId: string;
  listingStatus: ListingStatus;
}) {
  const [message, setMessage] = useState("");
  const { loading, message: feedback, success, run } = useAsyncAction();

  const canInquire = isListingInquirable(listingStatus);
  const blocked = listingStatus === "negotiating";

  const submit = async () => {
    if (!message.trim() || message.trim().length < 5) {
      return { error: "メッセージは5文字以上で入力してください。" };
    }
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || userData.user.id === sellerId) {
      return { error: "自分の出品には問い合わせできません。" };
    }

    const res = await fetch(`/api/listings/${listingId}/inquiry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    const payload = (await res.json()) as { error?: string; deal_id?: string };

    if (!res.ok) {
      return { error: payload.error ?? "問い合わせに失敗しました。" };
    }

    setMessage("");
    const dealId = payload.deal_id;
    return {
      okMessage: dealId
        ? `問い合わせを送信しました。商談を開始しました（取引: ${dealId.slice(0, 8)}…）。運営からのご連絡をお待ちください。`
        : "問い合わせを送信しました。運営からのご連絡をお待ちください。",
    };
  };

  if (!canInquire) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">問い合わせ</h2>
        {blocked ? (
          <p className="mt-2 text-sm text-amber-200/90">
            現在商談中です。他の業者からの問い合わせは受け付けていません。
          </p>
        ) : listingStatus === "sold" ? (
          <p className="mt-2 text-sm text-muted">この車両は成約済みです。</p>
        ) : (
          <p className="mt-2 text-sm text-muted">現在問い合わせできません。</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">問い合わせ（運営経由）</h2>
      <p className="mt-1 text-sm text-muted">
        送信と同時に商談が開始されます。運営が内容を確認のうえ、出品者へお伝えします。
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        disabled={loading}
        placeholder="例: 現車確認希望。今週中の引き渡し可能でしょうか。"
        className="mt-4 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
      />
      {feedback ? (
        <p className={`mt-3 text-sm ${success ? "text-emerald-300" : "text-rose-300"}`}>{feedback}</p>
      ) : null}
      <button
        type="button"
        onClick={() => run(submit)}
        disabled={loading || message.trim().length < 5}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "送信中…" : "問い合わせを送る"}
      </button>
    </div>
  );
}
