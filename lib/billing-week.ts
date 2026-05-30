/** 週次手数料の集計週（土曜0:00〜金曜23:59 JST）— DB billing_week_bounds_for_date と同期 */

export type BillingWeekBounds = {
  weekStart: string;
  weekEnd: string;
};

export function jstDateString(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** 指定日（YYYY-MM-DD, JST）を含む集計週（土〜金） */
export function billingWeekBoundsForDate(isoDate: string): BillingWeekBounds {
  const day = new Date(`${isoDate}T12:00:00+09:00`);
  const daysSinceSat = (day.getDay() + 1) % 7;
  const start = new Date(day);
  start.setDate(start.getDate() - daysSinceSat);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
  return { weekStart: fmt(start), weekEnd: fmt(end) };
}

export function formatBillingWeekLabel(start: string, end: string): string {
  return `${start.replace(/-/g, "/")} 〜 ${end.replace(/-/g, "/")}`;
}

export const WEEKLY_VEHICLE_FEE_KIND = "weekly_vehicle_platform_fee" as const;
export const WEEKLY_PART_FEE_KIND = "weekly_part_platform_fee" as const;

export function isWeeklyPlatformFeeKind(kind: string | null | undefined): boolean {
  return kind === WEEKLY_VEHICLE_FEE_KIND || kind === WEEKLY_PART_FEE_KIND;
}
