"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AsyncMessage } from "@/components/ui/async-ui";
import { resolveNotificationHref } from "@/lib/admin-deal-routes";
import { createClient } from "@/lib/supabase/client";
import type { UserNotification } from "@/lib/types";

export type NotificationsContext = "dealer" | "admin";

export function NotificationsClient({
  context,
}: {
  context: NotificationsContext;
}) {
  const isAdminContext = context === "admin";
  const [items, setItems] = useState<UserNotification[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    setUserId(uid);
    if (!uid) {
      setItems([]);
      return;
    }

    const { data, error } = await supabase
      .from("user_notifications")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    setItems((data ?? []) as UserNotification[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshBadges = () => {
    window.dispatchEvent(new Event("motohub:refresh-badges"));
  };

  const markRead = async (id: string) => {
    setBusyId(id);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: id,
    });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    if (data === false) {
      setMessage("既読にできませんでした（自分の通知のみ操作できます）");
      setMessageOk(false);
      await load();
      return;
    }
    await load();
    refreshBadges();
  };

  const dismissOne = async (id: string) => {
    if (!window.confirm("この通知を削除しますか？")) return;
    setBusyId(id);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("dismiss_notification", {
      p_notification_id: id,
    });
    setBusyId(null);
    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    if (data === false) {
      setMessage("削除できませんでした");
      setMessageOk(false);
      await load();
      return;
    }
    await load();
    refreshBadges();
  };

  const markAllRead = async () => {
    setBulkBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_all_notifications_read");
    setBulkBusy(false);
    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    setMessage("未読をすべて既読にしました");
    setMessageOk(true);
    await load();
    refreshBadges();
  };

  const dismissAllRead = async () => {
    const readCount = items.filter((n) => n.read_at).length;
    if (readCount === 0) {
      setMessage("削除できる既読通知はありません");
      setMessageOk(false);
      return;
    }
    if (!window.confirm(`既読の通知 ${readCount} 件を削除しますか？`)) return;
    setBulkBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("dismiss_read_notifications");
    setBulkBusy(false);
    if (error) {
      setMessage(error.message);
      setMessageOk(false);
      return;
    }
    setMessage(`${data ?? 0} 件の既読通知を削除しました`);
    setMessageOk(true);
    await load();
    refreshBadges();
  };

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <AppShell mode={isAdminContext ? "admin" : "dealer"}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">通知</h1>
            <p className="mt-1 text-sm text-muted">
              {unreadCount > 0 ? `未読 ${unreadCount} 件` : "未読はありません"}
            </p>
          </div>
          {items.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={markAllRead}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent/40 disabled:opacity-50"
                >
                  {bulkBusy ? "処理中…" : "すべて既読"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={bulkBusy}
                onClick={dismissAllRead}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-50"
              >
                {bulkBusy ? "処理中…" : "既読をすべて削除"}
              </button>
            </div>
          ) : null}
        </div>

        {message ? <AsyncMessage message={message} success={messageOk} /> : null}

        {!userId ? (
          <p className="text-sm text-muted">ログインしてください。</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">通知はありません。</p>
        ) : (
          <ul className="space-y-3">
            {items.map((n) => {
              const href = resolveNotificationHref(n.link_url, isAdminContext);
              const isBusy = busyId === n.id;
              return (
                <li
                  key={n.id}
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    n.read_at
                      ? "border-border bg-card opacity-70"
                      : "border-accent/30 bg-accent/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{n.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-muted">{n.body}</p>
                      <p className="mt-2 text-xs text-zinc-500">
                        {new Date(n.created_at).toLocaleString("ja-JP")}
                        {n.importance !== "normal" ? ` · ${n.importance}` : ""}
                        {n.read_at
                          ? ` · 既読 ${new Date(n.read_at).toLocaleString("ja-JP")}`
                          : ""}
                      </p>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => {
                            if (!n.read_at) void markRead(n.id);
                          }}
                          className="mt-2 inline-block text-xs text-accent hover:underline"
                        >
                          詳細 →
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {!n.read_at ? (
                        <button
                          type="button"
                          disabled={isBusy || bulkBusy}
                          onClick={() => markRead(n.id)}
                          className="min-h-8 min-w-[3rem] rounded px-2 text-xs text-accent hover:bg-accent/10 disabled:opacity-50"
                        >
                          {isBusy ? "…" : "既読"}
                        </button>
                      ) : (
                        <span className="px-2 text-[10px] text-muted">既読</span>
                      )}
                      <button
                        type="button"
                        disabled={isBusy || bulkBusy}
                        onClick={() => dismissOne(n.id)}
                        className="min-h-8 rounded px-2 text-[10px] text-muted hover:text-rose-300 disabled:opacity-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
