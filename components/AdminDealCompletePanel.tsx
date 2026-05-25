"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus } from "@/lib/types";

export function AdminDealCompletePanel({
  dealId,
  status,
}: {
  dealId: string;
  status: DealStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (status !== "payout_ready" && status !== "payout_done") return null;

  const advance = async (next: DealStatus) => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_advance_deal", {
      p_deal_id: dealId,
      p_status: next,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.refresh();
  };

  const completeInOneStep = async () => {
    if (
      !window.confirm(
        "この取引を「完了」にします。車両は成約済みになり、買い手・売り手に通知されます。よろしいですか？",
      )
    ) {
      return;
    }
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    if (status === "payout_ready") {
      const { error: e1 } = await supabase.rpc("admin_advance_deal", {
        p_deal_id: dealId,
        p_status: "payout_done",
      });
      if (e1) {
        setLoading(false);
        setMessage(e1.message);
        return;
      }
    }
    const { error: e2 } = await supabase.rpc("admin_advance_deal", {
      p_deal_id: dealId,
      p_status: "completed",
    });
    setLoading(false);
    if (e2) {
      setMessage(e2.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="space-y-4 rounded-xl border-2 border-emerald-500/50 bg-emerald-950/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">運営操作</p>
      <h3 className="text-lg font-bold text-emerald-50">
        {status === "payout_ready"
          ? "取引を完了にしてください"
          : "最終ステップ: 取引を完了にする"}
      </h3>
      <p className="text-sm text-emerald-100/90">
        買い手・売り手の確認は済んでいます（{DEAL_STATUS_LABELS[status]}）。
        車両代金は当事者間で完結しているため、運営が取引を閉じます。
      </p>

      {status === "payout_ready" ? (
        <>
          <button
            type="button"
            disabled={loading}
            onClick={completeInOneStep}
            className="min-h-14 w-full rounded-xl bg-accent px-4 py-4 text-base font-bold text-black disabled:opacity-60 touch-manipulation"
          >
            {loading ? "処理中…" : "取引を完了にする（運営）"}
          </button>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-emerald-200/80">2段階で操作する場合</summary>
            <div className="mt-2 space-y-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => advance("payout_done")}
                className="block w-full rounded-lg border border-border px-4 py-2.5 text-sm hover:border-accent/40 disabled:opacity-60"
              >
                ① 完了登録（{DEAL_STATUS_LABELS.payout_done}）
              </button>
            </div>
          </details>
        </>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => advance("completed")}
          className="min-h-14 w-full rounded-xl bg-accent px-4 py-4 text-base font-bold text-black disabled:opacity-60 touch-manipulation"
        >
          {loading ? "処理中…" : "取引を完了にする（運営）"}
        </button>
      )}

      <p className="text-xs text-muted">
        一覧から操作する場合:{" "}
        <Link href="/admin/workspace?tab=deals" className="text-accent hover:underline">
          商談・取引 → 取引タブ
        </Link>
        （操作列のリンクでも同じ処理です）
      </p>
      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
    </div>
  );
}
