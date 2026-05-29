import type { MarketStats } from "@/lib/market-stats";

export function MarketStatsBar({ stats }: { stats: MarketStats }) {
  const items = [
    { label: "掲載車両", value: stats.listings, unit: "台" },
    { label: "掲載パーツ", value: stats.parts, unit: "点" },
  ];

  return (
    <section
      className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card/80 p-4"
      aria-label="Moto-Hub 掲載規模"
    >
      {items.map((item) => (
        <div key={item.label} className="text-center sm:text-left">
          <p className="text-xs text-muted">{item.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">
            {item.value.toLocaleString("ja-JP")}
            <span className="ml-0.5 text-sm font-normal text-muted">{item.unit}</span>
          </p>
        </div>
      ))}
    </section>
  );
}
