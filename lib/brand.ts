const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://moto-hub-blond.vercel.app";

export const BRAND = {
  productName: "Moto-Hub",
  /** ロゴ横ワードマーク（UI用・ハイフンなし） */
  logoLockupLabel: "MotoHub",
  companyName: "（株）RideWorks",
  /** マーケLP用ドメイン（Xserver・未公開時はLP未設置）。ログインは appOrigin を使う */
  siteUrl: "https://moto-hub.jp",
  siteHost: "moto-hub.jp",
  /** B2Bアプリ本番（Vercel）。資料のQR・ログイン導線はこちら */
  appOrigin: APP_ORIGIN,
  loginUrl: `${APP_ORIGIN}/login`,
  signupUrl: `${APP_ORIGIN}/signup`,
  contactEmail: "info@moto-hub.jp",
  ctaApply: "無料で先行加盟申請する",
  /** 横組みフルロゴ（PDF 等） */
  logoSrc: "/logo.png",
  /** UI用マークのみ（logo.png 左のアイコン切り出し） */
  logoMarkSrc: "/logo-mark.png",
} as const;

/** DBテンプレート等に残る旧表記を送信・表示時に正規化 */
export function toBrandDisplay(text: string): string {
  return text.replaceAll("MotoHub", BRAND.productName);
}

