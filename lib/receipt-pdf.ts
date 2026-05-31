import { createPdfWriter } from "@/lib/pdf-font";
import { createPdfTemplate } from "@/lib/pdf-template";

type ReceiptPdfInput = {
  dealId: string;
  receiptId: string;
  payerLabel: string;
  payeeLabel: string;
  vehicleLabel: string;
  amountIncTax: number;
  paidAt: string;
};

function yen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}

export async function buildReceiptPdf(input: ReceiptPdfInput): Promise<Uint8Array> {
  const { doc, writer } = await createPdfWriter();
  const t = createPdfTemplate(writer, {
    brandName: "Moto-Hub",
    companyName: "株式会社RideWorks",
    contact: "info@moto-hub.jp",
  });

  await t.header({
    documentTitle: "領収書",
    issuedAt: input.paidAt,
    documentNo: input.receiptId.slice(0, 8),
    dealId: input.dealId,
  });

  t.sectionTitle("領収内容");
  t.keyValueGrid([
    { label: "支払者", value: input.payerLabel },
    { label: "受領者", value: input.payeeLabel },
    { label: "対象", value: input.vehicleLabel },
    { label: "領収金額（税込）", value: yen(input.amountIncTax) },
    { label: "領収日", value: input.paidAt },
  ]);

  t.footer({
    notes: ["本領収書は Moto-Hub 上の取引に基づきシステムが発行したものです。"],
  });

  return doc.save();
}
