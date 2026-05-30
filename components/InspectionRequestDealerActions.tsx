"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InspectionScheduleTimeline } from "@/components/InspectionScheduleTimeline";
import type { InspectionRequest } from "@/lib/inspection";
import { datetimeLocalToIso, toDatetimeLocalValue } from "@/lib/inspection-datetime";
import { createClient } from "@/lib/supabase/client";

type Props = {
  request: InspectionRequest;
  onUpdated: () => void;
};

export function InspectionRequestDealerActions({ request, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [counterLocal, setCounterLocal] = useState(() =>
    toDatetimeLocalValue(request.schedule_proposed_at ?? request.preferred_at),
  );
  const [counterNote, setCounterNote] = useState("");
  const [showCounter, setShowCounter] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    setCounterLocal(toDatetimeLocalValue(request.schedule_proposed_at ?? request.preferred_at));
  }, [request.id, request.preferred_at, request.schedule_proposed_at]);

  const respond = async (
    action: "accept" | "counter",
    at?: string,
    note?: string,
  ) => {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("dealer_respond_inspection_schedule", {
      p_request_id: request.id,
      p_action: action,
      p_counter_at: at ?? null,
      p_note: note ?? null,
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setShowCounter(false);
    onUpdated();
  };

  if (request.status === "completed" || request.status === "cancelled") {
    return (
      <div className="mt-3 space-y-2">
        <InspectionScheduleTimeline request={request} />
        <div className="flex flex-wrap gap-3 text-xs">
          {request.invoice_id ? (
            <a
              href={`/api/invoices/${request.invoice_id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent hover:underline"
            >
              請求書PDF →
            </a>
          ) : null}
          {request.listing_id ? (
            <Link href={`/listings/${request.listing_id}`} className="text-accent hover:underline">
              出品を見る →
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <InspectionScheduleTimeline request={request} />

      {request.status === "awaiting_dealer" && request.schedule_proposed_by === "staff" ? (
        <div className="space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <p className="text-xs text-sky-100">
            スタッフから日程のご提案があります。この日時でよろしければ承諾してください。難しい場合は別日時をご提示ください。
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond("accept")}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              {busy ? "処理中…" : "この日時で承諾"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowCounter((v) => !v)}
              className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-zinc-900 disabled:opacity-50"
            >
              別日時を提示
            </button>
          </div>
          {showCounter ? (
            <div className="space-y-2 border-t border-border/60 pt-2">
              <label className="block text-xs text-muted">
                ご希望の日時
                <input
                  type="datetime-local"
                  value={counterLocal}
                  disabled={busy}
                  onChange={(e) => {
                    setCounterLocal(e.target.value);
                    setHint("");
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                />
              </label>
              <label className="block text-xs text-muted">
                補足（任意）
                <textarea
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2"
                  placeholder="午前のみ対応可能、など"
                />
              </label>
              {hint ? <p className="text-xs text-rose-300">{hint}</p> : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const iso = datetimeLocalToIso(counterLocal);
                  if (!iso) {
                    setHint("日時を選択してください。");
                    return;
                  }
                  void respond("counter", iso, counterNote.trim() || undefined);
                }}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-zinc-900 disabled:opacity-50"
              >
                再提案を送る
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {request.status === "awaiting_staff" ? (
        <p className="text-xs text-muted">スタッフが日程を確認中です。確定次第お知らせします。</p>
      ) : null}

      {request.status === "requested" ? (
        <p className="text-xs text-muted">スタッフがご希望日時を確認しています。</p>
      ) : null}

      {request.status === "scheduled" ? (
        <p className="text-xs text-emerald-200/90">査定日時が確定しました。当日お待ちください。</p>
      ) : null}

      {request.status === "in_progress" ? (
        <p className="text-xs text-muted">査定・出品代行を実施中です。</p>
      ) : null}

      {message ? <p className="text-xs text-rose-300">{message}</p> : null}
    </div>
  );
}
