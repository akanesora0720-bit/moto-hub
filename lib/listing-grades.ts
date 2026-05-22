import { GRADE_DB_COLUMNS, GRADING_ITEMS } from "@/lib/vehicle-grading";
import { EMPTY_LISTING_GRADES, type ListingGrades, type ListingGradesStored } from "@/lib/types";

export function gradesToDbPayload(grades: ListingGrades) {
  const payload: Record<string, number> = {};
  for (const item of GRADING_ITEMS) {
    const v = grades[item.key];
    if (v !== "") payload[GRADE_DB_COLUMNS[item.key]] = v;
  }
  return payload;
}

export function parseGradesFromListing(row: Record<string, unknown>): ListingGradesStored {
  return {
    total: (row.grade_total as number | null) ?? null,
    engine: (row.grade_engine as number | null) ?? null,
    front: (row.grade_front as number | null) ?? null,
    exterior: (row.grade_exterior as number | null) ?? null,
    rear: (row.grade_rear as number | null) ?? null,
    electrical: (row.grade_electrical as number | null) ?? null,
    frame: (row.grade_frame as number | null) ?? null,
  };
}

export function parseGradesToForm(row: Record<string, unknown>): ListingGrades {
  const stored = parseGradesFromListing(row);
  const grades = { ...EMPTY_LISTING_GRADES };
  for (const item of GRADING_ITEMS) {
    const v = stored[item.key];
    grades[item.key] = v ?? "";
  }
  return grades;
}

export function parsePriceYen(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Math.round(Number(trimmed));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatGradesCompact(grades: ListingGradesStored): string {
  return GRADING_ITEMS.filter((i) => i.key !== "total" && grades[i.key] != null)
    .map((i) => `${i.short}${grades[i.key]}`)
    .join(" ");
}

export function validateListingGrades(grades: ListingGrades): string | null {
  for (const item of GRADING_ITEMS) {
    const v = grades[item.key];
    if (v === "" || v < 1 || v > 10) {
      return `${item.short} の評価（1〜10）を選択してください。`;
    }
  }
  return null;
}
