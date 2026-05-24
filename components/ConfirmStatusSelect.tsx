"use client";

import { useEffect, useState } from "react";
import { useAsyncAction } from "@/lib/use-async-action";

type Option<T extends string> = { value: T; label: string };

export function ConfirmStatusSelect<T extends string>({
  value,
  options,
  onConfirm,
  confirmMessage,
  disabled,
}: {
  value: T;
  options: Option<T>[];
  onConfirm: (next: T) => Promise<{ error?: string | null; okMessage?: string }>;
  confirmMessage?: (next: T) => string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const { loading, message, success, run } = useAsyncAction();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const dirty = draft !== value;
  const defaultConfirm = (next: T) =>
    `ステータスを「${options.find((o) => o.value === next)?.label ?? next}」に更新します。よろしいですか？`;

  const save = async () => {
    if (!dirty || loading) return;
    const msg = (confirmMessage ?? defaultConfirm)(draft);
    if (!window.confirm(msg)) return;
    await run(() => onConfirm(draft));
  };

  return (
    <div className="space-y-1">
      <select
        value={draft}
        disabled={disabled || loading}
        onChange={(e) => setDraft(e.target.value as T)}
        className="rounded border border-border bg-zinc-950 px-2 py-1 text-xs disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-amber-200">未保存の変更あり</span>
          <button
            type="button"
            disabled={loading}
            onClick={save}
            className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold text-black disabled:opacity-60"
          >
            {loading ? "更新中…" : "更新"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => setDraft(value)}
            className="text-[10px] text-muted hover:underline disabled:opacity-60"
          >
            取消
          </button>
        </div>
      ) : null}
      {message ? (
        <p className={`text-[10px] ${success ? "text-emerald-300" : "text-rose-300"}`}>{message}</p>
      ) : null}
    </div>
  );
}
