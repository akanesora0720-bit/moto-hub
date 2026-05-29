import { createPdfWriter } from "@/lib/pdf-font";
import { createPdfTemplate } from "@/lib/pdf-template";

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
  const t = createPdfTemplate(writer, {
    brandName: "Moto-Hub",
    companyName: "株式会社RideWorks",
    contact: "info@moto-hub.jp",
  });

  await t.header({
    documentTitle: "入金指示書",
    issuedAt: input.issuedAt,
    documentNo: input.dealId.slice(0, 8),
    dealId: input.dealId,
  });

  t.sectionTitle("基本情報");
  t.keyValueGrid(
    [
      { label: "支払期限", value: input.paymentDueAt ?? "—" },
      { label: "車両", value: input.vehicleLabel },
      { label: "車台番号", value: input.frameNumber },
    ],
    2,
  );

  t.sectionTitle("お振込先（売り手）");
  t.keyValueGrid(
    [
      { label: "会社名", value: input.seller.storeName },
      ...(input.seller.tradeName ? [{ label: "屋号", value: input.seller.tradeName }] : []),
      ...(input.seller.contactName ? [{ label: "担当者", value: input.seller.contactName }] : []),
      ...(input.seller.invoiceNumber
        ? [{ label: "インボイス登録番号", value: input.seller.invoiceNumber }]
        : []),
      ...(input.seller.phone ? [{ label: "電話", value: input.seller.phone }] : []),
      ...(input.seller.bankLine ? [{ label: "振込先", value: input.seller.bankLine }] : []),
    ],
    1,
  );

  t.sectionTitle("お支払い金額");
  t.table({
    headers: ["項目", "金額"],
    colWidths: [0.7, 0.3],
    align: ["left", "right"],
    rows: [
      ["車両代（税抜）", `¥${input.vehiclePriceExTax.toLocaleString("ja-JP")}`],
      ["消費税（10%）", `¥${input.vehicleTax.toLocaleString("ja-JP")}`],
      ["支払総額（税込）", `¥${input.totalIncTax.toLocaleString("ja-JP")}`],
    ],
  });

  t.footer({
    notes: [
      "Moto-Hubは資金を預かりません。上記口座へ直接お振込みください。",
      "振込名義は貴社名（または登録店舗名）でお願いします。",
      "入金後、売り手が入金確認を行います。",
      "名義変更・書類のやり取りは売買当事者間で行ってください。",
    ],
  });

  return doc.save();
}
