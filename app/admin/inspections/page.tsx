"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { InspectionRequestStaffActions } from "@/components/InspectionRequestStaffActions";
import {
  INSPECTION_REQUEST_STATUS_LABELS,
  formatInspectionDateTime,
  type InspectionRequest,
} from "@/lib/inspection";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

export default function AdminInspectionsPage() {
  return (
    <Suspense fallback={<InspectionsPageFallback />}>
      <AdminInspectionsContent />
    </Suspense>
  );
}

function InspectionsPageFallback() {
  return (
    <AppShell mode="admin">
      <p className="text-sm text-muted">読み込み中…</p>
    </AppShell>
  );
}

function AdminInspectionsContent() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  const [rows, setRows] = useState<(InspectionRequest & { invoice_id?: string | null })[]>([]);
  const [dealers, setDealers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("inspection_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as InspectionRequest[];
    setRows(list);

    const dealerIds = [...new Set(list.map((r) => r.dealer_id))];
    if (dealerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, store_name")
        .in("id", dealerIds);
      const map: Record<string, string> = {};
      for (const p of profiles ?? []) {
        map[p.id as string] = (p.store_name as string) ?? p.id;
      }
      setDealers(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`inspection-row-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-accent/50");
    const t = window.setTimeout(() => {
      el?.classList.remove("ring-2", "ring-accent/50");
    }, 3000);
    return () => window.clearTimeout(t);
  }, [focusId, loading, rows.length]);

  return (
    <AppShell mode="admin">
      <div className="space-y-6">
        <div>
          <Link href="/admin/workspace" className="text-sm text-muted hover:text-accent">
            ← 管理画面
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">Moto-Hub査定依頼</h1>
          <p className="mt-1 text-sm text-muted">
            加盟店の希望日時を確認し、対応可能な日時を提案 → 加盟店の承諾後に「査定を開始」→ 出品代行登録で完了します。
          </p>
        </div>

        {loading ? <p className="text-sm text-muted">読み込み中…</p> : null}
        {message ? <p className="text-sm text-rose-300">{message}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-border bg-zinc-900/80 text-xs text-muted">
              <tr>
                <th className="px-3 py-2">車両</th>
                <th className="px-3 py-2">加盟店</th>
                <th className="px-3 py-2">保管場所</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">希望日時</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  id={`inspection-row-${r.id}`}
                  className="border-b border-border/50 align-top transition-shadow"
                >
                  <td className="px-3 py-3 font-medium">{r.vehicle_name}</td>
                  <td className="px-3 py-3">{dealers[r.dealer_id] ?? "—"}</td>
                  <td className="px-3 py-3 text-xs">{r.storage_location}</td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs">
                      {INSPECTION_REQUEST_STATUS_LABELS[r.status]}
                    </span>
                    <p className="mt-1 text-xs text-muted">{formatYen(r.fee_ex_tax)} 税抜</p>
                  </td>
                  <td className="px-3 py-3 text-xs">{formatInspectionDateTime(r.preferred_at)}</td>
                  <td className="px-3 py-3">
                    <InspectionRequestStaffActions
                      request={r}
                      busy={actionId === r.id}
                      onBusyChange={setActionId}
                      onMessage={setMessage}
                      onUpdated={load}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
