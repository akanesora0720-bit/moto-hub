/** 現行利用規約バージョン（規約改定時に更新） */
export const CURRENT_TERMS_VERSION = "v1";

export const TERMS_PDF_FILENAME = "Motohub Terms Of Service V1.pdf";

/** public/ 配下のパス（先頭スラッシュ付き） */
export const TERMS_PDF_PATH = `/terms/${TERMS_PDF_FILENAME}`;

/** ブラウザで開く href（スペース等をエンコード） */
export function termsPdfHref(origin?: string): string {
  const path = `/terms/${encodeURIComponent(TERMS_PDF_FILENAME)}`;
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

/** DB 保存用の絶対 URL */
export function termsPdfAbsoluteUrl(origin: string): string {
  return termsPdfHref(origin);
}
