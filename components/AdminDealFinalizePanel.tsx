"use client";

import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";

export function AdminDealFinalizePanel({
  dealId,
  sellerIntent,
  buyerIntent,
  status,
  onUpdated,
}: {
  dealId: string;
  sellerIntent: boolean;
  buyerIntent: boolean;
  status: string;
  onUpdated: () => void;
}) {
  const { loading, message, success, run } = useAsyncAction();

  if (!["inquiry", "negotiating"].includes(status)) return null;

  const setIntent = async (party: "seller" | "buyer", confirmed: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_deal_intent", {
      p_deal_id: dealId,
      p_party: party,
      p_confirmed: confirmed,
    });
    if (error) return { error: error.message };
    onUpdated();
    return { okMessage: "確認状態を更新しました。" };
  };

  const finalize = async () => {
    if (!sellerIntent || !buyerIntent) {
      return { error: "売り手・買い手の双方確認が必要です。" };
    }
    if (
      !window.confirm(
        "成約を確定します。取引記録書を作成し、買い手へ入金指示書を自動送信します。よろしいですか？",
      )
    ) {
      return { error: null };
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_finalize_agreement", { p_deal_id: dealId });
    if (error) return { error: error.message };
    onUpdated();
    return { okMessage: "成約を確定しました。入金指示書を送信しました。" };
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2">
      <p className="text-[10px] font-medium text-emerald-200">成約確定（管理者）</p>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={sellerIntent}
          disabled={loading}
          onChange={(e) => run(() => setIntent("seller", e.target.checked))}
        />
        売り手意思確認済
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={buyerIntent}
          disabled={loading}
          onChange={(e) => run(() => setIntent("buyer", e.target.checked))}
        />
        買い手意思確認済
      </label>
      <button
        type="button"
        disabled={loading || !sellerIntent || !buyerIntent}
        onClick={() => run(finalize)}
        className="block w-full rounded bg-accent px-2 py-1 text-xs font-semibold text-black disabled:opacity-50"
      >
        {loading ? "処理中…" : "成約確定"}
      </button>
      {message ? (
        <p className={`text-[10px] ${success ? "text-emerald-300" : "text-rose-300"}`}>{message}</p>
      ) : null}
    </div>
  );
}
