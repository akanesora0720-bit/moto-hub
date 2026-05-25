"use client";

import {
  ActionButton,
  ActionCompleted,
  AsyncMessage,
  AsyncStatusBanner,
} from "@/components/ui/async-ui";
import type { DealNextStep } from "@/lib/deal-next-steps";

type Props = {
  step: DealNextStep;
  loading: boolean;
  success?: boolean;
  onPrimary?: () => void;
  onScrollTo?: (targetId: string) => void;
  /** ボタン操作が終わったあと（振込報告済みなど） */
  actionCompleted?: boolean;
  completedLabel?: string;
  completedDetail?: string;
  feedbackMessage?: string;
  feedbackSuccess?: boolean;
};

export function DealNextStepBanner({
  step,
  loading,
  success,
  onPrimary,
  onScrollTo,
  actionCompleted = false,
  completedLabel = "完了",
  completedDetail,
  feedbackMessage = "",
  feedbackSuccess = false,
}: Props) {
  return (
    <div
      className={`space-y-4 rounded-xl border-2 p-4 ${
        actionCompleted
          ? "border-emerald-500/50 bg-emerald-950/25"
          : "border-amber-500/60 bg-amber-950/30"
      } ${loading ? "border-accent/50" : ""}`}
      aria-busy={loading}
    >
      <AsyncStatusBanner loading={loading} label="送信中… しばらくお待ちください" />

      <AsyncMessage
        message={feedbackMessage}
        success={feedbackSuccess}
        className={feedbackMessage ? "mt-0" : ""}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold text-black">
          ステップ {step.stepNumber} / {step.stepTotal}
        </span>
        <span className="text-xs font-medium text-amber-200/90">{step.phase}</span>
      </div>

      <h3 className="text-lg font-bold leading-snug text-amber-50">{step.title}</h3>

      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-amber-100/95">
        {step.instructions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>

      {step.scrollTargetId &&
      onScrollTo &&
      step.scrollTargetId !== "deal-primary-action" &&
      !step.primaryButtonLabel ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => onScrollTo(step.scrollTargetId!)}
          className="w-full rounded-lg border border-amber-500/40 bg-zinc-950/80 px-4 py-3 text-sm font-medium text-amber-100 touch-manipulation active:bg-zinc-900 disabled:opacity-50"
        >
          ↓ 関連セクションへ移動
        </button>
      ) : null}

      {step.waitOnly && !step.primaryButtonLabel && !actionCompleted ? (
        <p className="rounded-lg border border-amber-500/30 bg-zinc-950/60 px-4 py-3 text-center text-sm text-amber-200/90">
          今はボタン操作は不要です。上の手順どおり進めてください。
        </p>
      ) : null}

      {actionCompleted ? (
        <ActionCompleted label={completedLabel} detail={completedDetail} />
      ) : step.primaryButtonLabel && onPrimary ? (
        <ActionButton
          size="lg"
          loading={loading}
          success={success}
          loadingLabel="送信中…"
          successLabel="報告済み"
          onClick={onPrimary}
        >
          {step.primaryButtonLabel}
        </ActionButton>
      ) : null}
    </div>
  );
}
