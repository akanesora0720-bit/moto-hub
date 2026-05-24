import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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
  draw(input.partyLabel, 14, true);
  y -= 8;
  draw(`適格請求書番号: ${input.qualifiedInvoiceNumber}`);
  draw(`請求書ID: ${input.invoiceId.slice(0, 8)}`);
  draw(`取引ID: ${input.dealId.slice(0, 8)}`);
  draw(`請求先: ${input.storeName}`);
  draw(`車両: ${input.vehicleLabel}`);
  draw(`発行日: ${input.issuedAt}`);
  y -= 10;

  for (const item of input.items) {
    draw(`${item.label}  ¥${item.amountIncTax.toLocaleString("ja-JP")}`);
  }

  if (input.totalExTax != null && input.totalTax != null) {
    y -= 4;
    draw(`税抜合計  ¥${input.totalExTax.toLocaleString("ja-JP")}`);
    draw(`消費税  ¥${input.totalTax.toLocaleString("ja-JP")}`);
  }

  y -= 8;
  draw(`請求総額（税込）  ¥${input.totalIncTax.toLocaleString("ja-JP")}`, 13, true);
  draw("お振込先は別途MotoHub運営よりご案内します。", 10);

  return doc.save();
}
