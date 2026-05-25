"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);
  const [validationHint, setValidationHint] = useState("");

  const canInquire = isListingInquirable(listingStatus);
  const blocked = listingStatus === "negotiating";

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setValidationHint("メッセージは5文字以上で入力してください。");
      return;
    }
    setValidationHint("");
    setLoading(true);
    setFeedback("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || userData.user.id === sellerId) {
        setFeedback("自分の出品には問い合わせできません。");
        return;
      }

      const res = await fetch(`/api/listings/${listingId}/inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = (await res.json()) as { error?: string; deal_id?: string };

      if (!res.ok) {
        setFeedback(payload.error ?? "問い合わせに失敗しました。");
        return;
      }

      setMessage("");
      const dealId = payload.deal_id;
      setSuccess(true);
      setFeedback(
        dealId
          ? `送信しました。商談を開始しました。運営からのご連絡をお待ちください。`
          : "送信しました。運営からのご連絡をお待ちください。",
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "送信に失敗しました。");
    } finally {
      setLoading(false);
    }
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
      className={`rounded-xl border bg-card p-5 ${
        loading ? "border-accent/50 opacity-95" : "border-border"
      }`}
      aria-busy={loading}
    >
      <h2 className="text-lg font-semibold">問い合わせ（運営経由）</h2>
      <p className="mt-1 text-sm text-muted">
        送信と同時に商談が開始されます。運営が内容を確認のうえ、出品者へお伝えします。
      </p>

      {loading ? (
        <div
          className="mt-4 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm font-medium text-accent">送信中… しばらくお待ちください</span>
        </div>
      ) : null}

      <textarea
        value={message}
        onChange={(e) => {
          setMessage(e.target.value);
          if (validationHint) setValidationHint("");
        }}
        rows={4}
        disabled={loading || success}
        placeholder="例: 現車確認希望。今週中の引き渡し可能でしょうか。"
        className="mt-4 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent disabled:opacity-60"
      />

      {validationHint ? (
        <p className="mt-2 text-sm text-amber-200" role="alert">
          {validationHint}
        </p>
      ) : null}

      {feedback ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            success
              ? "border border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
              : "border border-rose-500/30 bg-rose-950/30 text-rose-200"
          }`}
          role="status"
          aria-live="polite"
        >
          {feedback}
        </p>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={loading || success}
        className="mt-4 min-h-12 w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-black disabled:opacity-50 touch-manipulation"
      >
        {loading ? "送信中…" : success ? "送信済み" : "問い合わせを送る"}
      </button>
    </div>
  );
}
