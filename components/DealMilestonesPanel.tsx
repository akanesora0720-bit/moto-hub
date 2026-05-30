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
  const [transferCompleted, setTransferCompleted] = useState(toLocal(deal.transfer_completed_at));
  const [tracking, setTracking] = useState(deal.tracking_number ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const paymentAt = deal.seller_payment_confirmed_at ?? deal.funded_at;

  const save = async (opts: { transferCompleted?: string; tracking?: string }) => {
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    const { error } = await supabase.rpc("update_deal_milestones", {
      p_deal_id: deal.id,
      p_pickup_scheduled_at: null,
      p_pickup_completed_at: null,
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

  const canEditTransfer =
    !readOnly && role === "buyer" && deal.status === "transfer_pending";
  const canEditTracking =
    !readOnly &&
    role === "seller" &&
    deal.status === "funded" &&
    !!deal.pickup_scheduled_at;

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
          <MilestoneRow
            label="引渡完了日時"
            value={
              deal.pickup_completed_at || deal.handover_at
                ? formatPickupSchedule(deal.pickup_completed_at ?? deal.handover_at)
                : "未"
            }
          />
          {!readOnly ? (
            <p className="text-xs text-muted">
              引取予定の登録はこのカード上部のフォームから。引渡完了は画面上部の黄色いボタンから行います（日時の手入力は不要です）。
            </p>
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
          {canEditTransfer ? (
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
