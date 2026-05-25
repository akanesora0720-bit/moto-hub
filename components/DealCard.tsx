export function DealCard({
  title,
  step,
  children,
  className = "",
}: {
  title: string;
  step?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-border bg-card p-4 shadow-sm ${className}`}
    >
      <header className="mb-3 flex items-baseline gap-2 border-b border-border/60 pb-2">
        {step != null ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
            {step}
          </span>
        ) : null}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </header>
      {children}
    </section>
  );
}
