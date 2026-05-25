import { MOTOHUB_INSPECTION_BADGE_DESCRIPTION, MOTOHUB_INSPECTION_BADGE_TITLE } from "@/lib/inspection";

export function MotohubInspectionBadge({ showHint = false }: { showHint?: boolean }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span
        className="inline-flex w-fit items-center rounded border border-sky-400/50 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-100"
        title={MOTOHUB_INSPECTION_BADGE_DESCRIPTION}
      >
        {MOTOHUB_INSPECTION_BADGE_TITLE}
      </span>
      {showHint ? (
        <span className="text-[10px] leading-snug text-muted">{MOTOHUB_INSPECTION_BADGE_DESCRIPTION}</span>
      ) : null}
    </span>
  );
}
