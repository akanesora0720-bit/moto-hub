"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatPickupSchedule } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus } from "@/lib/types";

export function DealPickupSchedulePanel({
  dealId,
  role,
  status,
  pickupScheduledAt,
}: {
  dealId: string;
  role: "buyer" | "seller";
  status: DealStatus;
  pickupScheduledAt: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => toDatetimeLocalValue(pickupScheduledAt));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const show =
    status === "funded" ||
    (pickupScheduledAt &&
      ["handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(
        status,
      ));

  if (!show) return null;

  const canEdit = role === "buyer" && status === "funded";

  const submit = async () => {
    if (!value) {
      setMessage("引取予定日時を選択してください。");
      return;
    }
    const iso = new Date(value).toISOString();
    if (Number.isNaN(Date.parse(iso))) {
      setMessage("日時が不正です。");
      return;
    }
    if (new Date(iso) < new Date()) {
      setMessage("引取予定は現在より後の日時にしてください。");
      return;
    }

    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.rpc("buyer_set_pickup_schedule", {
      p_deal_id: dealId,
      p_pickup_scheduled_at: iso,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.refresh();
  };

  const scheduledLabel = useMemo(
    () => formatPickupSchedule(pickupScheduledAt),
    [pickupScheduledAt],
  );

  return (
    <section className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <h2 className="text-sm font-semibold text-accent">引取予定</h2>

      {role === "buyer" && status === "funded" ? (
        <>
          <p className="text-sm leading-relaxed text-zinc-200">
            売り手が入金を確認しました。売り手と連絡を取り、引取日時を調整したうえで、下記に
            <strong className="font-medium text-accent"> 引取予定日時 </strong>
            を入力してください。
          </p>
          <p className="text-xs text-muted">
            登録後、売り手に通知されます。引渡しはこの日時を目安に行います。
          </p>
          <label className="block text-sm">
            <span className="text-muted">引取予定日時</span>
            <input
              type="datetime-local"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          {pickupScheduledAt ? (
            <p className="text-xs text-muted">
              現在の登録: {scheduledLabel}（変更する場合は日時を選び直して保存）
            </p>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              disabled={loading}
              onClick={submit}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {loading ? "保存中…" : pickupScheduledAt ? "引取予定日時を更新" : "引取予定日時を登録"}
            </button>
          ) : null}
        </>
      ) : null}

      {role === "seller" && status === "funded" ? (
        pickupScheduledAt ? (
          <p className="text-sm">
            買い手の引取予定:{" "}
            <span className="font-semibold text-accent">{scheduledLabel}</span>
          </p>
        ) : (
          <p className="text-sm text-amber-200/90">
            買い手が引取予定日時を入力するまでお待ちください。入力後、車両・書類の引渡しが可能になります。
          </p>
        )
      ) : null}

      {pickupScheduledAt && status !== "funded" ? (
        <p className="text-sm text-muted">
          登録済み引取予定: <span className="text-foreground">{scheduledLabel}</span>
        </p>
      ) : null}

      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
    </section>
  );
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
