import {
  GRADE_SCALE,
  GRADING_ITEMS,
  SAMPLE_SCORES,
} from "@/lib/vehicle-grading";

function ScoreCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border/80 bg-zinc-950/80 px-3 py-4 sm:px-5 sm:py-5">
      <span className="text-xs font-medium tracking-widest text-muted sm:text-sm">{label}</span>
      <span className="mt-2 font-serif text-4xl font-semibold tabular-nums text-accent sm:text-5xl lg:text-6xl">
        {score}
      </span>
    </div>
  );
}

export function VehicleGradingSlide({ compact = false }: { compact?: boolean }) {
  return (
    <article
      className={`overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-zinc-900/90 to-card ${
        compact ? "" : "shadow-2xl shadow-black/40"
      }`}
    >
      <header className="border-b border-border/80 bg-zinc-950/60 px-6 py-8 sm:px-10 sm:py-10">
        <p className="text-xs font-medium tracking-[0.35em] text-accent uppercase">
          MotoHub Inspection Standard
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          MotoHub 車両評価基準
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          MotoHubでは、業販市場における分かりやすさを重視し、
          オークション業界に近い評価基準を採用しています。
        </p>
      </header>

      <div className="px-6 py-8 sm:px-10 sm:py-10">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-300">評価項目</h2>
          <span className="text-[10px] tracking-wider text-muted uppercase">Sample Display</span>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
          {GRADING_ITEMS.map((item) => (
            <ScoreCell
              key={item.key}
              label={item.short}
              score={SAMPLE_SCORES[item.key]}
            />
          ))}
        </div>

        <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted sm:text-sm">
          {GRADING_ITEMS.map((item) => (
            <li key={item.key}>
              <span className="text-zinc-500">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border/80 bg-zinc-950/40 px-6 py-8 sm:px-10 sm:py-10">
        <h2 className="text-sm font-semibold tracking-wide text-accent">評価基準（10〜1点）</h2>
        <div className="mt-6 space-y-0 divide-y divide-border/60">
          {GRADE_SCALE.map((row) => (
            <div
              key={row.score}
              className="grid grid-cols-[3rem_1fr] gap-4 py-4 sm:grid-cols-[4rem_1fr] sm:gap-6"
            >
              <div className="flex items-start justify-center">
                <span className="font-serif text-3xl font-semibold tabular-nums text-accent sm:text-4xl">
                  {row.score}
                </span>
              </div>
              <div>
                <p className="font-medium text-foreground">{row.title}</p>
                {row.detail ? (
                  <p className="mt-1 text-sm text-muted">{row.detail}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-accent/20 bg-accent/5 px-6 py-5 sm:px-10">
        <p className="text-center text-xs leading-relaxed text-zinc-400 sm:text-sm">
          <span className="text-accent">補足：</span>
          査定点数（車両評価）と会員信用点数（trust_score）は別管理です。
          車両の状態は出品・査定情報で、取引の信頼は会員プロフィールでご確認ください。
        </p>
      </footer>
    </article>
  );
}
