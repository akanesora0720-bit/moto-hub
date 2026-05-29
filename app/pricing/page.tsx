import Link from "next/link";
import { FEE_SCHEDULE_ROWS } from "@/lib/fee-schedule";
import { TERMS_DOCUMENT_PATH, pricingDocumentHref } from "@/lib/legal-policies";

export const metadata = {
  title: "料金表",
  description: "MotoHub 手数料・月額会費",
};

function FeeTable({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      <table className="mt-4 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-border first:border-t-0">
              <th className="py-2 pr-4 text-left font-normal text-muted">{row.label}</th>
              <td className="py-2 text-right font-medium">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div>
          <p className="text-sm">
            <Link href={TERMS_DOCUMENT_PATH} className="text-accent underline underline-offset-2">
              利用規約
            </Link>
            {" · "}
            <Link href="/login" className="text-accent underline underline-offset-2">
              ログイン
            </Link>
          </p>
          <h1 className="mt-4 text-2xl font-semibold">料金表</h1>
          <p className="mt-2 text-sm text-muted">
            利用規約第6条に基づく料金の目安です。システム・請求書の計算が優先されます。
          </p>
        </div>

        <FeeTable title="車両成約手数料" rows={[...FEE_SCHEDULE_ROWS.vehicle]} />
        <FeeTable title="パーツ成約手数料" rows={[...FEE_SCHEDULE_ROWS.parts]} />
        <FeeTable title="加盟店月額会費（信用ランク別・税抜）" rows={[...FEE_SCHEDULE_ROWS.membership]} />
        <FeeTable title="その他" rows={[...FEE_SCHEDULE_ROWS.inspection]} />

        <p className="text-xs text-muted">
          車両代金・パーツ代金は買主から売主口座への直接振込です。MotoHub は決済代行を行いません。
        </p>
        <p className="text-center text-xs text-muted">文書URL: {pricingDocumentHref()}</p>
      </div>
    </div>
  );
}
