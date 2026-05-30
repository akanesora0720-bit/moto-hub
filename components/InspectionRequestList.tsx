"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { InspectionRequestDealerActions } from "@/components/InspectionRequestDealerActions";
import {
  INSPECTION_REQUEST_STATUS_LABELS,
  type InspectionRequest,
  type InspectionRequestStatus,
} from "@/lib/inspection";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export function InspectionRequestList({ initial }: { initial: InspectionRequest[] }) {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const [rows, setRows] = useState(initial);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data } = await supabase
      .from("inspection_requests")
      .select("*")
      .eq("dealer_id", auth.user.id)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as InspectionRequest[]);
  }, []);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`dealer-inspection-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-accent/50");
    const t = window.setTimeout(() => el?.classList.remove("ring-2", "ring-accent/50"), 3000);
    return () => window.clearTimeout(t);
  }, [focusId, rows.length]);

  if (rows.length === 0) {
    return <p className="text-sm text-muted">まだ依頼はありません。</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          id={`dealer-inspection-${r.id}`}
          className="rounded-xl border border-border bg-card p-4 text-sm transition-shadow"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{r.vehicle_name}</p>
            <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">
              {INSPECTION_REQUEST_STATUS_LABELS[r.status as InspectionRequestStatus]}
            </span>
          </div>
          <p className="mt-1 text-muted">{r.storage_location}</p>
          <p className="mt-2 text-xs text-muted">料金（税抜）: {formatYen(r.fee_ex_tax)}</p>
          <InspectionRequestDealerActions request={r} onUpdated={() => void reload()} />
        </li>
      ))}
    </ul>
  );
}
