"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import {
  INVOICE_STATUS_LABELS,
  formatYen,
  resolveDealFeeRates,
  summarizeDealBilling,
} from "@/lib/billing";
import {
  buildAdminDealOpsSteps,
  getCurrentAdminOpsStep,
  type AdminDealOpsInput,
  type AdminOpsStep,
} from "@/lib/admin-deal-ops";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus, InvoiceStatus } from "@/lib/types";

function StepRow({ step }: { step: AdminOpsStep }) {
  const icon =
    step.state === "done"
      ? "✓"
      : step.state === "skipped"
        ? "!"
        : step.state === "current"
          ? "▶"
          : "○";
  const tone =
    step.state === "done"
      ? "text-emerald-300"
      : step.state === "skipped"
        ? "text-amber-300"
        : step.state === "current"
          ? "text-amber-200"
          : "text-muted";

  return (
    <li
      className={`rounded-lg border px-3 py-2 ${
        step.state === "current"
          ? "border-amber-500/40 bg-amber-950/30"
          : step.state === "skipped"
            ? "border-amber-500/25 bg-amber-950/15"
            : "border-border/60 bg-card/40"
      }`}
    >
      <div className="flex gap-2">
        <span className={`mt-0.5 shrink-0 font-mono text-sm ${tone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {step.number}. {step.title}
          </p>
          <p className="mt-0.5 text-xs text-muted">{step.summary}</p>
        </div>
      </div>
    </li>
  );
}

export function AdminDealOpsPanel({
  dealId,
  status,
  opsInput,
  platformFeeInvoiceId,
}: {
  dealId: string;
  status: DealStatus;
  opsInput: AdminDealOpsInput;
  platformFeeInvoiceId: string | null;
}) {
  const router = useRouter();
  const { loading, success, message, run } = useAsyncAction();
  const steps = buildAdminDealOpsSteps(opsInput);
  const current = getCurrentAdminOpsStep(steps);
  const { feeWaived } = resolveDealFeeRates(opsInput.agreedPriceExTax);
  const billing = summarizeDealBilling(opsInput.agreedPriceExTax);

  const refresh = () => router.refresh();

  const completeDeal = () =>
    run(async () => {
      if (
        !window.confirm(
          "車両・書類の引渡しと双方の確認が済んでいる前提で、Moto-Hub上の取引を「完了」にします。車両代金の振込は当事者間で完結しており、ここでは送金しません。よろしいですか？",
        )
      ) {
        return { error: null };
      }
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
      refresh();
      return { okMessage: "取引を完了にしました。" };
    });

  const markPlatformFeePaid = () =>
    run(async () => {
      if (!platformFeeInvoiceId) {
        return { error: "手数料請求書が見つかりません。" };
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_mark_invoice_paid", {
        p_invoice_id: platformFeeInvoiceId,
      });
      if (error) return { error: error.message };
      refresh();
      return { okMessage: "手数料の入金を記録しました。" };
    });

  const onPrimary = () => {
    if (!current?.primaryAction) return;
    switch (current.primaryAction) {
      case "complete_deal":
        return completeDeal();
      case "mark_platform_fee_paid":
        return markPlatformFeePaid();
      default:
        return;
    }
  };

  if (status === "cancelled" || status === "dispute") {
    return (
      <p className="text-sm text-muted">
        この取引は {status === "cancelled" ? "取消" : "紛争"}のため、通常の運営フローは適用されません。
      </p>
    );
  }

  if (["inquiry", "negotiating", "agreed"].includes(status)) {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>成約確定前です。商談・合意は「商談・取引」画面で進めてください。</p>
        <Link
          href="/admin/workspace?tab=deals"
          className="inline-block text-accent hover:underline"
        >
          商談・取引を開く →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4" aria-busy={loading}>
      <AsyncStatusBanner loading={loading} />

      <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2 text-xs text-sky-100">
        <strong>お金の流れ:</strong> 車両代金は買い手→売り手へ直接振込。Moto-Hub手数料は売り手→Moto-Hub（④）。
        ③の「取引完了」はシステム上の締めで、売り手への車両代金送金ではありません。
      </div>

      <ol className="space-y-2">
        {steps.map((s) => (
          <StepRow key={s.id} step={s} />
        ))}
      </ol>

      {current?.primaryButtonLabel ? (
        <ActionButton
          size="lg"
          loading={loading}
          success={success}
          loadingLabel="処理中…"
          onClick={onPrimary}
        >
          今やること: {current.primaryButtonLabel}
        </ActionButton>
      ) : status === "completed" ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">
          この取引は完了済みです。
          {opsInput.requiresNameTransfer && !opsInput.transferCompletedAt
            ? " 名義変更のフォロー（⑤）は引き続き必要です。"
            : null}
        </p>
      ) : (
        <p className="text-sm text-muted">
          今は運営のボタン操作は不要です。当事者の操作をお待ちください。
        </p>
      )}

      {opsInput.paymentInstructionStatus ||
      opsInput.weeklyFeeInvoiceStatus ||
      opsInput.feeAccrualStatus ? (
        <p className="text-xs text-muted">
          {opsInput.paymentInstructionStatus
            ? `入金指示書: ${INVOICE_STATUS_LABELS[opsInput.paymentInstructionStatus]}`
            : null}
          {!feeWaived && opsInput.weeklyFeeInvoiceStatus
            ? `${opsInput.paymentInstructionStatus ? " · " : ""}週次手数料: ${INVOICE_STATUS_LABELS[opsInput.weeklyFeeInvoiceStatus]}（${formatYen(billing.platformFeeIncTax)}）`
            : !feeWaived && opsInput.feeAccrualStatus
              ? `${opsInput.paymentInstructionStatus ? " · " : ""}週次計上: ${opsInput.feeAccrualStatus}`
              : feeWaived
                ? `${opsInput.paymentInstructionStatus ? " · " : ""}手数料: 対象外`
                : null}
        </p>
      ) : null}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer text-zinc-400">精算ページについて</summary>
        <p className="mt-1">
          複数取引をまとめて見る場合は
          <Link href="/admin/billing" className="mx-1 text-accent hover:underline">
            精算
          </Link>
          も使えますが、<strong>この取引の完了・週次手数料確認は取引詳細で行ってください</strong>。
        </p>
      </details>

      <AsyncMessage message={message} success={success} />
    </div>
  );
}
