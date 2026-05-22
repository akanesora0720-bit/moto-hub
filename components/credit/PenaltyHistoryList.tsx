import { formatPenaltyCategory, type PenaltyCategory } from "@/lib/credit";
import type { PenaltyHistoryRow } from "@/lib/credit-data";

export function PenaltyHistoryList({ rows }: { rows: PenaltyHistoryRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        減点履歴はありません
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-xl border border-border bg-card px-4 py-3 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="font-mono text-lg font-semibold text-rose-300">
              −{row.penalty_points}点
            </span>
            <span className="rounded border border-border px-2 py-0.5 text-[10px] text-muted">
              {formatPenaltyCategory(row.category as PenaltyCategory)}
            </span>
          </div>
          <p className="mt-2 leading-relaxed">{row.reason}</p>
          <p className="mt-2 text-[10px] text-zinc-500">
            {new Date(row.created_at).toLocaleString("ja-JP")}
          </p>
        </li>
      ))}
    </ul>
  );
}
