"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { formatPickupSchedule } from "@/lib/deal-flow";
import { useAsyncAction } from "@/lib/use-async-action";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus } from "@/lib/types";

export function DealPickupSchedulePanel({
  dealId,
  role,
  status,
  pickupScheduledAt,
  fundedAt,
  sellerPaymentConfirmedAt,
  readOnly = false,
}: {
  dealId: string;
  role: "buyer" | "seller";
  status: DealStatus;
  pickupScheduledAt: string | null;
  fundedAt?: string | null;
  sellerPaymentConfirmedAt?: string | null;
  /** 運営・管理者は閲覧のみ */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(() => toDatetimeLocalValue(pickupScheduledAt));
  const [validationHint, setValidationHint] = useState("");
  const { loading, success, message, run } = useAsyncAction();

  const show =
    readOnly ||
    status === "funded" ||
    (pickupScheduledAt &&
      ["handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(
        status,
      )) ||
    (fundedAt &&
      ["funded", "handover_done", "transfer_pending", "payout_ready", "payout_done", "completed"].includes(
        status,
      ));

  if (!show) return null;

  const canEdit = !readOnly && role === "buyer" && status === "funded";

  const submit = () =>
    run(async () => {
      if (!value) {
        setValidationHint("引取予定日時を選択してください。");
        return { error: null };
      }
      const iso = new Date(value).toISOString();
      if (Number.isNaN(Date.parse(iso))) {
        setValidationHint("日時が不正です。");
        return { error: null };
      }
      if (new Date(iso) < new Date()) {
        setValidationHint("引取予定は現在より後の日時にしてください。");
        return { error: null };
      }
      setValidationHint("");
      const supabase = createClient();
      const { error } = await supabase.rpc("buyer_set_pickup_schedule", {
        p_deal_id: dealId,
        p_pickup_scheduled_at: iso,
      });
      if (error) return { error: error.message };
      router.refresh();
      return { okMessage: "引取予定日時を登録しました。" };
    });

  const scheduledLabel = useMemo(
    () => formatPickupSchedule(pickupScheduledAt),
    [pickupScheduledAt],
  );

  return (
    <section className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <h2 className="text-sm font-semibold text-accent">
        {readOnly ? "入金・引取（運営確認）" : "引取予定"}
      </h2>

      {readOnly ? (
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">売り手入金確認</dt>
            <dd>
              {sellerPaymentConfirmedAt || fundedAt
                ? formatPickupSchedule(sellerPaymentConfirmedAt ?? fundedAt!)
                : "未"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">引取予定日時</dt>
            <dd className={pickupScheduledAt ? "font-medium text-accent" : "text-amber-200"}>
              {scheduledLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">ステータス</dt>
            <dd className="text-xs">{status}</dd>
          </div>
        </dl>
      ) : null}

      {!readOnly && role === "buyer" && status === "funded" ? (
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

      {!readOnly && role === "seller" && status === "funded" ? (
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
