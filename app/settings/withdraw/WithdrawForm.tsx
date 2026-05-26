"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { WITHDRAW_CATEGORY_LABELS } from "@/lib/dealer-membership";
import { createClient } from "@/lib/supabase/client";

export function WithdrawForm() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setMessage("");
    if (!confirm) {
      setMessage("退会内容を確認のうえ、チェックを入れてください。");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("dealer_withdraw", {
      p_reason: reason.trim() || null,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login?withdrawn=1");
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted hover:text-accent">
          ← 設定
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">退会</h1>
        <p className="mt-2 text-sm text-muted">
          退会後も trust・ペナルティ・取引履歴は事業実体（店舗）単位で内部保持されます。
          同一情報での再加盟時は信用スコアが引き継がれます。
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-5 text-sm">
        <p>{WITHDRAW_CATEGORY_LABELS.normal}</p>
        <p>
          信用スコアが低い状態（RED等）での退会は、
          {WITHDRAW_CATEGORY_LABELS.trust_violation.toLowerCase()}が適用されます。
        </p>
      </div>

      <label className="block text-sm">
        <span className="text-muted">退会理由（任意）</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
        />
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-1 rounded border-border"
        />
        <span className="text-muted">
          退会後も信用履歴が保持され、再加盟時に引き継がれることを理解しました。
        </span>
      </label>

      {message ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        disabled={loading}
        onClick={() => void submit()}
        className="w-full rounded-lg border border-rose-500/50 bg-rose-950/30 px-4 py-2.5 text-sm font-semibold text-rose-100 disabled:opacity-60"
      >
        {loading ? "処理中…" : "退会する"}
      </button>
    </div>
  );
}
