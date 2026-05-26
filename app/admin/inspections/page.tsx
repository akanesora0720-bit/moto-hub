"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  INSPECTION_REQUEST_STATUS_LABELS,
  formatInspectionDateTime,
  type InspectionRequest,
  type InspectionRequestStatus,
} from "@/lib/inspection";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const OPEN_STATUSES: InspectionRequestStatus[] = ["requested", "scheduled", "in_progress"];

export default function AdminInspectionsPage() {
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

  const updateRequest = async (
    id: string,
    patch: {
      status?: InspectionRequestStatus;
      scheduled_at?: string;
    },
  ) => {
    setActionId(id);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("staff_update_inspection_request", {
      p_request_id: id,
      p_status: patch.status ?? null,
      p_assigned_staff_id: null,
      p_scheduled_at: patch.scheduled_at ?? null,
      p_notes: null,
    });
    setActionId(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    await load();
  };

  return (
    <AppShell mode="admin">
      <div className="space-y-6">
        <div>
          <Link href="/admin/workspace" className="text-sm text-muted hover:text-accent">
            ← 管理画面
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">MotoHub査定依頼</h1>
          <p className="mt-1 text-sm text-muted">
            スタッフのみ対応。現車確認後、出品代行登録で「MotoHub査定済」を付与します。
          </p>
        </div>

        {loading ? <p className="text-sm text-muted">読み込み中…</p> : null}
        {message ? <p className="text-sm text-rose-300">{message}</p> : null}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-zinc-900/80 text-xs text-muted">
              <tr>
                <th className="px-3 py-2">車両</th>
                <th className="px-3 py-2">加盟店</th>
                <th className="px-3 py-2">保管場所</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">希望</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 align-top">
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
                  <td className="px-3 py-3 space-y-1 text-xs">
                    {OPEN_STATUSES.includes(r.status) ? (
                      <>
                        {r.status === "requested" ? (
                          <button
                            type="button"
                            disabled={actionId === r.id}
                            className="block text-sky-300 hover:underline disabled:opacity-50"
                            onClick={() =>
                              void updateRequest(r.id, {
                                status: "scheduled",
                                scheduled_at: r.preferred_at ?? undefined,
                              })
                            }
                          >
                            日程確定へ
                          </button>
                        ) : null}
                        {r.status === "scheduled" ? (
                          <button
                            type="button"
                            disabled={actionId === r.id}
                            className="block text-sky-300 hover:underline disabled:opacity-50"
                            onClick={() => void updateRequest(r.id, { status: "in_progress" })}
                          >
                            査定開始
                          </button>
                        ) : null}
                        {r.status === "in_progress" ? (
                          <Link
                            href={`/admin/inspections/${r.id}/register`}
                            className="block font-medium text-accent hover:underline"
                          >
                            出品代行登録 →
                          </Link>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {r.invoice_id ? (
                          <a
                            href={`/api/invoices/${r.invoice_id}/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-accent hover:underline"
                          >
                            請求書PDF
                          </a>
                        ) : null}
                        {r.listing_id ? (
                          <Link href={`/listings/${r.listing_id}`} className="text-accent hover:underline">
                            出品を見る
                          </Link>
                        ) : (
                          "—"
                        )}
                      </>
                    )}
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
