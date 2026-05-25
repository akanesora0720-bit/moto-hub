"use client";

import { useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
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
  const [validationHint, setValidationHint] = useState("");
  const { loading, success, message: feedback, run } = useAsyncAction();

  const canInquire = isListingInquirable(listingStatus);
  const blocked = listingStatus === "negotiating";

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setValidationHint("メッセージは5文字以上で入力してください。");
      return;
    }
    setValidationHint("");
    await run(async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || userData.user.id === sellerId) {
        return { error: "自分の出品には問い合わせできません。" };
      }

      const res = await fetch(`/api/listings/${listingId}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = (await res.json()) as { error?: string; deal_id?: string };

      if (!res.ok) {
        return { error: payload.error ?? "問い合わせに失敗しました。" };
      }

      setMessage("");
      return {
        okMessage: payload.deal_id
          ? "送信しました。商談を開始しました。運営からのご連絡をお待ちください。"
          : "送信しました。運営からのご連絡をお待ちください。",
      };
    });
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
    <div
      className={`rounded-xl border bg-card p-5 ${loading ? "border-accent/50" : "border-border"}`}
      aria-busy={loading}
    >
      <h2 className="text-lg font-semibold">問い合わせ（運営経由）</h2>
      <p className="mt-1 text-sm text-muted">
        送信と同時に商談が開始されます。運営が内容を確認のうえ、出品者へお伝えします。
      </p>

      <div className="mt-4 space-y-3">
        <AsyncStatusBanner loading={loading} />

        <textarea
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (validationHint) setValidationHint("");
          }}
          rows={4}
          disabled={loading || success}
          placeholder="例: 現車確認希望。今週中の引き渡し可能でしょうか。"
          className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
        />

        {validationHint ? (
          <p className="text-sm text-amber-200" role="alert">
            {validationHint}
          </p>
        ) : null}

        <AsyncMessage message={feedback} success={success} />

        <ActionButton
          loading={loading}
          success={success}
          loadingLabel="送信中…"
          successLabel="送信済み"
          disabled={message.trim().length < 5}
          onClick={submit}
        >
          問い合わせを送る
        </ActionButton>
      </div>
    </div>
  );
}
