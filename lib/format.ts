export function formatYen(amount: number) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${km.toLocaleString("ja-JP")} km`;
}

export function formatYear(year: number | null | undefined): string {
  if (year == null) return "—";
  return `${year}年式`;
}
