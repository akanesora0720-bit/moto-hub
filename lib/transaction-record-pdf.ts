import { createPdfWriter } from "@/lib/pdf-font";
import {
  TRANSACTION_RECORD_DISCLAIMER,
  formatContractedAt,
  formatPartySnapshot,
  formatRecordDate,
} from "@/lib/transaction-record";
import type { TransactionPartySnapshot, TransactionRecord } from "@/lib/types";

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

  writer.draw("MotoHub取引記録書", 18, true);
  writer.draw("（売買契約書ではありません）", 11);
  writer.y -= 4;

  drawLabelValue(writer.draw, "記録ID", record.id.slice(0, 8));
  drawLabelValue(writer.draw, "取引ID", record.deal_id);
  drawLabelValue(writer.draw, "成約日時", formatContractedAt(record.contracted_at));
  if (opts?.viewerRole) {
    drawLabelValue(
      writer.draw,
      "出力時の立場",
      opts.viewerRole === "admin" ? "運営" : opts.viewerRole === "seller" ? "売主" : "買主",
    );
  }
  writer.y -= 6;

  writer.draw("【車両情報】", 12, true);
  drawLabelValue(writer.draw, "車両名", record.vehicle_name);
  drawLabelValue(writer.draw, "メーカー", record.manufacturer);
  drawLabelValue(
    writer.draw,
    "排気量",
    record.displacement != null ? `${record.displacement} cc` : "—",
  );
  drawLabelValue(
    writer.draw,
    "年式",
    record.model_year != null ? `${record.model_year}年` : "—",
  );
  drawLabelValue(
    writer.draw,
    "走行距離",
    record.mileage != null ? `${record.mileage.toLocaleString("ja-JP")} km` : "—",
  );
  drawLabelValue(writer.draw, "車台番号", record.vin || "—");
  drawLabelValue(writer.draw, "登録番号等", record.registration_number || "—");
  writer.y -= 4;

  writer.draw("【売買条件】", 12, true);
  drawLabelValue(writer.draw, "売買金額（税抜）", yen(record.sale_price_ex_tax));
  drawLabelValue(writer.draw, "売買金額（税込）", yen(record.sale_price_inc_tax));
  drawLabelValue(
    writer.draw,
    "MotoHub手数料（税込）",
    record.platform_fee_inc_tax > 0 ? yen(record.platform_fee_inc_tax) : "対象外",
  );
  drawLabelValue(writer.draw, "支払状況", record.payment_status);
  writer.y -= 4;

  writer.draw("【引渡・書類】", 12, true);
  drawLabelValue(writer.draw, "引渡予定日時", formatRecordDate(record.handover_due_at));
  drawLabelValue(writer.draw, "引渡完了日時", formatRecordDate(record.handover_completed_at));
  drawLabelValue(writer.draw, "書類引渡状況", record.documents_status);
  writer.y -= 4;

  writer.draw("【売主】", 12, true);
  for (const line of formatPartySnapshot(seller).split("\n")) {
    writer.draw(line, 10);
  }
  writer.y -= 4;

  writer.draw("【買主】", 12, true);
  for (const line of formatPartySnapshot(buyer).split("\n")) {
    writer.draw(line, 10);
  }

  if (record.notes?.trim()) {
    writer.y -= 4;
    writer.draw("【備考】", 12, true);
    writer.draw(record.notes.trim(), 10);
  }

  writer.y -= 10;
  writer.draw("— 注意 —", 10, true);
  writer.draw(TRANSACTION_RECORD_DISCLAIMER, 9);

  return doc.save();
}
