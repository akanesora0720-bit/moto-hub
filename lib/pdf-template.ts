import type { PDFPage, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";
import type { PdfWriter } from "@/lib/pdf-font";
import { loadMotohubLogoBytes } from "@/lib/motohub-logo";

export type PdfDocumentHeader = {
  documentTitle: string; // 書類名
  issuedAt: string; // 発行日（表示文字列）
  documentNo: string; // 書類番号（表示用）
  dealId?: string | null; // 取引ID（任意）
  recordId?: string | null; // 取引記録ID等（任意）
};

export type PdfIssuerBlock = {
  brandName?: string; // Moto-Hub
  companyName?: string; // 株式会社RideWorks
  qualifiedInvoiceNumber?: string | null;
  contact?: string | null; // info@moto-hub.jp など
};

export type PdfFooterBlock = {
  notes?: string[]; // 注意事項など
};

export type PdfKeyValue = { label: string; value: string };

type DrawTextOpts = {
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  color?: { r: number; g: number; b: number };
  maxWidth?: number; // 折返し
  lineGap?: number;
};

export type PdfTemplate = ReturnType<typeof createPdfTemplate>;

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 52;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const COLORS = {
  text: rgb(0.08, 0.08, 0.08),
  muted: rgb(0.35, 0.35, 0.35),
  line: rgb(0.78, 0.78, 0.78),
  headFill: rgb(0.94, 0.94, 0.94),
};

function widthOf(font: PDFFont, text: string, size: number): number {
  return font.widthOfTextAtSize(text, size);
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const raw = (text ?? "").replace(/\r\n/g, "\n");
  const paragraphs = raw.split("\n");
  const lines: string[] = [];
  for (const p of paragraphs) {
    const s = p.trimEnd();
    if (!s) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const ch of Array.from(s)) {
      const next = current + ch;
      if (widthOf(font, next, size) <= maxWidth) {
        current = next;
        continue;
      }
      if (current) lines.push(current);
      current = ch;
    }
    if (current) lines.push(current);
  }
  return lines;
}

function ensureSpace(t: { y: number }, needed: number) {
  const minY = MARGIN_BOTTOM + needed;
  if (t.y < minY) {
    throw new Error("PDF overflow: content too long for single page");
  }
}

export function createPdfTemplate(writer: PdfWriter, issuer?: PdfIssuerBlock) {
  const page = writer.page;
  const font = writer.font;
  const bold = writer.bold;

  const t = {
    page,
    font,
    bold,
    x: MARGIN_X,
    y: PAGE_H - MARGIN_TOP,

    drawText(text: string, opts: DrawTextOpts) {
      const {
        x,
        y,
        size,
        bold: useBold,
        color = { r: COLORS.text.red, g: COLORS.text.green, b: COLORS.text.blue },
        maxWidth,
        lineGap = 4,
      } = opts;
      const f = useBold ? bold : font;
      const col = rgb(color.r, color.g, color.b);
      if (!maxWidth) {
        page.drawText(text, { x, y, size, font: f, color: col });
        return y - (size + lineGap);
      }
      const lines = wrapText(f, text, size, maxWidth);
      let yy = y;
      for (const line of lines) {
        page.drawText(line, { x, y: yy, size, font: f, color: col });
        yy -= size + lineGap;
      }
      return yy;
    },

    hr(y: number) {
      page.drawLine({
        start: { x: MARGIN_X, y },
        end: { x: MARGIN_X + CONTENT_W, y },
        thickness: 1,
        color: COLORS.line,
      });
    },

    sectionTitle(title: string) {
      ensureSpace(t, 26);
      t.y = t.drawText(title, { x: t.x, y: t.y, size: 11, bold: true, lineGap: 6 });
      t.hr(t.y + 2);
      t.y -= 10;
    },

    keyValueGrid(items: PdfKeyValue[], cols = 2) {
      const gapX = 16;
      const colW = (CONTENT_W - gapX * (cols - 1)) / cols;
      const rowH = 18;
      const labelSize = 9;
      const valueSize = 10;

      let i = 0;
      while (i < items.length) {
        ensureSpace(t, rowH + 8);
        const baseY = t.y;
        for (let c = 0; c < cols && i < items.length; c += 1, i += 1) {
          const item = items[i]!;
          const x = MARGIN_X + c * (colW + gapX);
          t.drawText(item.label, {
            x,
            y: baseY,
            size: labelSize,
            bold: false,
            color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue },
            maxWidth: colW,
            lineGap: 2,
          });
          t.drawText(item.value || "—", {
            x,
            y: baseY - 12,
            size: valueSize,
            bold: false,
            maxWidth: colW,
            lineGap: 2,
          });
        }
        t.y -= rowH + 8;
      }
    },

    table(opts: {
      headers: string[];
      rows: (string | number | null | undefined)[][];
      colWidths: number[]; // 合計=1.0
      align?: ("left" | "right" | "center")[];
    }) {
      const headerH = 18;
      const rowH = 18;
      const size = 9.5;
      const paddingX = 6;

      const widths = opts.colWidths.map((w) => w * CONTENT_W);
      const totalH = headerH + rowH * opts.rows.length + 8;
      ensureSpace(t, totalH);

      const x0 = MARGIN_X;
      const y = t.y;

      // header background
      page.drawRectangle({
        x: x0,
        y: y - headerH + 4,
        width: CONTENT_W,
        height: headerH,
        color: COLORS.headFill,
      });

      // outer border
      page.drawRectangle({
        x: x0,
        y: y - (headerH + rowH * opts.rows.length) + 4,
        width: CONTENT_W,
        height: headerH + rowH * opts.rows.length,
        borderWidth: 1,
        borderColor: COLORS.line,
        color: rgb(1, 1, 1),
      });

      // vertical lines + header text
      let xx = x0;
      for (let c = 0; c < opts.headers.length; c += 1) {
        const w = widths[c] ?? 0;
        const header = opts.headers[c] ?? "";
        const align = opts.align?.[c] ?? "left";
        const textW = widthOf(bold, header, size);
        const tx =
          align === "right"
            ? xx + w - paddingX - textW
            : align === "center"
              ? xx + (w - textW) / 2
              : xx + paddingX;
        page.drawText(header, { x: tx, y: y - 11, size, font: bold, color: COLORS.text });
        if (c > 0) {
          page.drawLine({
            start: { x: xx, y: y + 4 },
            end: { x: xx, y: y - (headerH + rowH * opts.rows.length) + 4 },
            thickness: 1,
            color: COLORS.line,
          });
        }
        xx += w;
      }

      // horizontal lines
      for (let r = 0; r < opts.rows.length; r += 1) {
        const yy = y - headerH - rowH * r + 4;
        page.drawLine({
          start: { x: x0, y: yy },
          end: { x: x0 + CONTENT_W, y: yy },
          thickness: 1,
          color: COLORS.line,
        });
      }

      // rows
      for (let r = 0; r < opts.rows.length; r += 1) {
        const row = opts.rows[r] ?? [];
        let cx = x0;
        for (let c = 0; c < opts.headers.length; c += 1) {
          const w = widths[c] ?? 0;
          const align = opts.align?.[c] ?? "left";
          const val = row[c];
          const text = val == null ? "—" : typeof val === "number" ? String(val) : String(val);
          const textW = widthOf(font, text, size);
          const tx =
            align === "right"
              ? cx + w - paddingX - textW
              : align === "center"
                ? cx + (w - textW) / 2
                : cx + paddingX;
          page.drawText(text, { x: tx, y: y - headerH - rowH * r - 11, size, font, color: COLORS.text });
          cx += w;
        }
      }

      t.y = y - (headerH + rowH * opts.rows.length) - 14;
    },

    async header(meta: PdfDocumentHeader) {
      const brand = issuer?.brandName ?? "Moto-Hub";
      const company = issuer?.companyName ?? "株式会社RideWorks";
      const leftW = CONTENT_W * 0.55;
      const rightW = CONTENT_W - leftW;

      ensureSpace(t, 92);

      let logoRendered = false;
      try {
        const logo = await loadMotohubLogoBytes();
        if (logo) {
          const img =
            logo.format === "jpg"
              ? await page.doc.embedJpg(logo.bytes)
              : await page.doc.embedPng(logo.bytes);
          const logoW = 108;
          const logoH = (logoW * img.height) / img.width;
          page.drawImage(img, {
            x: MARGIN_X,
            y: t.y - logoH + 8,
            width: logoW,
            height: logoH,
          });
          t.y = t.y - logoH - 10;
          logoRendered = true;
        }
      } catch {
        // ignore rendering failure
      }

      if (!logoRendered) {
        t.y = t.drawText(brand, {
          x: MARGIN_X,
          y: t.y,
          size: 18,
          bold: true,
          maxWidth: leftW,
        });
      }

      t.y = t.drawText(company, {
        x: MARGIN_X,
        y: t.y + 2,
        size: 10,
        bold: false,
        color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue },
        maxWidth: leftW,
      });

      // Doc title
      const titleY = PAGE_H - MARGIN_TOP;
      t.drawText(meta.documentTitle, {
        x: MARGIN_X,
        y: titleY - 34,
        size: 14,
        bold: true,
        maxWidth: leftW,
      });

      // Right info box
      const boxX = MARGIN_X + leftW + 12;
      const boxY = PAGE_H - MARGIN_TOP;
      const boxH = 64;
      page.drawRectangle({
        x: boxX,
        y: boxY - boxH,
        width: rightW - 12,
        height: boxH,
        borderWidth: 1,
        borderColor: COLORS.line,
        color: rgb(1, 1, 1),
      });

      const kv: PdfKeyValue[] = [
        { label: "発行日", value: meta.issuedAt },
        { label: "書類番号", value: meta.documentNo },
        ...(meta.dealId ? [{ label: "取引ID", value: meta.dealId.slice(0, 8) }] : []),
        ...(meta.recordId ? [{ label: "記録ID", value: meta.recordId.slice(0, 8) }] : []),
      ];

      let yy = boxY - 14;
      const labelW = 54;
      for (const row of kv) {
        const lx = boxX + 10;
        const vx = boxX + 10 + labelW;
        t.drawText(row.label, {
          x: lx,
          y: yy,
          size: 9,
          color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue },
        });
        t.drawText(row.value, { x: vx, y: yy, size: 9, bold: true, maxWidth: rightW - 12 - 20 - labelW });
        yy -= 14;
      }

      t.y = PAGE_H - MARGIN_TOP - 86;
      t.hr(t.y + 8);
      t.y -= 10;
    },

    footer(block?: PdfFooterBlock) {
      const y0 = MARGIN_BOTTOM;
      page.drawLine({
        start: { x: MARGIN_X, y: y0 + 24 },
        end: { x: MARGIN_X + CONTENT_W, y: y0 + 24 },
        thickness: 1,
        color: COLORS.line,
      });
      const left = issuer?.qualifiedInvoiceNumber
        ? `適格請求書番号: ${issuer.qualifiedInvoiceNumber}`
        : "";
      const right = issuer?.contact ? `お問い合わせ: ${issuer.contact}` : "";
      if (left) t.drawText(left, { x: MARGIN_X, y: y0 + 10, size: 8.5, color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue } });
      if (right) {
        const tw = widthOf(font, right, 8.5);
        t.drawText(right, { x: MARGIN_X + CONTENT_W - tw, y: y0 + 10, size: 8.5, color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue } });
      }
      const auto = "本書はMoto-Hubにより自動生成されています。";
      t.drawText(auto, { x: MARGIN_X, y: y0 - 2, size: 8.5, color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue } });
      if (block?.notes?.length) {
        const noteText = block.notes.map((n) => `・${n}`).join("\n");
        t.drawText(noteText, {
          x: MARGIN_X,
          y: y0 - 16,
          size: 8.5,
          color: { r: COLORS.muted.red, g: COLORS.muted.green, b: COLORS.muted.blue },
          maxWidth: CONTENT_W,
          lineGap: 2,
        });
      }
    },
  };

  return t;
}

