/** datetime-local ↔ ISO（査定日程 UI 用） */

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const iso = new Date(value).toISOString();
  if (Number.isNaN(Date.parse(iso))) return null;
  return iso;
}
