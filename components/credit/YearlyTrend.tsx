import { TRUST_RANK_LABELS } from "@/lib/trust";
import type { YearlySnapshotRow } from "@/lib/credit-data";
import type { TrustRank } from "@/lib/types";

const RANK_BAR: Record<TrustRank, string> = {
  GOLD: "bg-amber-400",
  BLUE: "bg-sky-400",
  YELLOW: "bg-yellow-400",
  RED: "bg-rose-500",
};

export function YearlyTrend({ snapshots }: { snapshots: YearlySnapshotRow[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="text-sm text-muted">
        年末締めの記録がまだありません。12/31締め後に年間推移が表示されます。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {snapshots.map((s) => (
        <div key={s.year} className="flex items-center gap-3 text-sm">
          <span className="w-12 shrink-0 tabular-nums text-muted">{s.year}年</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full ${RANK_BAR[s.final_badge]}`}
              style={{ width: `${s.final_score}%` }}
            />
          </div>
          <span className="w-16 shrink-0 text-right tabular-nums">{s.final_score}点</span>
          <span className="w-20 shrink-0 text-right text-xs text-muted">
            {TRUST_RANK_LABELS[s.final_badge]}
          </span>
        </div>
      ))}
    </div>
  );
}
