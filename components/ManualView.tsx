import type { ManualBlock, ManualSection } from "@/lib/manual-types";

function Block({ block }: { block: ManualBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="text-sm leading-relaxed text-foreground/90">{block.text}</p>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-foreground/90">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[280px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-card">
                {block.headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join()} className="border-b border-border/60 last:border-0">
                  {row.map((cell, i) => (
                    <td key={i} className="px-3 py-2 align-top text-foreground/90">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "callout":
      return (
        <p className="rounded-xl border border-sky-500/30 bg-sky-950/20 px-4 py-3 text-sm leading-relaxed text-sky-100">
          {block.text}
        </p>
      );
    default:
      return null;
  }
}

export function ManualView({
  sections,
  footer,
}: {
  sections: ManualSection[];
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-10">
      <nav className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">目次</p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-accent hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="scroll-mt-6 space-y-4">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <div className="space-y-4">
            {section.blocks.map((block, i) => (
              <Block key={`${section.id}-${i}`} block={block} />
            ))}
          </div>
        </section>
      ))}

      {footer ? <div className="text-sm text-muted">{footer}</div> : null}
    </div>
  );
}
