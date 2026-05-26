"use client";

import { isValidYmdDateString } from "@/lib/normalize";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  warnPast?: boolean;
  hint?: string;
};

export function DateField({
  label,
  value,
  onChange,
  required,
  warnPast,
  hint,
}: Props) {
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !isValidYmdDateString(trimmed);
  const past =
    warnPast &&
    trimmed.length > 0 &&
    isValidYmdDateString(trimmed) &&
    trimmed < new Date().toISOString().slice(0, 10);

  return (
    <label className="block text-sm">
      <span className="text-muted">
        {label}
        {required ? " *" : "（任意）"}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
      />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      {invalid ? (
        <p className="mt-1 text-xs text-amber-300">日付の形式が不正です（yyyy-mm-dd）。</p>
      ) : null}
      {past ? (
        <p className="mt-1 text-xs text-amber-300">過去の日付です。内容をご確認ください。</p>
      ) : null}
    </label>
  );
}
