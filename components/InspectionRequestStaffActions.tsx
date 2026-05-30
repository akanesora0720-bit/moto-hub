"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InspectionScheduleTimeline } from "@/components/InspectionScheduleTimeline";
import type { InspectionRequest } from "@/lib/inspection";
import { datetimeLocalToIso, toDatetimeLocalValue } from "@/lib/inspection-datetime";
import { createClient } from "@/lib/supabase/client";

type Props = {
  request: InspectionRequest;
  busy: boolean;
  onBusyChange: (id: string | null) => void;
  onMessage: (msg: string) => void;
  onUpdated: () => Promise<void>;
};

export function InspectionRequestStaffActions({
  request,
  busy,
  onBusyChange,
  onMessage,
  onUpdated,
}: Props) {
  const initialAt =
    request.schedule_proposed_by === "dealer"
      ? request.schedule_proposed_at
      : request.schedule_proposed_at ?? request.preferred_at;

  const [scheduleLocal, setScheduleLocal] = useState(() => toDatetimeLocalValue(initialAt));
  const [note, setNote] = useState(request.schedule_proposed_note ?? "");
  const [hint, setHint] = useState("");

  useEffect(() => {
    setScheduleLocal(toDatetimeLocalValue(initialAt));
    setNote(request.schedule_proposed_note ?? "");
  }, [
    request.id,
    request.preferred_at,
    request.schedule_proposed_at,
    request.schedule_proposed_by,
    request.schedule_proposed_note,
    initialAt,
  ]);

  const runRpc = async (
    call: () => PromiseLike<{ error: { message: string } | null }>,
  ) => {
    onBusyChange(request.id);
    onMessage("");
    const { error } = await call();
    onBusyChange(null);
    if (error) {
      onMessage(error.message);
      return;
    }
    await onUpdated();
  };

  const parseAt = (): string | null => {
    const iso = datetimeLocalToIso(scheduleLocal);
    if (!iso) {
      setHint("日時を選択してください。");
      return null;
    }
    setHint("");
    return iso;
  };

  const propose = async (message: string) => {
    const iso = parseAt();
    if (!iso) return;
    const supabase = createClient();
    await runRpc(() =>
      supabase.rpc("staff_propose_inspection_schedule", {
        p_request_id: request.id,
        p_proposed_at: iso,
        p_note: message || note.trim() || null,
      }),
    );
  };

  if (request.status === "completed" || request.status === "cancelled") {
    return (
      <div className="space-y-2">
        <InspectionScheduleTimeline request={request} />
        {request.invoice_id ? (
          <a
            href={`/api/invoices/${request.invoice_id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-accent hover:underline"
          >
            請求書PDF
          </a>
        ) : null}
        {request.listing_id ? (
          <Link href={`/listings/${request.listing_id}`} className="block text-accent hover:underline">
            出品を見る
          </Link>
        ) : null}
      </div>
    );
  }

  if (request.status === "in_progress") {
    return (
      <div className="space-y-2">
        <InspectionScheduleTimeline request={request} />
        <Link
          href={`/admin/inspections/${request.id}/register`}
          className="block font-medium text-accent hover:underline"
        >
          出品代行登録 →
        </Link>
      </div>
    );
  }

  if (request.status === "scheduled") {
    return (
      <div className="space-y-2">
        <InspectionScheduleTimeline request={request} />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const supabase = createClient();
            void runRpc(() =>
              supabase.rpc("staff_start_inspection", { p_request_id: request.id }),
            );
          }}
          className="block w-full rounded border border-accent/40 px-2 py-1.5 text-left text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {busy ? "処理中…" : "査定を開始"}
        </button>
      </div>
    );
  }

  const canNegotiate = ["requested", "awaiting_staff", "awaiting_dealer"].includes(
    request.status,
  );

  return (
    <div className="min-w-[14rem] space-y-2">
      <InspectionScheduleTimeline request={request} />

      {request.status === "awaiting_dealer" ? (
        <p className="text-[11px] text-amber-200/90">加盟店の承諾・再提案を待っています</p>
      ) : null}

      {request.status === "awaiting_staff" && request.schedule_proposed_by === "dealer" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const supabase = createClient();
            void runRpc(() =>
              supabase.rpc("staff_confirm_dealer_inspection_schedule", {
                p_request_id: request.id,
              }),
            );
          }}
          className="block w-full rounded border border-emerald-500/40 px-2 py-1.5 text-left text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {busy ? "処理中…" : "加盟店の提案日時で確定"}
        </button>
      ) : null}

      {canNegotiate ? (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <label className="block text-[11px] text-muted">
            提案する査定日時
            <input
              type="datetime-local"
              value={scheduleLocal}
              disabled={busy}
              onChange={(e) => {
                setScheduleLocal(e.target.value);
                setHint("");
              }}
              className="mt-0.5 w-full rounded border border-border bg-zinc-950 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
            />
          </label>
          <label className="block text-[11px] text-muted">
            メッセージ（任意）
            <textarea
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="この日時なら訪問可能です、など"
              className="mt-0.5 w-full rounded border border-border bg-zinc-950 px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
            />
          </label>
          {hint ? <p className="text-[11px] text-rose-300">{hint}</p> : null}

          {request.preferred_at ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setScheduleLocal(toDatetimeLocalValue(request.preferred_at));
                void propose("ご希望の日時で訪問可能です。よろしければ承諾をお願いします。");
              }}
              className="block w-full rounded border border-sky-500/40 px-2 py-1.5 text-left text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"
            >
              {busy ? "送信中…" : "希望日時で対応可能（加盟店に承諾依頼）"}
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => void propose("")}
            className="block w-full rounded border border-border px-2 py-1.5 text-left text-foreground hover:bg-zinc-900 disabled:opacity-50"
          >
            {busy ? "送信中…" : "別日時を提案する"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
