export type PolicyType = "terms" | "privacy";

/** 現行バージョン（ローンチ後の改定時のみ更新） */
export const CURRENT_TERMS_VERSION = "v1";
export const CURRENT_PRIVACY_VERSION = "v1";

/** 法務文書の正本パス（Moto-Hub 自社ホスト） */
export const TERMS_DOCUMENT_PATH = "/terms";
export const PRIVACY_DOCUMENT_PATH = "/privacy";
export const PRICING_DOCUMENT_PATH = "/pricing";

/** @deprecated Use PRICING_DOCUMENT_PATH */
export const FEES_DOCUMENT_PATH = PRICING_DOCUMENT_PATH;

function documentHref(path: string, origin?: string): string {
  if (!origin) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function termsDocumentHref(origin?: string): string {
  return documentHref(TERMS_DOCUMENT_PATH, origin);
}

export function privacyDocumentHref(origin?: string): string {
  return documentHref(PRIVACY_DOCUMENT_PATH, origin);
}

export function pricingDocumentHref(origin?: string): string {
  return documentHref(PRICING_DOCUMENT_PATH, origin);
}

/** @deprecated Use pricingDocumentHref */
export const feesDocumentHref = pricingDocumentHref;

export function termsDocumentAbsoluteUrl(origin: string): string {
  return termsDocumentHref(origin);
}

export function privacyDocumentAbsoluteUrl(origin: string): string {
  return privacyDocumentHref(origin);
}

/** @deprecated Use termsDocumentHref */
export const termsPdfHref = termsDocumentHref;
/** @deprecated Use termsDocumentAbsoluteUrl */
export const termsPdfAbsoluteUrl = termsDocumentAbsoluteUrl;
/** @deprecated Use privacyDocumentHref */
export const privacyPdfHref = privacyDocumentHref;
/** @deprecated Use privacyDocumentAbsoluteUrl */
export const privacyPdfAbsoluteUrl = privacyDocumentAbsoluteUrl;

/** DB `policy_acceptances.pdf_url` に保存する同意時点の文書URL */
export function registrationPolicyPayload(origin: string) {
  return {
    terms_accepted: true,
    privacy_accepted: true,
    terms_version: CURRENT_TERMS_VERSION,
    privacy_version: CURRENT_PRIVACY_VERSION,
    terms_pdf_url: termsDocumentAbsoluteUrl(origin),
    privacy_pdf_url: privacyDocumentAbsoluteUrl(origin),
  };
}

/** 認証なしでも閲覧可能な法務ページ */
export function isLegalPublicPath(pathname: string): boolean {
  return (
    pathname === TERMS_DOCUMENT_PATH ||
    pathname === PRIVACY_DOCUMENT_PATH ||
    pathname === PRICING_DOCUMENT_PATH
  );
}
