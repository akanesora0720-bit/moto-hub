import { createPdfWriter } from "@/lib/pdf-font";

type InvoicePdfInput = {
  invoiceId: string;
  dealId: string;
  partyLabel: string;
  storeName: string;
  qualifiedInvoiceNumber: string;
  vehicleLabel: string;
  items: { label: string; amountIncTax: number }[];
  totalExTax?: number;
  totalTax?: number;
  totalIncTax: number;
  issuedAt: string;
};

export async function buildInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const { doc, writer } = await createPdfWriter();

  writer.draw("MotoHub", 20, true);
  writer.draw(input.partyLabel, 14, true);
  writer.y -= 8;
  writer.draw(`適格請求書番号: ${input.qualifiedInvoiceNumber}`);
  writer.draw(`請求書ID: ${input.invoiceId.slice(0, 8)}`);
  writer.draw(`取引ID: ${input.dealId.slice(0, 8)}`);
  writer.draw(`請求先: ${input.storeName}`);
  writer.draw(`車両: ${input.vehicleLabel}`);
  writer.draw(`発行日: ${input.issuedAt}`);
  writer.y -= 10;

  for (const item of input.items) {
    writer.draw(`${item.label}  ¥${item.amountIncTax.toLocaleString("ja-JP")}`);
  }

  if (input.totalExTax != null && input.totalTax != null) {
    writer.y -= 4;
    writer.draw(`税抜合計  ¥${input.totalExTax.toLocaleString("ja-JP")}`);
    writer.draw(`消費税  ¥${input.totalTax.toLocaleString("ja-JP")}`);
  }

  writer.y -= 8;
  writer.draw(`請求総額（税込）  ¥${input.totalIncTax.toLocaleString("ja-JP")}`, 13, true);

  return doc.save();
}
