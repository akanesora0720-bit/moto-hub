"use client";

import { useEffect, useId, useState } from "react";
import {
  normalizePartCatalogText,
  PART_UNIVERSAL_MODEL_VALUE,
} from "@/lib/part-normalize";

type Suggestion = {
  id: string;
  display_name: string;
  normalized_name: string;
  is_universal: boolean;
};

export function PartModelSuggest({
  manufacturerId,
  value,
  onChange,
  disabled,
}: {
  manufacturerId: string;
  value: string;
  onChange: (displayValue: string, isUniversal: boolean) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!manufacturerId) {
      setSuggestions([]);
      return;
    }

    const q = value === "汎用" ? "" : value.trim();
    const timer = setTimeout(async () => {
      const sp = new URLSearchParams({ manufacturer_id: manufacturerId });
      if (q) sp.set("q", q);
      const res = await fetch(`/api/parts/models/suggest?${sp.toString()}`);
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
    }, 200);

    return () => clearTimeout(timer);
  }, [manufacturerId, value]);

  const pick = (display: string, universal: boolean) => {
    onChange(display, universal);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm">
        <span className="text-muted">対応車種</span>
        <input
          type="search"
          list={listId}
          disabled={disabled || !manufacturerId}
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v, v === "汎用");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={manufacturerId ? "例: CB400SF または 汎用" : "先にメーカーを選択"}
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm disabled:opacity-50"
        />
      </label>
      <datalist id={listId}>
        <option value="汎用" />
        {suggestions.map((s) => (
          <option key={s.id} value={s.display_name} />
        ))}
      </datalist>
      {open && manufacturerId && !disabled ? (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-zinc-950 py-1 shadow-lg">
          <li>
            <button
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-900"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick("汎用", true)}
            >
              汎用（全車種）
            </button>
          </li>
          {suggestions
            .filter((s) => !s.is_universal)
            .map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-900"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.display_name, false)}
                >
                  {s.display_name}
                  <span className="ml-2 text-xs text-muted">{s.normalized_name}</span>
                </button>
              </li>
            ))}
          {value.trim() &&
          !suggestions.some(
            (s) =>
              s.normalized_name === normalizePartCatalogText(value) ||
              s.display_name === value,
          ) &&
          value !== "汎用" ? (
            <li>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-accent hover:bg-zinc-900"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(value.trim(), false)}
              >
                「{normalizePartCatalogText(value)}」で登録
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      <input type="hidden" name="model_universal" value={value === "汎用" ? PART_UNIVERSAL_MODEL_VALUE : ""} />
    </div>
  );
}
