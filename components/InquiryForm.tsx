"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function InquiryForm({ listingId, sellerId }: { listingId: string; sellerId: string }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [detail, setDetail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!message.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || userData.user.id === sellerId) {
      setStatus("error");
      setDetail("自分の出品には問い合わせできません。");
      setLoading(false);
      return;
    }
    const { error } = await supabase.from("inquiries").insert({
      listing_id: listingId,
      buyer_id: userData.user.id,
      message: message.trim(),
    });
    setLoading(false);
    if (error) {
      setStatus("error");
      setDetail(error.message);
      return;
    }
    setStatus("ok");
    setDetail("問い合わせを送信しました。運営からのご連絡をお待ちください。");
    setMessage("");
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">問い合わせ（運営経由）</h2>
      <p className="mt-1 text-sm text-muted">
        購入検討・現車確認の希望などを送信します。運営が内容を確認のうえ、出品者へお伝えし、合意後は取引画面で入金・引渡・完了確認を進めます。
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder="例: 現車確認希望。今週中の引き渡し可能でしょうか。"
        className="mt-4 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
      />
      {status !== "idle" ? (
        <p
          className={`mt-3 text-sm ${status === "ok" ? "text-emerald-300" : "text-rose-300"}`}
        >
          {detail}
        </p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {loading ? "送信中…" : "問い合わせを送る"}
      </button>
    </div>
  );
}
