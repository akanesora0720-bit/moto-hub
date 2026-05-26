"use client";

import Link from "next/link";
import { DateField } from "@/components/DateField";
import { GRADING_ITEMS, GRADE_OPTIONS } from "@/lib/vehicle-grading";
import type { ListingGrades } from "@/lib/types";

type Props = {
  grades: ListingGrades;
  onChange: (grades: ListingGrades) => void;
  inspectionExpiryDate: string;
  onInspectionExpiryDateChange: (value: string) => void;
  liabilityInsuranceExpiryDate: string;
  onLiabilityInsuranceExpiryDateChange: (value: string) => void;
  inspectionRemaining: string;
  onInspectionRemainingChange: (value: string) => void;
};

export function ListingGradingInput({
  grades,
  onChange,
  inspectionExpiryDate,
  onInspectionExpiryDateChange,
  liabilityInsuranceExpiryDate,
  onLiabilityInsuranceExpiryDateChange,
  inspectionRemaining,
  onInspectionRemainingChange,
}: Props) {
  const set = (key: keyof ListingGrades, value: string) => {
    onChange({ ...grades, [key]: value === "" ? "" : Number(value) });
  };

  return (
    <div className="space-y-4 rounded-xl border border-accent/25 bg-zinc-950/50 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-accent">車両評価</h2>
          <p className="mt-1 text-xs text-muted">各項目 1〜10点（プルダウンで選択）</p>
        </div>
        <Link href="/evaluation" className="text-xs text-accent hover:underline" target="_blank">
          評価基準を見る →
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {GRADING_ITEMS.map((item) => (
          <label key={item.key} className="block text-center">
            <span className="text-[10px] font-medium tracking-wide text-muted sm:text-xs">
              {item.short}
            </span>
            <select
              value={grades[item.key] === "" ? "" : String(grades[item.key])}
              onChange={(e) => set(item.key, e.target.value)}
              className="mt-1 w-full min-h-11 rounded-lg border border-border bg-card px-1 py-2 text-center font-serif text-lg font-semibold text-accent focus:border-accent touch-manipulation"
              required
            >
              <option value="">—</option>
              {GRADE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-zinc-500">
        {GRADING_ITEMS.map((i) => i.label).join(" · ")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField
          label="車検満了日"
          value={inspectionExpiryDate}
          onChange={onInspectionExpiryDateChange}
          warnPast
          hint="カレンダーから選択（yyyy-mm-dd で保存）。"
        />
        <DateField
          label="自賠責満了日"
          value={liabilityInsuranceExpiryDate}
          onChange={onLiabilityInsuranceExpiryDateChange}
          warnPast
          hint="カレンダーから選択（yyyy-mm-dd で保存）。"
        />
      </div>
      <label className="block text-sm">
        <span className="text-muted">車検残メモ（任意）</span>
        <input
          value={inspectionRemaining}
          onChange={(e) => onInspectionRemainingChange(e.target.value)}
          placeholder="例: 1年5ヶ月（表示用の補足）"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}
