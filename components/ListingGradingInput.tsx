"use client";

import Link from "next/link";
import { GRADING_ITEMS, GRADE_OPTIONS } from "@/lib/vehicle-grading";
import type { ListingGrades } from "@/lib/types";

type Props = {
  grades: ListingGrades;
  onChange: (grades: ListingGrades) => void;
  inspectionRemaining: string;
  onInspectionRemainingChange: (value: string) => void;
};

export function ListingGradingInput({
  grades,
  onChange,
  inspectionRemaining,
  onInspectionRemainingChange,
}: Props) {
  const set = (key: keyof ListingGrades, value: number) => {
    onChange({ ...grades, [key]: value });
  };

  return (
    <div className="space-y-4 rounded-xl border border-accent/25 bg-zinc-950/50 p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-accent">車両評価</h2>
          <p className="mt-1 text-xs text-muted">各項目 1〜10点（タップで選択）</p>
        </div>
        <Link href="/evaluation" className="text-xs text-accent hover:underline" target="_blank">
          評価基準を見る →
        </Link>
      </div>

      <div className="space-y-4">
        {GRADING_ITEMS.map((item) => {
          const current = grades[item.key];
          return (
            <div key={item.key}>
              <p className="text-xs font-medium text-muted">
                {item.label}
                <span className="text-accent">
                  {current === "" ? " — 未選択" : ` — ${current}点`}
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {GRADE_OPTIONS.map((n) => {
                  const active = current === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set(item.key, n)}
                      className={`flex h-11 min-w-11 items-center justify-center rounded-lg border text-sm font-semibold touch-manipulation ${
                        active
                          ? "border-accent bg-accent/25 text-accent"
                          : "border-border bg-card text-foreground active:border-accent"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <label className="block text-sm">
        <span className="text-muted">車検残（任意）</span>
        <input
          value={inspectionRemaining}
          onChange={(e) => onInspectionRemainingChange(e.target.value)}
          placeholder="例: 1年5ヶ月 / R7年3月 / 2027-03"
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}
