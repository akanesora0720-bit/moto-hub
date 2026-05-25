"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";
import type { UserNotification } from "@/lib/types";

export default function NotificationsPage() {
  const [items, setItems] = useState<UserNotification[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data ?? []) as UserNotification[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (id: string) => {
    const supabase = createClient();
    await supabase.rpc("mark_notification_read", { p_notification_id: id });
    await load();
    window.dispatchEvent(new Event("motohub:refresh-badges"));
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-semibold">通知</h1>
        {items.length === 0 ? (
          <p className="text-sm text-muted">通知はありません。</p>
        ) : (
          <ul className="space-y-3">
            {items.map((n) => (
              <li
                key={n.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  n.read_at
                    ? "border-border bg-card opacity-70"
                    : "border-accent/30 bg-accent/5"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{n.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted">{n.body}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {new Date(n.created_at).toLocaleString("ja-JP")}
                      {n.importance !== "normal" ? ` · ${n.importance}` : ""}
                    </p>
                    {n.link_url ? (
                      <Link
                        href={n.link_url}
                        className="mt-2 inline-block text-xs text-accent hover:underline"
                      >
                        詳細 →
                      </Link>
                    ) : null}
                  </div>
                  {!n.read_at ? (
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      className="shrink-0 text-xs text-accent"
                    >
                      既読
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
