"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function AsyncSpinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-accent border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

/** 操作中の目立つ表示（ボタン上だけでなくフォーム全体でも使う） */
export function AsyncStatusBanner({
  loading,
  label = "処理中… しばらくお待ちください",
}: {
  loading: boolean;
  label?: string;
}) {
  if (!loading) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3"
      role="status"
      aria-live="polite"
    >
      <AsyncSpinner />
      <span className="text-sm font-medium text-accent">{label}</span>
    </div>
  );
}

export function AsyncMessage({
  message,
  success,
  className = "mt-3",
}: {
  message: string;
  success?: boolean;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`rounded-lg px-3 py-2 text-sm ${className} ${
        success
          ? "border border-emerald-500/30 bg-emerald-950/40 text-emerald-200"
          : "border border-rose-500/30 bg-rose-950/30 text-rose-200"
      }`}
    >
      {message}
    </p>
  );
}

const variantClass = {
  primary: "bg-accent text-black hover:opacity-90",
  secondary: "border border-border bg-zinc-900 text-foreground hover:border-accent/40",
  danger: "border border-rose-500/40 bg-rose-950/30 text-rose-100 hover:border-rose-500/60",
  amber: "border border-amber-500/50 bg-amber-950/50 text-amber-100",
} as const;

const sizeClass = {
  sm: "min-h-9 px-3 py-2 text-xs",
  md: "min-h-12 px-4 py-3 text-sm",
  lg: "min-h-14 px-4 py-4 text-base",
} as const;

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  success?: boolean;
  loadingLabel?: string;
  successLabel?: string;
  variant?: keyof typeof variantClass;
  size?: keyof typeof sizeClass;
  children: ReactNode;
};

/** 非同期操作用ボタン（送信中・完了のラベル切替 + スピナー） */
export function ActionButton({
  loading = false,
  success = false,
  loadingLabel = "処理中…",
  successLabel = "完了",
  variant = "primary",
  size = "md",
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: ActionButtonProps) {
  const busy = loading || success;
  const label = loading ? loadingLabel : success ? successLabel : children;

  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={loading}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg font-semibold transition touch-manipulation disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    >
      {loading ? <AsyncSpinner className="h-4 w-4 border-black/30 border-t-black" /> : null}
      <span>{label}</span>
    </button>
  );
}
