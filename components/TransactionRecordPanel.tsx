import Link from "next/link";
import {
  TRANSACTION_RECORD_DISCLAIMER,
  formatContractedAt,
  formatPartySnapshot,
  formatRecordDate,
} from "@/lib/transaction-record";
import { formatYen } from "@/lib/format";
import type { TransactionRecord } from "@/lib/types";

export function TransactionRecordPanel({
  record,
  role,
}: {
  record: TransactionRecord;
  role: "seller" | "buyer" | "admin";
}) {
  const pdfHref = `/api/transaction-records/${record.id}/pdf`;

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">取引記録書</h2>
          <p className="mt-1 text-xs text-muted">
            成約日 {formatContractedAt(record.contracted_at)} · 取引ID {record.deal_id.slice(0, 8)}…
          </p>
        </div>
        <a
          href={pdfHref}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-black"
          target="_blank"
          rel="noreferrer"
        >
          PDFをダウンロード
        </a>
      </div>

      <p className="rounded-lg border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
        売買契約書ではなく、MotoHub上の取引記録です。{role === "admin" ? "運営" : role === "seller" ? "売主" : "買主"}
        向けの補助資料としてご利用ください。
      </p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">車両</dt>
          <dd>{record.vehicle_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">売買金額（税込）</dt>
          <dd className="font-medium text-accent">{formatYen(record.sale_price_inc_tax)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">支払状況</dt>
          <dd>{record.payment_status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">書類・引渡</dt>
          <dd>{record.documents_status}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">引渡予定</dt>
          <dd>{formatRecordDate(record.handover_due_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">引渡完了</dt>
          <dd>{formatRecordDate(record.handover_completed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">MotoHub手数料（税込）</dt>
          <dd>
            {record.platform_fee_inc_tax > 0
              ? formatYen(record.platform_fee_inc_tax)
              : "対象外"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">車台番号</dt>
          <dd className="font-mono text-xs">{record.vin || "—"}</dd>
        </div>
      </dl>

      <div className="grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-muted">売主（記録時点）</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
            {formatPartySnapshot(record.seller_snapshot_json)}
          </pre>
        </div>
        <div className="rounded-lg border border-border/60 p-3">
          <p className="text-xs font-medium text-muted">買主（記録時点）</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
            {formatPartySnapshot(record.buyer_snapshot_json)}
          </pre>
        </div>
      </div>

      {record.notes?.trim() ? (
        <p className="text-sm">
          <span className="text-muted">備考: </span>
          {record.notes}
        </p>
      ) : null}

      <p className="text-xs text-muted">{TRANSACTION_RECORD_DISCLAIMER}</p>

      <Link
        href={`/transaction-records/${record.id}`}
        className="text-xs text-accent hover:underline"
      >
        詳細を見る →
      </Link>
    </section>
  );
}
