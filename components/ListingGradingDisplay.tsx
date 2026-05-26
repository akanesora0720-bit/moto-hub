import { GRADING_ITEMS } from "@/lib/vehicle-grading";
import type { ListingGradesStored } from "@/lib/types";

function formatYmdJa(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${y}年${m}月${d}日`;
}

export function ListingGradingDisplay({
  grades,
  inspectionRemaining,
  inspectionExpiryDate,
  liabilityInsuranceExpiryDate,
  compact = false,
}: {
  grades: ListingGradesStored;
  inspectionRemaining: string | null;
  inspectionExpiryDate?: string | null;
  liabilityInsuranceExpiryDate?: string | null;
  compact?: boolean;
}) {
  const hasAny = GRADING_ITEMS.some((i) => grades[i.key] != null);
  const hasDates = !!(inspectionExpiryDate || liabilityInsuranceExpiryDate);
  if (!hasAny && !inspectionRemaining && !hasDates) return null;

  return (
    <div
      className={`rounded-xl border border-border bg-card ${compact ? "p-3" : "p-5"}`}
    >
      <h2 className={`font-semibold ${compact ? "text-sm" : ""}`}>車両評価</h2>
      {hasAny ? (
        <div className={`mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7 ${compact ? "gap-1.5" : "gap-3"}`}>
          {GRADING_ITEMS.map((item) => {
            const score = grades[item.key];
            return (
              <div
                key={item.key}
                className="flex flex-col items-center rounded-lg border border-border/80 bg-zinc-950/80 py-2"
              >
                <span className="text-[10px] text-muted">{item.short}</span>
                <span
                  className={`font-serif font-semibold tabular-nums text-accent ${
                    compact ? "text-xl" : "text-2xl sm:text-3xl"
                  }`}
                >
                  {score ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
      {hasDates ? (
        <dl
          className={`grid gap-2 sm:grid-cols-2 ${hasAny ? "mt-3" : "mt-2"} ${compact ? "text-xs" : "text-sm"}`}
        >
          {inspectionExpiryDate ? (
            <div>
              <dt className="text-zinc-500">車検満了日</dt>
              <dd>{formatYmdJa(inspectionExpiryDate)}</dd>
            </div>
          ) : null}
          {liabilityInsuranceExpiryDate ? (
            <div>
              <dt className="text-zinc-500">自賠責満了日</dt>
              <dd>{formatYmdJa(liabilityInsuranceExpiryDate)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {inspectionRemaining ? (
        <p className={`text-muted ${hasAny || hasDates ? "mt-3" : "mt-2"} ${compact ? "text-xs" : "text-sm"}`}>
          <span className="text-zinc-500">車検残メモ：</span>
          {inspectionRemaining}
        </p>
      ) : null}
    </div>
  );
}
