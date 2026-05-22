import { TRUST_RANK_LABELS, TRUST_RANK_STYLES, formatTrustScore } from "@/lib/trust";
import type { TrustRank } from "@/lib/types";

export function TrustBadge({
  rank,
  score,
  compact = false,
}: {
  rank: TrustRank;
  score: number;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-semibold ${TRUST_RANK_STYLES[rank]} ${
        compact ? "text-[10px]" : "text-xs"
      }`}
      title="バッジ色＝前年末締め時のランク / 点数＝当年の信用点数（100点スタート・減点制）"
    >
      <span>{TRUST_RANK_LABELS[rank]}</span>
      {!compact ? <span className="opacity-80">·</span> : null}
      <span className={compact ? "" : "tabular-nums"}>{formatTrustScore(score)}</span>
    </span>
  );
}
