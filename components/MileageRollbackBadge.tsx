import type { MileageRollbackStatus } from "@/lib/constants";

const styles: Record<Exclude<MileageRollbackStatus, "none">, string> = {
  suspected: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  confirmed: "border-rose-500/50 bg-rose-500/10 text-rose-200",
};

const labels: Record<Exclude<MileageRollbackStatus, "none">, string> = {
  suspected: "距離減算の疑い",
  confirmed: "距離減算歴あり",
};

export function MileageRollbackBadge({ status }: { status: MileageRollbackStatus }) {
  if (status === "none") return null;
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-semibold ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
