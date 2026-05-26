"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPickupSchedule, formatTransferDeadline } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealStatus } from "@/lib/types";

type MilestoneDeal = Pick<
  Deal,
  | "id"
  | "status"
  | "pickup_scheduled_at"
  | "pickup_completed_at"
  | "seller_payment_confirmed_at"
  | "funded_at"
  | "transfer_deadline_at"
  | "transfer_completed_at"
  | "tracking_number"
  | "handover_at"
>;

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocal(value: string): string | null {
  if (!value) return null;
  const iso = new Date(value).toISOString();
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export function DealMilestonesPanel({
  deal,
  role,
  readOnly = false,
  section = "all",
}: {
  deal: MilestoneDeal;
  role: "buyer" | "seller";
  readOnly?: boolean;
  section?: "pickup" | "transfer" | "all";
}) {
  const router = useRouter();
  const [pickupScheduled, setPickupScheduled] = useState(toLocal(deal.pickup_scheduled_at));
  const [pickupCompleted, setPickupCompleted] = useState(toLocal(deal.pickup_completed_at));
  const [transferCompleted, setTransferCompleted] = useState(toLocal(deal.transfer_completed_at));
  const [tracking, setTracking] = useState(deal.tracking_number ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const paymentAt = deal.seller_payment_confirmed_at ?? deal.funded_at;

  const save = async (opts: {
    pickupScheduled?: string;
    pickupCompleted?: string;
    transferCompleted?: string;
    tracking?: string;
    usePickupRpc?: boolean;
  }) => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (opts.usePickupRpc && opts.pickupScheduled) {
      const iso = fromLocal(opts.pickupScheduled);
      if (!iso) {
        setMessage("引取予定日時が不正です。");
        setLoading(false);
        return;
      }
      const { error } = await supabase.rpc("buyer_set_pickup_schedule", {
        p_deal_id: deal.id,
        p_pickup_scheduled_at: iso,
      });
      setLoading(false);
      if (error) {
        setMessage(error.message);
        return;
      }
      router.refresh();
      return;
    }

    const { error } = await supabase.rpc("update_deal_milestones", {
      p_deal_id: deal.id,
      p_pickup_scheduled_at: opts.pickupScheduled ? fromLocal(opts.pickupScheduled) : null,
      p_pickup_completed_at: opts.pickupCompleted ? fromLocal(opts.pickupCompleted) : null,
      p_transfer_completed_at: opts.transferCompleted ? fromLocal(opts.transferCompleted) : null,
      p_tracking_number: opts.tracking ?? null,
      p_clear_tracking: false,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.refresh();
  };

  const canEditPickupSchedule =
    !readOnly && role === "buyer" && deal.status === "funded";
  const canEditPickupCompleted =
    !readOnly &&
    role === "seller" &&
    ["funded", "handover_done", "transfer_pending"].includes(deal.status);
  const canEditTransfer =
    !readOnly && role === "buyer" && deal.status === "transfer_pending";
  const canEditTracking = !readOnly;

  const showPickup = section === "all" || section === "pickup";
  const showTransfer = section === "all" || section === "transfer";

  return (
    <dl className="space-y-4 text-sm">
      {section === "pickup" ? (
        <MilestoneRow label="入金確認日時" value={paymentAt ? formatPickupSchedule(paymentAt) : "未"} />
      ) : null}
      {showPickup ? (
        <>
          <MilestoneRow
            label="引取予定日時"
            value={deal.pickup_scheduled_at ? formatPickupSchedule(deal.pickup_scheduled_at) : "未"}
          />
          {canEditPickupSchedule ? (
            <Field
              label="引取予定を登録（正式）"
              type="datetime-local"
              value={pickupScheduled}
              onChange={setPickupScheduled}
              onSave={() => void save({ pickupScheduled, usePickupRpc: true })}
              loading={loading}
            />
          ) : null}

          <MilestoneRow
            label="引渡完了日時"
            value={
              deal.pickup_completed_at || deal.handover_at
                ? formatPickupSchedule(deal.pickup_completed_at ?? deal.handover_at)
                : "未"
            }
          />
          {canEditPickupCompleted ? (
            <Field
              label="引渡完了を記録（車両・書類同時）"
              type="datetime-local"
              value={pickupCompleted}
              onChange={setPickupCompleted}
              onSave={() => void save({ pickupCompleted })}
              loading={loading}
            />
          ) : null}

          <MilestoneRow
            label="陸送追跡番号（任意）"
            value={deal.tracking_number?.trim() || "—"}
          />
          {canEditTracking ? (
            <div className="space-y-2">
              <input
                type="text"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="陸送利用時のみ"
                className="w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={loading}
                onClick={() => void save({ tracking })}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-accent/40"
              >
                追跡番号を保存
              </button>
            </div>
          ) : null}
          <p className="text-xs text-muted">
            書類は車両と同時に引渡します。別送・書類発送の工程はありません。
          </p>
        </>
      ) : null}

      {showTransfer ? (
        <>
          <MilestoneRow
            label="名変期限"
            value={formatTransferDeadline(deal.transfer_deadline_at)}
          />
          <MilestoneRow
            label="名変完了日時"
            value={deal.transfer_completed_at ? formatPickupSchedule(deal.transfer_completed_at) : "未"}
          />
          {canEditTransfer && deal.status === "transfer_pending" ? (
            <Field
              label="名変完了を記録"
              type="datetime-local"
              value={transferCompleted}
              onChange={setTransferCompleted}
              onSave={() => void save({ transferCompleted })}
              loading={loading}
            />
          ) : null}
        </>
      ) : null}

      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
      {section !== "pickup" ? (
        <p className="text-xs text-muted">
          正式記録です。集計・運営確認用に日時を登録してください。
        </p>
      ) : null}
    </dl>
  );
}

function MilestoneRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/40 pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  onSave,
  loading,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/80 p-3">
      <label className="block text-xs text-muted">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-border bg-zinc-950 px-3 py-2 text-sm"
      />
      <button
        type="button"
        disabled={loading || !value}
        onClick={onSave}
        className="mt-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 disabled:opacity-50"
      >
        {loading ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
