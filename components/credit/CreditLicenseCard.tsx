import { TrustBadge } from "@/components/TrustBadge";
import { TRUST_RANK_BANDS } from "@/lib/credit";
import type { TrustRank } from "@/lib/types";

export function CreditLicenseCard({
  score,
  badge,
  yearlyResetAt,
}: {
  score: number;
  badge: TrustRank;
  yearlyResetAt: string | null;
}) {
  const band = TRUST_RANK_BANDS[badge];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-6 ${
        badge === "GOLD"
          ? "border-amber-400/50 bg-gradient-to-br from-amber-950/80 to-zinc-950"
          : badge === "BLUE"
            ? "border-sky-400/40 bg-gradient-to-br from-sky-950/60 to-zinc-950"
            : badge === "YELLOW"
              ? "border-yellow-500/40 bg-gradient-to-br from-yellow-950/40 to-zinc-950"
              : "border-rose-500/50 bg-gradient-to-br from-rose-950/50 to-zinc-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium tracking-[0.25em] text-zinc-400 uppercase">
            RideWorks 加盟店信用証
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            減点のみ・年中の加点なし。毎年1/1に100点へリセット
          </p>
        </div>
        <TrustBadge rank={badge} score={score} />
      </div>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted">当年の残り点数</p>
          <p className="mt-1 font-mono text-5xl font-bold tabular-nums tracking-tight">{score}</p>
          <p className="mt-1 text-xs text-zinc-500">点 / 100点満点</p>
        </div>
        <div className="text-right text-sm">
          <p className="text-muted">表示バッジ</p>
          <p className="mt-1 text-lg font-semibold">{band.label}</p>
          <p className="text-xs text-zinc-500">{band.description}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-4 gap-1 text-center text-[9px] text-zinc-500">
        {(Object.keys(TRUST_RANK_BANDS) as TrustRank[]).map((r) => {
          const b = TRUST_RANK_BANDS[r];
          const active = r === badge;
          return (
            <div
              key={r}
              className={`rounded px-1 py-1.5 ${active ? "bg-white/10 font-semibold text-foreground" : ""}`}
            >
              {b.label}
              <br />
              {b.min}〜{b.max}
            </div>
          );
        })}
      </div>

      {yearlyResetAt ? (
        <p className="mt-4 text-[10px] text-zinc-500">
          直近リセット: {new Date(yearlyResetAt).toLocaleDateString("ja-JP")}
        </p>
      ) : null}
    </div>
  );
}
