"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DealEmergencyContact } from "@/components/DealEmergencyContact";
import {
  DEAL_BOARD_DESCRIPTION,
  DEAL_MESSAGE_ROLE_LABELS,
  formatDealMessageTime,
  type DealMessageRow,
} from "@/lib/deal-board";
import { createClient } from "@/lib/supabase/client";

export function DealBoardPanel({
  dealId,
  viewerId,
  role,
  boardVisible,
  readOnly = false,
}: {
  dealId: string;
  viewerId: string;
  role: "buyer" | "seller" | "admin";
  boardVisible: boolean;
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState<DealMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  const load = useCallback(async () => {
    if (!boardVisible) {
      setLoading(false);
      return;
    }
    setError("");
    const supabase = createClient();
    const { data, error: err } = await supabase.rpc("list_deal_messages", {
      p_deal_id: dealId,
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setMessages((data ?? []) as DealMessageRow[]);
    setLoading(false);
    await supabase.rpc("mark_deal_messages_read", { p_deal_id: dealId });
  }, [dealId, boardVisible]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading) return;
    if (messages.length > prevMessageCount.current && prevMessageCount.current > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages.length, loading]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || posting || readOnly || !boardVisible) return;
    setPosting(true);
    setError("");
    const supabase = createClient();
    const { error: err } = await supabase.rpc("post_deal_message", {
      p_deal_id: dealId,
      p_message: text,
    });
    setPosting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft("");
    await load();
  };

  if (!boardVisible) {
    return (
      <p className="text-sm text-muted">
        入金確認後に、引取・引渡し専用の取引連絡板が利用できます。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-amber-100/90">{DEAL_BOARD_DESCRIPTION}</p>
      <p className="text-xs text-muted">
        引取予定の調整、到着予定、陸送、引渡し（書類は車両と同時）に関する連絡にご利用ください。即時返信は不要です。
      </p>

      <DealEmergencyContact dealId={dealId} role={role} boardVisible={boardVisible} />

      <div
        className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border/80 bg-zinc-950/60 p-3"
        aria-label="取引連絡板の履歴"
      >
        {loading ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted">
            まだ投稿はありません。引取日時・到着予定・陸送・引渡しの連絡を残してください。
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === viewerId;
            return (
              <article
                key={m.id}
                className={`rounded-lg px-3 py-2 text-sm ${
                  mine ? "ml-6 bg-accent/15" : "mr-6 bg-zinc-900"
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                  <span className="font-medium text-zinc-300">
                    {m.sender_label ??
                      DEAL_MESSAGE_ROLE_LABELS[m.sender_role] ??
                      m.sender_role}
                  </span>
                  <time dateTime={m.created_at}>{formatDealMessageTime(m.created_at)}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-zinc-100">{m.message}</p>
              </article>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {readOnly ? (
        <p className="text-xs text-muted">運営表示。当事者の投稿・緊急連絡先開示は履歴に記録されます。</p>
      ) : (
        <>
          <label className="block text-sm">
            <span className="text-muted">引取・引渡しの連絡</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder="例：5/25 14:00 引取予定 / 陸送業者到着 15:30頃 / 引渡時に書類一式お渡し予定"
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={posting || draft.trim().length < 1}
            onClick={() => void submit()}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {posting ? "送信中…" : "連絡板に投稿"}
          </button>
        </>
      )}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
