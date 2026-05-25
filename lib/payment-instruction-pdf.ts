import { createPdfWriter } from "@/lib/pdf-font";

export type PaymentInstructionPdfInput = {
  dealId: string;
  vehicleLabel: string;
  frameNumber: string;
  seller: {
    storeName: string;
    tradeName: string | null;
    contactName: string | null;
    invoiceNumber: string | null;
    phone: string | null;
    bankLine: string | null;
  };
  vehiclePriceExTax: number;
  vehicleTax: number;
  totalIncTax: number;
  paymentDueAt: string | null;
  issuedAt: string;
};

export async function buildPaymentInstructionPdf(
  input: PaymentInstructionPdfInput,
): Promise<Uint8Array> {
  const { doc, writer } = await createPdfWriter();

  writer.draw("MotoHub", 20, true);
  writer.draw("入金指示書", 14, true);
  writer.y -= 4;
  writer.draw(`取引ID: ${input.dealId.slice(0, 8)}`);
  writer.draw(`発行日: ${input.issuedAt}`);
  if (input.paymentDueAt) writer.draw(`振込期限: ${input.paymentDueAt}`);
  writer.y -= 8;

  writer.draw("【お振込先（売り手）】", 12, true);
  writer.draw(`会社名: ${input.seller.storeName}`);
  if (input.seller.tradeName) writer.draw(`屋号: ${input.seller.tradeName}`);
  if (input.seller.contactName) writer.draw(`担当者: ${input.seller.contactName}`);
  if (input.seller.invoiceNumber) writer.draw(`インボイス登録番号: ${input.seller.invoiceNumber}`);
  if (input.seller.phone) writer.draw(`電話: ${input.seller.phone}`);
  if (input.seller.bankLine) writer.draw(`振込先: ${input.seller.bankLine}`);
  writer.y -= 8;

  writer.draw("【車両】", 12, true);
  writer.draw(input.vehicleLabel);
  writer.draw(`車台番号: ${input.frameNumber}`);
  writer.y -= 8;

  writer.draw("【お支払い金額】", 12, true);
  writer.draw(`車両代（税抜）  ¥${input.vehiclePriceExTax.toLocaleString("ja-JP")}`);
  writer.draw(`消費税（10%）  ¥${input.vehicleTax.toLocaleString("ja-JP")}`);
  writer.y -= 4;
  writer.draw(`支払総額（税込）  ¥${input.totalIncTax.toLocaleString("ja-JP")}`, 13, true);
  writer.y -= 12;

  writer.draw("【注意事項】", 12, true);
  writer.draw("・MotoHubは資金を預かりません。上記売り手口座へ直接お振込みください。");
  writer.draw("・振込名義は貴社名（または登録店舗名）でお願いします。");
  writer.draw("・入金後、売り手が入金確認を行います。");
  writer.draw("・名義変更・書類のやり取りは売買当事者間で行ってください。");

  return doc.save();
}
