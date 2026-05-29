export function LpSection({
  id,
  tag,
  title,
  lead,
  children,
  className = "",
}: {
  id?: string;
  tag?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 py-14 md:py-20 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        {tag ? (
          <span className="inline-block rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
            {tag}
          </span>
        ) : null}
        <h2 className="mt-4 text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
        {lead ? <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted md:text-lg">{lead}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}
