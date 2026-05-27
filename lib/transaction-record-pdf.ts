import { createPdfWriter } from "@/lib/pdf-font";
import {
  TRANSACTION_RECORD_DISCLAIMER,
  formatContractedAt,
  formatPartySnapshot,
  formatRecordDate,
} from "@/lib/transaction-record";
import type { TransactionPartySnapshot, TransactionRecord } from "@/lib/types";
import { createPdfTemplate } from "@/lib/pdf-template";

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

function drawLabelValue(
  draw: (text: string, size?: number, useBold?: boolean) => void,
  label: string,
  value: string,
) {
  draw(`${label}: ${value}`, 10);
}

export async function buildTransactionRecordPdf(
  record: TransactionRecord,
  opts?: { viewerRole?: "seller" | "buyer" | "admin" },
): Promise<Uint8Array> {
  const { doc, writer } = await createPdfWriter();
  const seller = record.seller_snapshot_json as TransactionPartySnapshot;
  const buyer = record.buyer_snapshot_json as TransactionPartySnapshot;
  const t = createPdfTemplate(writer, {
    brandName: "MotoHub",
    companyName: "株式会社RideWorks",
    contact: "info@moto-hub.jp",
  });

  await t.header({
    documentTitle: "取引記録書",
    issuedAt: new Date().toLocaleDateString("ja-JP"),
    documentNo: record.id.slice(0, 8),
    dealId: record.deal_id,
    recordId: record.id,
  });

  t.sectionTitle("基本情報");
  t.keyValueGrid(
    [
      { label: "成約日時", value: formatContractedAt(record.contracted_at) },
      ...(opts?.viewerRole
        ? [
            {
              label: "出力時の立場",
              value: opts.viewerRole === "admin" ? "運営" : opts.viewerRole === "seller" ? "売主" : "買主",
            },
          ]
        : []),
    ],
    2,
  );

  t.sectionTitle("車両情報");
  t.keyValueGrid(
    [
      { label: "車両名", value: record.vehicle_name },
      { label: "メーカー", value: record.manufacturer },
      { label: "排気量", value: record.displacement != null ? `${record.displacement} cc` : "—" },
      { label: "年式", value: record.model_year != null ? `${record.model_year}年` : "—" },
      { label: "走行距離", value: record.mileage != null ? `${record.mileage.toLocaleString("ja-JP")} km` : "—" },
      { label: "車台番号", value: record.vin || "—" },
      { label: "登録番号等", value: record.registration_number || "—" },
    ],
    2,
  );

  t.sectionTitle("金額・状況");
  t.table({
    headers: ["項目", "内容"],
    colWidths: [0.35, 0.65],
    rows: [
      ["売買金額（税抜）", yen(record.sale_price_ex_tax)],
      ["売買金額（税込）", yen(record.sale_price_inc_tax)],
      ["MotoHub手数料（税込）", record.platform_fee_inc_tax > 0 ? yen(record.platform_fee_inc_tax) : "対象外"],
      ["支払状況", record.payment_status],
      ["引渡予定", formatRecordDate(record.handover_due_at)],
      ["引渡完了", formatRecordDate(record.handover_completed_at)],
      ["書類引渡状況", record.documents_status],
    ],
  });

  t.sectionTitle("売主 / 買主");
  t.keyValueGrid(
    [
      { label: "売主", value: formatPartySnapshot(seller) },
      { label: "買主", value: formatPartySnapshot(buyer) },
    ],
    2,
  );

  if (record.notes?.trim()) {
    t.sectionTitle("備考");
    t.keyValueGrid([{ label: "備考", value: record.notes.trim() }], 1);
  }

  t.footer({
    notes: [TRANSACTION_RECORD_DISCLAIMER],
  });

  return doc.save();
}
