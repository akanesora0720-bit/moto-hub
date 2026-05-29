import Link from "next/link";
import {
  DOCUMENT_KIND_LABELS,
  FEE_FREE_MAX_PRICE_EX_TAX,
  INVOICE_STATUS_LABELS,
  formatYen,
  summarizeDealBilling,
} from "@/lib/billing";
import { partyDealStatusBadge } from "@/lib/deal-flow";
import { createClient } from "@/lib/supabase/server";
import type { DealStatus, Invoice } from "@/lib/types";

export async function DealBillingPanel({
  dealId,
  userId,
  role,
  status,
  agreedPriceExTax,
  paymentDueAt,
  platformFeeDueAt,
}: {
  dealId: string;
  userId: string;
  role: "buyer" | "seller";
  status: DealStatus;
  agreedPriceExTax: number;
  paymentDueAt?: string | null;
  platformFeeDueAt?: string | null;
}) {
  const supabase = await createClient();
  const summary = summarizeDealBilling(agreedPriceExTax);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*")
    .eq("deal_id", dealId);

  const buyerDoc = (invoices ?? []).find(
    (i) => i.party === "buyer" && i.user_id === userId,
  ) as Invoice | undefined;
  const sellerDoc = (invoices ?? []).find(
    (i) => i.party === "seller" && i.user_id === userId,
  ) as Invoice | undefined;

  const showBilling =
    status !== "inquiry" &&
    status !== "negotiating" &&
    status !== "cancelled";

  if (!showBilling) return null;

  const docKind = (doc: Invoice | undefined) =>
    (doc as Invoice & { document_kind?: string })?.document_kind ?? "legacy";

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="font-medium">請求・入金</h2>
      <p className="text-xs text-muted">取引ステータス: {partyDealStatusBadge(status, role)}</p>

      {role === "buyer" ? (
        <BuyerBilling
          summary={summary}
          status={status}
          paymentDueAt={paymentDueAt}
          buyerDoc={buyerDoc}
          docKind={docKind(buyerDoc)}
        />
      ) : (
        <SellerBilling
          summary={summary}
          status={status}
          platformFeeDueAt={platformFeeDueAt}
          sellerDoc={sellerDoc}
          docKind={docKind(sellerDoc)}
        />
      )}

      <Link
        href={`/support/new?deal=${dealId}`}
        className="inline-block text-xs text-accent hover:underline"
      >
        運営サポートに相談 →
      </Link>
    </section>
  );
}

function BuyerBilling({
  summary,
  status,
  paymentDueAt,
  buyerDoc,
  docKind,
}: {
  summary: ReturnType<typeof summarizeDealBilling>;
  status: DealStatus;
  paymentDueAt?: string | null;
  buyerDoc?: Invoice;
  docKind: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <Row label="落札価格（税抜）" value={formatYen(summary.vehiclePriceExTax)} />
      <Row label="消費税（10%）" value={formatYen(summary.vehicleTax)} />
      <Row label="支払総額（税込）" value={formatYen(summary.buyerTotalIncTax)} bold />
      <p className="text-xs text-emerald-300/90">
        買い手手数料0円 — 売り手へ直接お振込みください（Moto-Hubは資金を預かりません）
      </p>
      <p className="text-xs text-muted">
        車両代金は双方合意後3営業日以内が原則です。
      </p>
      {paymentDueAt ? (
        <p className="text-xs text-amber-200/90">
          振込期限:{" "}
          {new Date(paymentDueAt).toLocaleDateString("ja-JP", {
            timeZone: "Asia/Tokyo",
          })}
        </p>
      ) : null}
      {buyerDoc ? (
        <p className="text-xs text-muted">
          {DOCUMENT_KIND_LABELS[docKind as keyof typeof DOCUMENT_KIND_LABELS] ?? "書類"}:{" "}
          {INVOICE_STATUS_LABELS[buyerDoc.status]}
          {["review_pending", "issued", "paid"].includes(buyerDoc.status) ? (
            <>
              {" "}
              ·{" "}
              <Link
                href={`/api/invoices/${buyerDoc.id}/pdf`}
                className="text-accent hover:underline"
                target="_blank"
              >
                PDF
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <PaymentHint status={status} role="buyer" />
    </div>
  );
}

function SellerBilling({
  summary,
  status,
  platformFeeDueAt,
  sellerDoc,
  docKind,
}: {
  summary: ReturnType<typeof summarizeDealBilling>;
  status: DealStatus;
  platformFeeDueAt?: string | null;
  sellerDoc?: Invoice;
  docKind: string;
}) {
  return (
    <div className="space-y-2 text-sm">
      <Row label="成約価格（税抜）" value={formatYen(summary.vehiclePriceExTax)} />
      <Row label="買い手支払（税込・直接入金）" value={formatYen(summary.sellerReceivesIncTax)} />
      {summary.feeWaived ? (
        <p className="text-xs text-emerald-300/90">
          税抜{FEE_FREE_MAX_PRICE_EX_TAX.toLocaleString("ja-JP")}円未満のため、Moto-Hub手数料は双方0円です。
        </p>
      ) : null}
      <Row
        label={summary.feeWaived ? "Moto-Hub手数料" : "Moto-Hub手数料（5%・税抜）"}
        value={summary.feeWaived ? "¥0（対象外）" : formatYen(summary.platformFeeExTax)}
        valueClass={summary.feeWaived ? "text-emerald-300" : "text-rose-300"}
      />
      {!summary.feeWaived ? (
        <>
          <Row label="手数料消費税" value={formatYen(summary.platformFeeTax)} />
          <Row label="Moto-Hub請求総額（税込）" value={formatYen(summary.platformFeeIncTax)} bold />
          <p className="text-xs text-muted">
            Moto-Hub手数料は引渡完了後の請求書発行日から3営業日以内です。
          </p>
          {platformFeeDueAt ? (
            <p className="text-xs text-amber-200/90">
              手数料支払期限:{" "}
              {new Date(platformFeeDueAt).toLocaleDateString("ja-JP", {
                timeZone: "Asia/Tokyo",
              })}
            </p>
          ) : null}
        </>
      ) : null}
      {sellerDoc ? (
        <p className="text-xs text-muted">
          {DOCUMENT_KIND_LABELS[docKind as keyof typeof DOCUMENT_KIND_LABELS] ?? "請求書"}:{" "}
          {INVOICE_STATUS_LABELS[sellerDoc.status]}
          {["issued", "paid"].includes(sellerDoc.status) ? (
            <>
              {" "}
              ·{" "}
              <Link
                href={`/api/invoices/${sellerDoc.id}/pdf`}
                className="text-accent hover:underline"
                target="_blank"
              >
                PDF
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {summary.feeWaived
            ? "手数料対象外のため、請求書の発行はありません"
            : "引渡完了後にMoto-Hub手数料請求書を発行します"}
        </p>
      )}
      <PaymentHint status={status} role="seller" />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0 ${
        bold ? "pt-1 font-medium" : ""
      }`}
    >
      <span className={bold ? "" : "text-muted"}>{label}</span>
      <span
        className={`tabular-nums ${bold ? "text-lg font-semibold text-accent" : "font-medium"} ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentHint({
  status,
  role,
}: {
  status: DealStatus;
  role: "buyer" | "seller";
}) {
  if (role === "buyer") {
    const text =
      status === "awaiting_payment"
        ? "売り手へ振込後、取引画面の「振込した」ボタンで報告してください"
        : status === "funded"
          ? "入金確認済 — 引取日時の登録へ進んでください"
          : ["handover_done", "transfer_pending"].includes(status)
            ? "入金・引渡済 — 取引完了の確認をお願いします"
            : status === "payout_ready"
              ? "入金・確認済 — 運営が取引を完了にするまでお待ちください（ご入金は不要です）"
              : ["payout_done", "completed"].includes(status)
                ? "お取引の決済・確認は完了しています"
                : status === "agreed"
                  ? "入金指示書の発行をお待ちください"
                  : "—";
    return <p className="text-xs text-zinc-500">{text}</p>;
  }

  const text =
    status === "awaiting_payment"
      ? "買い手からの入金を確認してください"
      : status === "funded"
        ? "入金確認済 — 引渡しへ進めます"
        : ["handover_done", "transfer_pending"].includes(status)
          ? "引渡後、取引完了の確認をお願いします"
          : status === "payout_ready"
            ? "双方確認済 — 運営が取引を完了にします（車両代金は買い手から入金済み）"
            : ["payout_done", "completed"].includes(status)
              ? "取引の確認・処理は完了しています"
              : "—";
  return <p className="text-xs text-zinc-500">{text}</p>;
}
