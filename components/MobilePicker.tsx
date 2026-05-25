"use client";

import { useEffect, useId, useRef, useState } from "react";

export type PickerOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly PickerOption[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  className?: string;
};

/**
 * Android 等でネイティブ &lt;select&gt; が使いづらい問題への対策。
 * 大きなタップ領域のボタン → 一覧モーダルで選択。
 */
export function MobilePicker({
  label,
  value,
  onChange,
  options,
  placeholder = "タップして選択",
  required,
  hint,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <div className={className}>
      <span className="block text-sm text-muted">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={titleId}
        onClick={() => setOpen(true)}
        className="mt-1 flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-border bg-zinc-950 px-4 py-3 text-left text-sm text-foreground touch-manipulation active:border-accent"
      >
        <span id={titleId} className={display ? "font-medium" : "text-muted"}>
          {display || placeholder}
        </span>
        <span className="shrink-0 text-xs text-accent" aria-hidden>
          選択 ▼
        </span>
      </button>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 p-3 sm:justify-center sm:p-6"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="max-h-[min(70vh,520px)] overflow-hidden rounded-xl border border-border bg-zinc-950 shadow-xl sm:mx-auto sm:max-w-md sm:w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">{label}</p>
              <button
                type="button"
                className="min-h-10 min-w-10 rounded-lg px-2 text-sm text-muted touch-manipulation"
                onClick={() => setOpen(false)}
              >
                閉じる
              </button>
            </div>
            <ul className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain py-1">
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => pick(o.value)}
                      className={`flex min-h-12 w-full items-center px-4 py-3 text-left text-sm touch-manipulation ${
                        active
                          ? "bg-accent/20 font-semibold text-accent"
                          : "text-foreground active:bg-zinc-800"
                      }`}
                    >
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
