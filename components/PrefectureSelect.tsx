"use client";

import { PREFECTURE_GROUPS, PREFECTURE_PLACEHOLDER } from "@/lib/prefectures";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  /** フィルタ用: 先頭に「指定なし」を出す */
  allowEmpty?: boolean;
  emptyLabel?: string;
};

const baseClass =
  "mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm text-foreground";

/**
 * 都道府県選択（47都道府県・地域グループ付き）。
 * 初期値を東京都固定にしないことで、モバイルでも一覧から選べることを明確化。
 */
export function PrefectureSelect({
  value,
  onChange,
  id = "prefecture",
  className,
  required,
  allowEmpty = false,
  emptyLabel = "都道府県指定なし",
}: Props) {
  return (
    <select
      id={id}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? baseClass}
    >
      {allowEmpty ? (
        <option value="">{emptyLabel}</option>
      ) : (
        <option value={PREFECTURE_PLACEHOLDER} disabled>
          都道府県を選択
        </option>
      )}
      {PREFECTURE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.prefectures.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
