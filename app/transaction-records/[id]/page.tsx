import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import {
  TRANSACTION_RECORD_DISCLAIMER,
  canViewTransactionRecords,
  formatContractedAt,
  formatPartySnapshot,
  formatRecordDate,
  isTransactionRecordParty,
} from "@/lib/transaction-record";
import { formatYen } from "@/lib/format";
import { canAccessAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { Profile, TransactionRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TransactionRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  if (!canViewTransactionRecords(viewer.profile as Profile)) {
    redirect("/home");
  }

  const supabase = await createClient();
  const { data: record } = await supabase
    .from("transaction_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!record) notFound();

  const row = record as TransactionRecord;
  const isAdmin = canAccessAdmin(viewer.profile as Profile);
  if (!isAdmin && !isTransactionRecordParty(row, viewer.id)) {
    notFound();
  }

  const role = isAdmin ? "admin" : row.seller_id === viewer.id ? "seller" : "buyer";
  const backHref = isAdmin ? `/admin/deals/${row.deal_id}` : `/deals/${row.deal_id}`;
  const pdfHref = `/api/transaction-records/${id}/pdf`;

  return (
    <AuthenticatedShell mode={isAdmin ? "admin" : "dealer"}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href={backHref} className="text-sm text-muted hover:text-accent">
            ← 取引に戻る
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">MotoHub取引記録書</h1>
          <p className="mt-1 text-sm text-muted">
            成約 {formatContractedAt(row.contracted_at)} · 取引ID {row.deal_id}
          </p>
        </div>

        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
          本ページの内容は売買契約書ではありません。古物台帳・経理・社内管理の補助資料です。
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={pdfHref}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
          >
            PDFをダウンロード
          </a>
        </div>

        <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="font-medium">車両情報</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Item label="車両名" value={row.vehicle_name} />
            <Item label="メーカー" value={row.manufacturer} />
            <Item
              label="排気量"
              value={row.displacement != null ? `${row.displacement} cc` : "—"}
            />
            <Item label="年式" value={row.model_year != null ? `${row.model_year}年` : "—"} />
            <Item
              label="走行距離"
              value={row.mileage != null ? `${row.mileage.toLocaleString("ja-JP")} km` : "—"}
            />
            <Item label="車台番号" value={row.vin || "—"} />
            <Item label="登録番号等" value={row.registration_number || "—"} />
          </dl>
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-sm">
          <h2 className="font-medium">売買・精算</h2>
          <dl className="grid gap-2 sm:grid-cols-2">
            <Item label="売買金額（税抜）" value={formatYen(row.sale_price_ex_tax)} />
            <Item label="売買金額（税込）" value={formatYen(row.sale_price_inc_tax)} />
            <Item
              label="MotoHub手数料（税込）"
              value={
                row.platform_fee_inc_tax > 0 ? formatYen(row.platform_fee_inc_tax) : "対象外"
              }
            />
            <Item label="支払状況" value={row.payment_status} />
            <Item label="書類引渡状況" value={row.documents_status} />
            <Item label="引渡予定" value={formatRecordDate(row.handover_due_at)} />
            <Item label="引渡完了" value={formatRecordDate(row.handover_completed_at)} />
          </dl>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <PartyCard title="売主（成約時点）" body={formatPartySnapshot(row.seller_snapshot_json)} />
          <PartyCard title="買主（成約時点）" body={formatPartySnapshot(row.buyer_snapshot_json)} />
        </section>

        {row.notes?.trim() ? (
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">備考: </span>
            {row.notes}
          </p>
        ) : null}

        <p className="text-xs text-muted">{TRANSACTION_RECORD_DISCLAIMER}</p>
        <p className="text-xs text-muted">閲覧区分: {role === "admin" ? "運営" : role === "seller" ? "売主" : "買主"}</p>
      </div>
    </AuthenticatedShell>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PartyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <h2 className="font-medium">{title}</h2>
      <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{body}</pre>
    </div>
  );
}
