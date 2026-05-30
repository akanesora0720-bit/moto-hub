"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBillingWeekLabel } from "@/lib/billing-week";
import { formatYen } from "@/lib/format";
import type { PartSale } from "@/lib/types";
import { ActionButton, AsyncMessage, AsyncStatusBanner } from "@/components/ui/async-ui";
import { useAsyncAction } from "@/lib/use-async-action";

type AccrualInfo = {
  status: string;
  billing_week_start: string;
  billing_week_end: string;
  weekly_invoice_id: string | null;
} | null;

export function PartSaleFulfillmentPanel({
  partSale,
  accrual,
  isSeller,
  shippingBearer,
}: {
  partSale: PartSale;
  accrual: AccrualInfo;
  isSeller: boolean;
  shippingBearer: "buyer" | "seller" | "consult";
}) {
  const router = useRouter();
  const { loading, success, message, run } = useAsyncAction();
  const [localSale, setLocalSale] = useState(partSale);

  const fulfillmentDone = !!(localSale.shipped_at || localSale.handover_at);
  const paymentConfirmed = !!localSale.buyer_payment_confirmed_at;
  const canShip =
    isSeller &&
    paymentConfirmed &&
    !fulfillmentDone &&
    (shippingBearer === "buyer" || shippingBearer === "seller" || shippingBearer === "consult");
  const canHandover =
    isSeller && paymentConfirmed && !fulfillmentDone && shippingBearer === "consult";

  const runAction = async (action: "ship" | "handover" | "confirm_payment") => {
    await run(async () => {
      const path =
        action === "ship"
          ? "ship"
          : action === "handover"
            ? "handover"
            : "confirm-payment";
      const res = await fetch(`/api/parts/sales/${partSale.id}/${path}`, { method: "POST" });
      const data = (await res.json()) as { error?: string; sale?: PartSale };
      if (!res.ok) return { error: data.error ?? "処理に失敗しました。" };
      if (data.sale) setLocalSale(data.sale);
      router.refresh();
      return {
        okMessage:
          action === "ship"
            ? "発送完了を登録しました。手数料は週次請求に計上されます。"
            : action === "handover"
              ? "引渡し完了を登録しました。手数料は週次請求に計上されます。"
              : "入金確認を記録しました。",
      };
    });
  };

  const bearerLabel =
    shippingBearer === "buyer"
      ? "送料: 買主負担（配送）"
      : shippingBearer === "seller"
        ? "送料: 売主負担"
        : "送料: 要相談";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-lg font-semibold">成約・配送状況</h3>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">成約価格（税抜）</dt>
          <dd className="font-medium">{formatYen(localSale.agreed_price_ex_tax)}</dd>
        </div>
        <div>
          <dt className="text-muted">送料負担</dt>
          <dd>{bearerLabel}</dd>
        </div>
        <div>
          <dt className="text-muted">入金確認（売主）</dt>
          <dd>
            {localSale.buyer_payment_confirmed_at
              ? new Date(localSale.buyer_payment_confirmed_at).toLocaleString("ja-JP")
              : "未確認"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">発送状態</dt>
          <dd>
            {localSale.shipped_at
              ? `発送完了 ${new Date(localSale.shipped_at).toLocaleString("ja-JP")}`
              : localSale.handover_at
                ? "—（直接引渡）"
                : "未完了"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">引渡し状態</dt>
          <dd>
            {localSale.handover_at
              ? `引渡完了 ${new Date(localSale.handover_at).toLocaleString("ja-JP")}`
              : "未完了"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">手数料・請求</dt>
          <dd>
            {localSale.seller_fee_ex_tax <= 0
              ? "税抜1万円未満のため手数料無料"
              : accrual
                ? accrual.status === "invoiced"
                  ? "週次請求書発行済"
                  : `週次請求対象（${formatBillingWeekLabel(accrual.billing_week_start, accrual.billing_week_end)}・月曜発行）`
                : fulfillmentDone
                  ? "計上処理中"
                  : "発送または引渡し完了後に週次請求へ計上"}
          </dd>
        </div>
      </dl>

      {isSeller ? (
        <div className="flex flex-wrap gap-2">
          <AsyncStatusBanner loading={loading} />
          {!paymentConfirmed ? (
            <>
              <p className="w-full text-xs text-amber-200/90">
                先に買主の入金を確認してから、発送または引渡しを登録してください。
              </p>
              <ActionButton
                loading={loading}
                success={success}
                variant="secondary"
                onClick={() => runAction("confirm_payment")}
              >
                買主の入金を確認した
              </ActionButton>
            </>
          ) : null}
          {canShip ? (
            <ActionButton loading={loading} success={success} onClick={() => runAction("ship")}>
              発送完了
            </ActionButton>
          ) : null}
          {canHandover ? (
            <ActionButton
              loading={loading}
              success={success}
              variant="secondary"
              onClick={() => runAction("handover")}
            >
              引渡し完了
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      <AsyncMessage message={message} success={success} />

      <p className="text-xs text-muted">
        買主向け入金指示書は成約登録時に自動発行されます。
        <Link href="/my/payments" className="text-accent hover:underline">
          請求・支払い
        </Link>
        で週次手数料請求書を確認できます。
      </p>
    </div>
  );
}
