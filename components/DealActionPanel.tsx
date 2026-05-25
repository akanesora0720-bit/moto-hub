"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { canBuyerFileComplaint } from "@/lib/complaint-eligibility";
import { DealNextStepBanner } from "@/components/DealNextStepBanner";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import {
  getDealNextStep,
  type DealPrimaryAction,
} from "@/lib/deal-next-steps";
import {
  buyerDealLabel,
  formatPickupSchedule,
  formatTransferDeadline,
  partyDealActionHint,
  partyDealStatusBadge,
  sellerDealLabel,
} from "@/lib/deal-flow";
import { formatYen } from "@/lib/format";
import { calcVehiclePriceIncTax, calcTax } from "@/lib/billing";
import { useAsyncAction } from "@/lib/use-async-action";
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
  const { loading, success, message, run } = useAsyncAction();

  const progressLabel =
    role === "buyer"
      ? buyerDealLabel(deal.status)
      : sellerDealLabel(deal.status, {
          buyerPaymentReported: !!deal.buyer_payment_reported_at,
        });

  const rpcAction = (label: string, rpc: () => Promise<{ error: { message: string } | null }>) =>
    run(async () => {
      const { error } = await rpc();
      if (error) return { error: error.message };
      router.refresh();
      return { okMessage: label };
    });

  const buyerConfirm = () =>
    rpcAction("確認を送信しました。", async () => {
      const supabase = createClient();
      return supabase.rpc("deal_buyer_confirm", { p_deal_id: deal.id });
    });

  const sellerConfirm = () =>
    rpcAction("確認を送信しました。", async () => {
      const supabase = createClient();
      return supabase.rpc("deal_seller_confirm", { p_deal_id: deal.id });
    });

  const markHandover = () =>
    rpcAction("引渡完了を登録しました。", async () => {
      const supabase = createClient();
      return supabase.rpc("deal_mark_handover", { p_deal_id: deal.id });
    });

  const sellerConfirmPayment = () =>
    rpcAction("入金確認を登録しました。", async () => {
      const supabase = createClient();
      return supabase.rpc("seller_confirm_buyer_payment", { p_deal_id: deal.id });
    });

  const buyerReportPayment = () =>
    rpcAction("振込報告を送信しました。売り手・運営に通知しました。", async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("buyer_report_payment_sent", {
        p_deal_id: deal.id,
      });
      if (error) {
        const msg = error.message ?? "";
        if (
          msg.includes("Could not find the function") ||
          msg.includes("buyer_report_payment_sent") ||
          error.code === "42883"
        ) {
          return {
            error: {
              message:
                "振込報告機能がデータベースに未設定です。運営へ「マイグレーション036/040」の適用を依頼してください。",
            },
          };
        }
        return { error };
      }
      const row = data as { buyer_payment_reported_at?: string | null } | null;
      if (!row?.buyer_payment_reported_at) {
        return {
          error: {
            message:
              "振込報告を保存できませんでした。ページを再読み込みして再度お試しください。",
          },
        };
      }
      return { error: null };
    });

  const vehicleTax = calcTax(deal.agreed_price_ex_tax);
  const buyerTotalIncTax = calcVehiclePriceIncTax(deal.agreed_price_ex_tax);

  const canBuyerConfirm =
    role === "buyer" &&
    (deal.status === "handover_done" || deal.status === "transfer_pending") &&
    !deal.buyer_confirmed_at;

  const canSellerConfirm =
    role === "seller" &&
    (deal.status === "handover_done" || deal.status === "transfer_pending") &&
    !deal.seller_confirmed_at;

  const canMarkHandover = role === "seller" && deal.status === "funded";
  const canSellerConfirmPayment =
    role === "seller" && deal.status === "awaiting_payment";
  const canBuyerReportPayment =
    role === "buyer" &&
    deal.status === "awaiting_payment" &&
    !deal.buyer_payment_reported_at;
  const showComplaintLink = role === "buyer" && canBuyerFileComplaint(deal.status);

  const nextStep = getDealNextStep(deal.status, role, {
    buyerConfirmed: !!deal.buyer_confirmed_at,
    sellerConfirmed: !!deal.seller_confirmed_at,
    hasPickupScheduled: !!deal.pickup_scheduled_at,
    buyerPaymentReported: !!deal.buyer_payment_reported_at,
  });

  const runPrimary = (action: DealPrimaryAction) => {
    switch (action) {
      case "buyer_report_payment":
        return buyerReportPayment();
      case "seller_confirm_payment":
        return sellerConfirmPayment();
      case "mark_handover":
        return markHandover();
      case "buyer_confirm":
        return buyerConfirm();
      case "seller_confirm":
        return sellerConfirm();
      default:
        return;
    }
  };

  const scrollTo = (targetId: string) => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const bannerHasPrimary =
    nextStep?.primaryAction &&
    ((nextStep.primaryAction === "buyer_report_payment" && canBuyerReportPayment) ||
      (nextStep.primaryAction === "seller_confirm_payment" && canSellerConfirmPayment) ||
      (nextStep.primaryAction === "mark_handover" && canMarkHandover) ||
      (nextStep.primaryAction === "buyer_confirm" && canBuyerConfirm) ||
      (nextStep.primaryAction === "seller_confirm" && canSellerConfirm));

  return (
    <div className="space-y-4">
      {nextStep ? (
        <DealNextStepBanner
          step={nextStep}
          loading={loading}
          success={success}
          onScrollTo={nextStep.scrollTargetId ? scrollTo : undefined}
          onPrimary={
            bannerHasPrimary && nextStep.primaryAction
              ? () => runPrimary(nextStep.primaryAction)
              : undefined
          }
        />
      ) : null}

      <div
        className={`space-y-4 rounded-xl border bg-card p-5 ${loading ? "border-accent/40" : "border-border"}`}
        aria-busy={loading}
      >
        <AsyncStatusBanner loading={loading && !bannerHasPrimary} />

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted">あなたの進捗</p>
            <p className="text-lg font-semibold text-accent">{progressLabel}</p>
          </div>
          <span className="rounded border border-border px-2 py-1 text-xs text-muted">
            {partyDealStatusBadge(deal.status, role)}
          </span>
        </div>

        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">合意価格（税抜）</dt>
            <dd className="font-medium">{formatYen(deal.agreed_price_ex_tax)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">消費税（10%）</dt>
            <dd className="font-medium">{formatYen(vehicleTax)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">支払総額（税込）</dt>
            <dd className="font-semibold text-accent">{formatYen(buyerTotalIncTax)}</dd>
          </div>
          {deal.status === "awaiting_payment" && role === "buyer" ? (
            <p className="text-xs text-amber-200/90">
              {deal.buyer_payment_reported_at
                ? `振込報告済（${new Date(deal.buyer_payment_reported_at).toLocaleString("ja-JP")}）— 売り手の入金確認をお待ちください。`
                : "入金指示書の売り手口座へ税込総額を振込み、振込後は上のボタンで売り手・運営に知らせてください。"}
            </p>
          ) : null}
          {deal.status === "awaiting_payment" && role === "seller" && deal.buyer_payment_reported_at ? (
            <p className="text-xs text-emerald-200/90">
              買い手が {new Date(deal.buyer_payment_reported_at).toLocaleString("ja-JP")}{" "}
              に振込報告済みです。口座を確認して入金確認ボタンを押してください。
            </p>
          ) : null}
          {deal.funded_at ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">入金確認</dt>
              <dd>{new Date(deal.funded_at).toLocaleDateString("ja-JP")}</dd>
            </div>
          ) : null}
          {deal.pickup_scheduled_at ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">引取予定</dt>
              <dd>{formatPickupSchedule(deal.pickup_scheduled_at)}</dd>
            </div>
          ) : deal.status === "funded" ? (
            <p className="text-xs text-amber-200/90">
              {role === "buyer"
                ? "引取予定日時を登録してください（下のフォーム）"
                : "買い手の引取予定日時登録をお待ちください"}
            </p>
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

        {partyDealActionHint(deal.status, role) ? (
          <p className="text-xs text-emerald-200/90">{partyDealActionHint(deal.status, role)}</p>
        ) : null}

        {!bannerHasPrimary ? (
          <div className="flex flex-col gap-2">
            {canBuyerReportPayment ? (
              <ActionButton
                loading={loading}
                success={success}
                loadingLabel="送信中…"
                successLabel="送信済み"
                onClick={buyerReportPayment}
              >
                振込した（売り手・運営に知らせる）
              </ActionButton>
            ) : null}
            {canSellerConfirmPayment ? (
              <ActionButton loading={loading} loadingLabel="送信中…" onClick={sellerConfirmPayment}>
                買い手からの入金を確認
              </ActionButton>
            ) : null}
            {canMarkHandover ? (
              <ActionButton loading={loading} loadingLabel="送信中…" onClick={markHandover}>
                車両・書類の引渡完了（引取予定日登録後）
              </ActionButton>
            ) : null}
            {canBuyerConfirm ? (
              <ActionButton loading={loading} loadingLabel="送信中…" onClick={buyerConfirm}>
                取引完了を確認（買い手）
              </ActionButton>
            ) : null}
            {canSellerConfirm ? (
              <ActionButton loading={loading} loadingLabel="送信中…" onClick={sellerConfirm}>
                取引完了を確認（売り手）
              </ActionButton>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted">操作ボタンは上の黄色い枠内です。</p>
        )}

        <AsyncMessage message={message} success={success} />

        {showComplaintLink ? (
          <Link
            href={`/complaints/new?deal=${deal.id}`}
            className="block w-full rounded-lg border border-border bg-zinc-900/80 px-4 py-2.5 text-center text-sm text-muted transition hover:border-rose-500/40 hover:text-rose-200"
          >
            問題を報告（クレーム）
          </Link>
        ) : null}
      </div>
    </div>
  );
}
