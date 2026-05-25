import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

const NOTO_SANS_JP_URL =
  "https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf";

let cachedFontBytes: ArrayBuffer | null = null;

async function loadFontBytes(): Promise<ArrayBuffer> {
  if (cachedFontBytes) return cachedFontBytes;
  const res = await fetch(NOTO_SANS_JP_URL);
  if (!res.ok) {
    throw new Error(`Failed to load PDF font: ${res.status}`);
  }
  cachedFontBytes = await res.arrayBuffer();
  return cachedFontBytes;
}

export type PdfWriter = {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
  draw: (text: string, size?: number, useBold?: boolean) => void;
};

export async function createPdfWriter(): Promise<{ doc: PDFDocument; writer: PdfWriter }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = await loadFontBytes();
  const font = await doc.embedFont(fontBytes);
  const bold = await doc.embedFont(fontBytes);
  const page = doc.addPage([595, 842]);

  const writer: PdfWriter = {
    page,
    font,
    bold,
    y: 800,
    draw(text: string, size = 11, useBold = false) {
      page.drawText(text, {
        x: 50,
        y: this.y,
        size,
        font: useBold ? bold : font,
        color: rgb(0.1, 0.1, 0.1),
      });
      this.y -= size + 6;
    },
  };

  return { doc, writer };
}

/** Fallback when font load fails (ASCII only) */
export function toAsciiPdfText(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "?");
}
