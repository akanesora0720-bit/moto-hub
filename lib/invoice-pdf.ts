import { createPdfWriter } from "@/lib/pdf-font";
import type { MotohubIssuer } from "@/lib/motohub-issuer";
import { createPdfTemplate } from "@/lib/pdf-template";

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
  const t = createPdfTemplate(writer, {
    brandName: "Moto-Hub",
    companyName: input.issuer?.companyName ?? "株式会社RideWorks",
    qualifiedInvoiceNumber: input.issuer?.qualifiedInvoiceNumber ?? null,
    contact: "info@moto-hub.jp",
  });

  await t.header({
    documentTitle: input.partyLabel,
    issuedAt: input.issuedAt,
    documentNo: input.invoiceId.slice(0, 8),
    dealId: input.dealId ?? null,
    recordId: input.referenceId ?? null,
  });

  t.sectionTitle("基本情報");
  t.keyValueGrid(
    [
      { label: "請求先", value: input.billToName },
      { label: "対象", value: input.vehicleLabel },
      ...(input.referenceId
        ? [{ label: input.referenceLabel ?? "参照ID", value: input.referenceId.slice(0, 8) }]
        : []),
      ...(input.paymentDueAt ? [{ label: "お支払期限", value: input.paymentDueAt }] : []),
    ],
    2,
  );

  t.sectionTitle("請求明細");
  t.table({
    headers: ["項目", "税抜", "消費税", "税込"],
    colWidths: [0.52, 0.16, 0.16, 0.16],
    align: ["left", "right", "right", "right"],
    rows: input.items.map((i) => [i.label, yen(i.amountExTax), yen(i.taxAmount), yen(i.amountIncTax)]),
  });

  t.keyValueGrid(
    [
      { label: "税抜合計", value: yen(input.totalExTax) },
      { label: "消費税", value: yen(input.totalTax) },
      { label: "請求総額（税込）", value: yen(input.totalIncTax) },
    ],
    3,
  );

  if (input.issuer?.bankLine) {
    t.sectionTitle("お振込先（Moto-Hub運営）");
    t.keyValueGrid(
      [
        { label: "振込先", value: input.issuer.bankLine },
        { label: "振込名義", value: "請求先（貴社）の登録名義" },
      ],
      1,
    );
  }

  t.footer({
    notes: [
      "本書はMoto-Hubにより自動生成されています。",
      "振込先口座は請求書の記載内容をご確認ください。",
    ],
  });

  return doc.save();
}
