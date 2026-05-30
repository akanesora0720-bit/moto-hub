import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";

const SETTINGS_LINKS = [
  { href: "/onboarding", label: "会社・店舗情報", desc: "古物商・インボイス・口座" },
  { href: "/my/payments", label: "請求・入金", desc: "手数料・月額の確認と報告" },
  { href: "/profile", label: "信用ランク", desc: "スコアと減点履歴" },
  { href: "/support", label: "運営サポート", desc: "書類・入金・名変の相談" },
  { href: "/help", label: "操作説明", desc: "使い方の確認" },
  { href: "/settings/withdraw", label: "退会", desc: "アカウントの退会" },
] as const;

export default function SettingsPage() {
  return (
    <AuthenticatedShell mode="dealer">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">設定</h1>
          <p className="mt-1 text-sm text-muted">
            日常の操作はホームの「要対応」「よく使う」から。ここは登録情報の確認用です。
          </p>
        </div>
        <ul className="space-y-2">
          {SETTINGS_LINKS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-xl border border-border bg-card px-4 py-4 transition hover:border-accent/40"
              >
                <p className="font-medium">{item.label}</p>
                <p className="mt-1 text-sm text-muted">{item.desc}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </AuthenticatedShell>
  );
}
