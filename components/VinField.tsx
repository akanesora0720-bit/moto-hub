"use client";

import { normalizeVinStrict } from "@/lib/normalize";
import type { ListingFormVinState } from "@/lib/listing-form";

type Props = {
  value: ListingFormVinState;
  onChange: (value: ListingFormVinState) => void;
};

export function VinField({ value, onChange }: Props) {
  const normalized = normalizeVinStrict(value.frameNumber);
  const showStrictError =
    !value.isOfficiallyStampedVin &&
    normalized.length > 0 &&
    !/^[A-Z0-9-]+$/.test(normalized);

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-muted">車台番号（全文表示）*</span>
        <input
          value={value.frameNumber}
          onChange={(e) =>
            onChange({
              ...value,
              frameNumber: normalizeVinStrict(e.target.value),
            })
          }
          className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 font-mono text-sm"
          placeholder="例: NC42-1201234"
        />
        <p className="mt-1 text-xs text-muted">
          車台番号は半角英数字で入力されます（入力時に自動変換・英字は大文字化）。
        </p>
        {showStrictError ? (
          <p className="mt-1 text-xs text-amber-300">
            半角英数字とハイフンのみ使用できます。
          </p>
        ) : null}
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.isOfficiallyStampedVin}
          onChange={(e) =>
            onChange({
              ...value,
              isOfficiallyStampedVin: e.target.checked,
              vinNote: e.target.checked ? value.vinNote : "",
            })
          }
          className="mt-1 rounded border-border"
        />
        <span className="text-muted">
          職権打刻や特殊な車台番号の場合はチェックしてください。書類上の表記に準拠し、備考に内容を記載してください。
        </span>
      </label>

      {value.isOfficiallyStampedVin ? (
        <label className="block text-sm">
          <span className="text-muted">車台番号備考 *</span>
          <textarea
            value={value.vinNote}
            onChange={(e) => onChange({ ...value, vinNote: e.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm"
            placeholder="書類上の表記・打刻位置など"
          />
        </label>
      ) : null}
    </div>
  );
}
