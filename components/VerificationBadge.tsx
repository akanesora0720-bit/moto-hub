import { VERIFICATION_STATUS_LABELS } from "@/lib/constants";
import type { VerificationStatus } from "@/lib/types";

const styles: Record<VerificationStatus, string> = {
  unverified: "border-zinc-600 bg-zinc-800 text-zinc-400",
  pending: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  verified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      古物商 {VERIFICATION_STATUS_LABELS[status]}
    </span>
  );
}
