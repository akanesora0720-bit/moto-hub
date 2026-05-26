export type PolicyType = "terms" | "privacy";

/** 現行バージョン（改定時に更新） */
export const CURRENT_TERMS_VERSION = "v1";
export const CURRENT_PRIVACY_VERSION = "v1";

export const TERMS_PDF_FILENAME = "Motohub Terms Of Service V1.pdf";
export const TERMS_PDF_PATH = `/terms/${TERMS_PDF_FILENAME}`;
export const PRIVACY_PDF_PATH = "/legal/privacy_policy.pdf";

export function termsPdfHref(origin?: string): string {
  const path = `/terms/${encodeURIComponent(TERMS_PDF_FILENAME)}`;
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function privacyPdfHref(origin?: string): string {
  const path = PRIVACY_PDF_PATH;
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function termsPdfAbsoluteUrl(origin: string): string {
  return termsPdfHref(origin);
}

export function privacyPdfAbsoluteUrl(origin: string): string {
  return privacyPdfHref(origin);
}

export function registrationPolicyPayload(origin: string) {
  return {
    terms_accepted: true,
    privacy_accepted: true,
    terms_version: CURRENT_TERMS_VERSION,
    privacy_version: CURRENT_PRIVACY_VERSION,
    terms_pdf_url: termsPdfAbsoluteUrl(origin),
    privacy_pdf_url: privacyPdfAbsoluteUrl(origin),
  };
}
