"use client";

import type { DealNextStep } from "@/lib/deal-next-steps";

type Props = {
  step: DealNextStep;
  loading: boolean;
  onPrimary?: () => void;
  onScrollTo?: (targetId: string) => void;
};

export function DealNextStepBanner({ step, loading, onPrimary, onScrollTo }: Props) {
  return (
    <div className="space-y-4 rounded-xl border-2 border-amber-500/60 bg-amber-950/30 p-4">
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

      {step.scrollTargetId && onScrollTo ? (
        <button
          type="button"
          onClick={() => onScrollTo(step.scrollTargetId!)}
          className="w-full rounded-lg border border-amber-500/40 bg-zinc-950/80 px-4 py-3 text-sm font-medium text-amber-100 touch-manipulation active:bg-zinc-900"
        >
          ↓ 関連セクションへ移動
        </button>
      ) : null}

      {step.waitOnly && !step.primaryButtonLabel ? (
        <p className="rounded-lg border border-amber-500/30 bg-zinc-950/60 px-4 py-3 text-center text-sm text-amber-200/90">
          今はボタン操作は不要です。上の手順どおり進めてください。
        </p>
      ) : null}

      {step.primaryButtonLabel && onPrimary ? (
        <button
          type="button"
          disabled={loading}
          onClick={onPrimary}
          className="min-h-14 w-full rounded-xl bg-accent px-4 py-4 text-base font-bold text-black shadow-lg disabled:opacity-60 touch-manipulation"
        >
          {loading ? "処理中…" : step.primaryButtonLabel}
        </button>
      ) : null}
    </div>
  );
}
