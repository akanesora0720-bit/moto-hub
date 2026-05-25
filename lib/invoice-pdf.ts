import { createPdfWriter } from "@/lib/pdf-font";
import type { MotohubIssuer } from "@/lib/motohub-issuer";

export type InvoicePdfLineItem = {
  label: string;
  amountExTax: number;
  taxAmount: number;
  amountIncTax: number;
};

type InvoicePdfInput = {
  invoiceId: string;
  dealId?: string | null;
  referenceLabel?: string;
  referenceId?: string;
  partyLabel: string;
  billToName: string;
  vehicleLabel: string;
  items: InvoicePdfLineItem[];
  totalExTax: number;
  totalTax: number;
  totalIncTax: number;
  issuedAt: string;
  issuer?: MotohubIssuer;
  paymentDueAt?: string | null;
};

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { doc, writer } = await createPdfWriter();

  writer.draw("MotoHub", 20, true);
  writer.draw(input.partyLabel, 14, true);
  writer.y -= 6;

  if (input.issuer) {
    writer.draw("【発行元】", 12, true);
    writer.draw(input.issuer.companyName);
    if (input.issuer.address) writer.draw(`住所: ${input.issuer.address}`);
    if (input.issuer.phone) writer.draw(`電話: ${input.issuer.phone}`);
    writer.draw(`適格請求書番号: ${input.issuer.qualifiedInvoiceNumber}`);
    writer.y -= 6;
  }

  writer.draw("【請求先】", 12, true);
  writer.draw(input.billToName);
  writer.y -= 4;

  writer.draw(`請求書ID: ${input.invoiceId.slice(0, 8)}`);
  if (input.dealId) {
    writer.draw(`取引ID: ${input.dealId.slice(0, 8)}`);
  } else if (input.referenceId) {
    writer.draw(`${input.referenceLabel ?? "参照ID"}: ${input.referenceId.slice(0, 8)}`);
  }
  writer.draw(`車両: ${input.vehicleLabel}`);
  writer.draw(`発行日: ${input.issuedAt}`);
  if (input.paymentDueAt) writer.draw(`お支払期限: ${input.paymentDueAt}`);
  writer.y -= 8;

  writer.draw("【請求明細】", 12, true);
  for (const item of input.items) {
    writer.draw(item.label);
    writer.draw(`  税抜 ${yen(item.amountExTax)}  消費税 ${yen(item.taxAmount)}  税込 ${yen(item.amountIncTax)}`);
  }

  writer.y -= 4;
  writer.draw(`税抜合計  ${yen(input.totalExTax)}`);
  writer.draw(`消費税  ${yen(input.totalTax)}`);
  writer.y -= 6;
  writer.draw(`請求総額（税込）  ${yen(input.totalIncTax)}`, 13, true);

  if (input.issuer?.bankLine) {
    writer.y -= 10;
    writer.draw("【お振込先（MotoHub運営）】", 12, true);
    writer.draw(input.issuer.bankLine);
    writer.draw("・振込名義は請求先（貴社）の登録名義でお願いします。");
  } else if (input.issuer) {
    writer.y -= 8;
    writer.draw("※ 振込先口座は運営までお問い合わせください（info@moto-hub.jp）");
  }

  return doc.save();
}
