"use client";

import { MobilePicker } from "@/components/MobilePicker";
import { PREFECTURES, PREFECTURE_PLACEHOLDER } from "@/lib/prefectures";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

/**
 * 都道府県選択（47都道府県）。モバイルでは一覧モーダルで選択。
 */
export function PrefectureSelect({
  value,
  onChange,
  required,
  allowEmpty = false,
  emptyLabel = "都道府県指定なし",
}: Props) {
  const options = [
    ...(allowEmpty ? [{ value: "", label: emptyLabel }] : []),
    ...PREFECTURES.map((p) => ({ value: p, label: p })),
  ];

  return (
    <MobilePicker
      label="都道府県"
      value={value}
      onChange={onChange}
      options={options}
      placeholder={allowEmpty ? emptyLabel : PREFECTURE_PLACEHOLDER}
      required={required}
    />
  );
}
