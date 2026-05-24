import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  const draw = (text: string, size = 11, useBold = false) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: useBold ? bold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  draw("MotoHub", 20, true);
  draw("入金指示書", 14, true);
  y -= 4;
  draw(`取引ID: ${input.dealId.slice(0, 8)}`);
  draw(`発行日: ${input.issuedAt}`);
  if (input.paymentDueAt) draw(`振込期限: ${input.paymentDueAt}`);
  y -= 8;

  draw("【お振込先（売り手）】", 12, true);
  draw(`会社名: ${input.seller.storeName}`);
  if (input.seller.tradeName) draw(`屋号: ${input.seller.tradeName}`);
  if (input.seller.contactName) draw(`担当者: ${input.seller.contactName}`);
  if (input.seller.invoiceNumber) draw(`インボイス登録番号: ${input.seller.invoiceNumber}`);
  if (input.seller.phone) draw(`電話: ${input.seller.phone}`);
  if (input.seller.bankLine) draw(`振込先: ${input.seller.bankLine}`);
  y -= 8;

  draw("【車両】", 12, true);
  draw(`${input.vehicleLabel}`);
  draw(`車台番号: ${input.frameNumber}`);
  y -= 8;

  draw("【お支払い金額】", 12, true);
  draw(`車両代（税抜）  ¥${input.vehiclePriceExTax.toLocaleString("ja-JP")}`);
  draw(`消費税（10%）  ¥${input.vehicleTax.toLocaleString("ja-JP")}`);
  y -= 4;
  draw(`支払総額（税込）  ¥${input.totalIncTax.toLocaleString("ja-JP")}`, 13, true);
  y -= 12;

  draw("【注意事項】", 12, true);
  draw("・MotoHubは資金を預かりません。上記売り手口座へ直接お振込みください。");
  draw("・振込名義は貴社名（または登録店舗名）でお願いします。");
  draw("・入金後、売り手が入金確認を行います。");
  draw("・名義変更・書類のやり取りは売買当事者間で行ってください。");

  return doc.save();
}
