"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { DEAL_STATUS_LABELS } from "@/lib/deal-flow";
import { useAsyncAction } from "@/lib/use-async-action";
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
  const { loading, success, message, run } = useAsyncAction();

  if (status !== "payout_ready" && status !== "payout_done") return null;

  const advance = (next: DealStatus) =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_advance_deal", {
        p_deal_id: dealId,
        p_status: next,
      });
      if (error) return { error: error.message };
      router.refresh();
      return { okMessage: "更新しました。" };
    });

  const completeInOneStep = async () => {
    if (
      !window.confirm(
        "この取引を「完了」にします。車両は成約済みになり、買い手・売り手に通知されます。よろしいですか？",
      )
    ) {
      return;
    }
    await run(async () => {
      const supabase = createClient();
      if (status === "payout_ready") {
        const { error: e1 } = await supabase.rpc("admin_advance_deal", {
          p_deal_id: dealId,
          p_status: "payout_done",
        });
        if (e1) return { error: e1.message };
      }
      const { error: e2 } = await supabase.rpc("admin_advance_deal", {
        p_deal_id: dealId,
        p_status: "completed",
      });
      if (e2) return { error: e2.message };
      router.refresh();
      return { okMessage: "取引を完了にしました。" };
    });
  };

  return (
    <div
      className="space-y-4 rounded-xl border-2 border-emerald-500/50 bg-emerald-950/30 p-4"
      aria-busy={loading}
    >
      <AsyncStatusBanner loading={loading} />

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
          <ActionButton
            size="lg"
            loading={loading}
            success={success}
            loadingLabel="処理中…"
            onClick={completeInOneStep}
          >
            取引を完了にする（運営）
          </ActionButton>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer text-emerald-200/80">2段階で操作する場合</summary>
            <div className="mt-2">
              <ActionButton
                variant="secondary"
                loading={loading}
                loadingLabel="処理中…"
                onClick={() => advance("payout_done")}
              >
                ① 完了登録（{DEAL_STATUS_LABELS.payout_done}）
              </ActionButton>
            </div>
          </details>
        </>
      ) : (
        <ActionButton
          size="lg"
          loading={loading}
          success={success}
          loadingLabel="処理中…"
          onClick={() => advance("completed")}
        >
          取引を完了にする（運営）
        </ActionButton>
      )}

      <p className="text-xs text-muted">
        一覧から操作する場合:{" "}
        <Link href="/admin/workspace?tab=deals" className="text-accent hover:underline">
          商談・取引 → 取引タブ
        </Link>
      </p>
      <AsyncMessage message={message} success={success} />
    </div>
  );
}
