import {
  CURRENT_TERMS_VERSION,
  isTermsReconsentExemptPath,
} from "@/lib/legal-policies";

/** ログイン済みユーザーに v3 同意を要求するか */
export function needsTermsReconsentPath(pathname: string): boolean {
  if (isTermsReconsentExemptPath(pathname)) return false;
  const publicAuth = ["/login", "/signup"];
  if (publicAuth.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return false;
  }
  return true;
}

export { CURRENT_TERMS_VERSION };
