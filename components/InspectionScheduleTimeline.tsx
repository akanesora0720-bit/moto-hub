import {
  formatInspectionDateTime,
  INSPECTION_REQUEST_STATUS_LABELS,
  type InspectionRequest,
} from "@/lib/inspection";

export function InspectionScheduleTimeline({ request }: { request: InspectionRequest }) {
  const proposedByLabel =
    request.schedule_proposed_by === "staff"
      ? "Moto-Hubスタッフ"
      : request.schedule_proposed_by === "dealer"
        ? "加盟店"
        : null;

  return (
    <div className="space-y-2 rounded-lg border border-border/80 bg-zinc-950/50 px-3 py-2.5 text-xs">
      <p className="font-medium text-zinc-200">
        {INSPECTION_REQUEST_STATUS_LABELS[request.status]}
      </p>
      <dl className="space-y-1.5 text-muted">
        <div className="flex justify-between gap-3">
          <dt>ご希望日時</dt>
          <dd className="text-right text-foreground">{formatInspectionDateTime(request.preferred_at)}</dd>
        </div>
        {request.schedule_proposed_at ? (
          <div className="flex justify-between gap-3">
            <dt>{proposedByLabel ? `${proposedByLabel}の提案` : "提案日時"}</dt>
            <dd className="text-right text-sky-200">
              {formatInspectionDateTime(request.schedule_proposed_at)}
            </dd>
          </div>
        ) : null}
        {request.schedule_proposed_note ? (
          <div>
            <dt className="mb-0.5">メッセージ</dt>
            <dd className="whitespace-pre-wrap text-foreground">{request.schedule_proposed_note}</dd>
          </div>
        ) : null}
        {request.scheduled_at ? (
          <div className="flex justify-between gap-3 border-t border-border/60 pt-1.5">
            <dt className="text-emerald-200/90">確定日時</dt>
            <dd className="text-right font-medium text-emerald-200">
              {formatInspectionDateTime(request.scheduled_at)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
