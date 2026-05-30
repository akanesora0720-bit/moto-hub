import Link from "next/link";

export function StatBadge({
  count,
  label,
  href,
  urgent,
}: {
  count: number;
  label: string;
  href: string;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-w-[7rem] flex-col rounded-xl border px-4 py-3 transition hover:border-accent/40 ${
        count > 0
          ? urgent
            ? "border-rose-500/40 bg-rose-500/10"
            : "border-amber-500/30 bg-amber-500/5"
          : "border-border bg-card"
      }`}
    >
      <span className="text-xs text-muted">{label}</span>
      <span
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          count > 0 ? (urgent ? "text-rose-300" : "text-amber-200") : "text-foreground"
        }`}
      >
        {count}
        {count > 0 ? (
          <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" />
        ) : null}
      </span>
    </Link>
  );
}

const heroCardClass =
  "block rounded-2xl border-2 border-accent/55 bg-gradient-to-br from-card to-zinc-900/80 p-6 shadow-md shadow-accent/10 transition hover:border-accent hover:shadow-lg hover:shadow-accent/15 md:p-7";

export function ActionCard({
  title,
  description,
  href,
  sublinks,
  primary,
  hero,
  ctaLabel,
}: {
  title: string;
  description: string;
  href: string;
  sublinks?: { label: string; href: string }[];
  /** @deprecated Use hero — 旧レイアウト互換（2カラム全幅） */
  primary?: boolean;
  /** 仕入れ導線など、車両・パーツ検索の2大カード用（横並び同等サイズ） */
  hero?: boolean;
  ctaLabel?: string;
}) {
  const isHero = hero || primary;
  return (
    <Link
      href={href}
      className={
        hero
          ? heroCardClass
          : primary
            ? `${heroCardClass} sm:col-span-2`
            : "block rounded-xl border border-border bg-card p-5 transition hover:border-accent/40 hover:bg-zinc-900/40"
      }
    >
      <h3 className={isHero ? "text-xl font-bold tracking-tight md:text-2xl" : "font-semibold"}>
        {title}
      </h3>
      <p className={`text-muted ${isHero ? "mt-2 text-base md:text-lg" : "mt-1 text-sm"}`}>
        {description}
      </p>
      {ctaLabel ? (
        <span className="mt-5 inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-black md:text-base">
          {ctaLabel}
        </span>
      ) : null}
      {sublinks && sublinks.length > 0 ? (
        <ul
          className={`space-y-1 border-t border-border/60 pt-3 ${ctaLabel ? "mt-4" : "mt-3"}`}
        >
          {sublinks.map((s) => (
            <li key={s.href}>
              <span className="text-xs text-accent">{s.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}

export function KpiCard({
  label,
  value,
  href,
  highlight,
}: {
  label: string;
  value: string | number;
  href?: string;
  highlight?: boolean;
}) {
  const className = `rounded-xl border border-border bg-card px-4 py-3 ${
    href ? "block transition hover:border-accent/40" : ""
  }`;

  const inner = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          highlight ? "text-amber-200" : ""
        }`}
      >
        {value}
      </p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function ActionQueue({
  items,
  emptyMessage = "今は要対応の項目はありません。",
}: {
  items: { label: string; count: number; href: string; urgent?: boolean }[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-1 rounded-xl border border-border bg-card p-2">
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <Link
            href={item.href}
            className={`flex items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm transition hover:bg-zinc-900/60 ${
              item.urgent ? "text-rose-100" : ""
            }`}
          >
            <span className="font-medium">{item.label}</span>
            <span
              className={`min-w-[1.75rem] rounded-full px-2.5 py-0.5 text-center text-xs font-bold tabular-nums ${
                item.urgent ? "bg-rose-500 text-white" : "bg-amber-500/25 text-amber-100"
              }`}
            >
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ManagementSection({
  title,
  items,
}: {
  title: string;
  items: { label: string; count: number; href: string; note?: string }[];
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={`${item.href}-${item.label}`}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition hover:bg-zinc-900/60"
            >
              <span>{item.label}</span>
              <span className="flex items-center gap-2">
                {item.note ? (
                  <span className="text-xs text-muted">{item.note}</span>
                ) : null}
                <span
                  className={`min-w-[1.5rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums ${
                    item.count > 0
                      ? "bg-rose-500/20 text-rose-200"
                      : "bg-zinc-800 text-muted"
                  }`}
                >
                  {item.count}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
