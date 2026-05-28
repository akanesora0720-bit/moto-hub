import { PART_FEE_NOTICE, PART_FEE_NOTICE_SHORT } from "@/lib/part-fees";

export function PartFeeNotice({
  variant = "default",
  className = "",
}: {
  variant?: "default" | "compact";
  className?: string;
}) {
  const text = variant === "compact" ? PART_FEE_NOTICE_SHORT : PART_FEE_NOTICE;

  return (
    <p
      className={`rounded-lg border border-border/80 bg-zinc-900/60 px-3 py-2 text-sm text-muted ${className}`}
      role="note"
    >
      <span className="font-medium text-foreground">手数料について：</span> {text}
    </p>
  );
}
