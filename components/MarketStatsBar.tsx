import { MARKET_STATS_PLACEHOLDER } from "@/lib/market-stats-placeholder";

export function MarketStatsBar() {
  const items = [
    MARKET_STATS_PLACEHOLDER.listings,
    MARKET_STATS_PLACEHOLDER.parts,
    MARKET_STATS_PLACEHOLDER.negotiating,
  ];

  return (
    <section
      className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-card/80 p-4"
      aria-label="MotoHub 市場規模（参考値）"
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
      <p className="col-span-3 border-t border-border/60 pt-2 text-center text-[10px] text-muted sm:text-left">
        ※ 参考値（β版・今後リアルタイム集計に差し替え予定）
      </p>
    </section>
  );
}
