"use client";

import { normalizeIdentifierInput } from "@/lib/normalize";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
};

export function IdentifierField({
  label,
  value,
  onChange,
  required,
  placeholder,
  hint,
  mono,
}: Props) {
  return (
    <label className="block text-sm">
      <span className="text-muted">
        {label}
        {required ? " *" : "（任意）"}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(normalizeIdentifierInput(e.target.value))}
        className={`mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm ${
          mono ? "font-mono" : ""
        }`}
        placeholder={placeholder}
      />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </label>
  );
}
