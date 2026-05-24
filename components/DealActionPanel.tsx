"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canBuyerFileComplaint } from "@/lib/complaint-eligibility";
import {
  DEAL_STATUS_LABELS,
  buyerDealLabel,
  formatTransferDeadline,
  sellerDealLabel,
} from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Deal } from "@/lib/types";

type DealWithListing = Deal & {
  listing: {
    maker: string;
    model: string;
    inspection_remaining: string | null;
  };
};

export function DealActionPanel({
  deal,
  role,
}: {
  deal: DealWithListing;
  role: "buyer" | "seller";
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const progressLabel = role === "buyer" ? buyerDealLabel(deal.status) : sellerDealLabel(deal.status);

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setMessage("");
    setLoading(true);
    const { error } = await fn();
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.refresh();
  };

  const buyerConfirm = () =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("deal_buyer_confirm", { p_deal_id: deal.id });
      return { error };
    });

  const sellerConfirm = () =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("deal_seller_confirm", { p_deal_id: deal.id });
      return { error };
    });

  const markHandover = () =>
    run(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("deal_mark_handover", { p_deal_id: deal.id });
      return { error };
    });

  const canBuyerConfirm =
    role === "buyer" &&
    (deal.status === "handover_done" || deal.status === "transfer_pending") &&
    !deal.buyer_confirmed_at;

  const canSellerConfirm =
    role === "seller" &&
    (deal.status === "handover_done" || deal.status === "transfer_pending") &&
    !deal.seller_confirmed_at;

  const canMarkHandover = role === "seller" && deal.status === "funded";
  const showComplaintLink = role === "buyer" && canBuyerFileComplaint(deal.status);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted">あなたの進捗</p>
          <p className="text-lg font-semibold text-accent">{progressLabel}</p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted">
          {DEAL_STATUS_LABELS[deal.status]}
        </span>
      </div>

      <dl className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">合意価格（税抜）</dt>
          <dd className="font-medium">{formatYen(deal.agreed_price_ex_tax)}</dd>
        </div>
        {deal.status === "awaiting_payment" && role === "buyer" ? (
          <p className="text-xs text-amber-200/90">
            運営指定口座へ入金後、入金確認までお待ちください。
          </p>
        ) : null}
        {deal.funded_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">入金確認</dt>
            <dd>{new Date(deal.funded_at).toLocaleDateString("ja-JP")}</dd>
          </div>
        ) : null}
        {deal.handover_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">引渡完了</dt>
            <dd>{new Date(deal.handover_at).toLocaleDateString("ja-JP")}</dd>
          </div>
        ) : null}
        {deal.requires_name_transfer && deal.transfer_deadline_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">名変期限</dt>
            <dd className={deal.transfer_overdue ? "text-rose-300" : ""}>
              {formatTransferDeadline(deal.transfer_deadline_at)}
              {deal.transfer_overdue ? "（超過）" : ""}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-4">
          <dt className="text-muted">買い手確認</dt>
          <dd>{deal.buyer_confirmed_at ? "済" : "未"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">売り手確認</dt>
          <dd>{deal.seller_confirmed_at ? "済" : "未"}</dd>
        </div>
        {deal.payout_at ? (
          <div className="flex justify-between gap-4">
            <dt className="text-muted">振込日</dt>
            <dd>{new Date(deal.payout_at).toLocaleDateString("ja-JP")}</dd>
          </div>
        ) : null}
      </dl>

      {deal.status === "payout_ready" ? (
        <p className="text-xs text-emerald-200/90">
          双方の確認が揃いました。運営による売り手への振込手続きを行います。
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {canMarkHandover ? (
          <button
            type="button"
            disabled={loading}
            onClick={markHandover}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "処理中…" : "車両・書類の引渡完了"}
          </button>
        ) : null}
        {canBuyerConfirm ? (
          <button
            type="button"
            disabled={loading}
            onClick={buyerConfirm}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "処理中…" : "取引完了を確認（買い手）"}
          </button>
        ) : null}
        {canSellerConfirm ? (
          <button
            type="button"
            disabled={loading}
            onClick={sellerConfirm}
            className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {loading ? "処理中…" : "取引完了を確認（売り手）"}
          </button>
        ) : null}
      </div>

      {showComplaintLink ? (
        <Link
          href={`/complaints/new?deal=${deal.id}`}
          className="block w-full rounded-lg border border-border bg-zinc-900/80 px-4 py-2.5 text-center text-sm text-muted transition hover:border-rose-500/40 hover:text-rose-200"
        >
          問題を報告（クレーム）
        </Link>
      ) : null}

      {message ? <p className="text-sm text-rose-300">{message}</p> : null}
    </div>
  );
}
