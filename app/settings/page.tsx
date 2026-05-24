import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";

export default function SettingsPage() {
  const items = [
    { href: "/onboarding", label: "会社情報・店舗情報", desc: "古物商番号・インボイス等" },
    { href: "/profile", label: "信用証・公開プロフィール", desc: "評価・ランクの確認" },
    { href: "/my/payments", label: "振込・月額入金報告", desc: "入金報告と確認" },
    { href: "/support", label: "運営サポート", desc: "書類・入金・名変の相談" },
    { href: "/notifications", label: "通知設定", desc: "運営からのお知らせ" },
  ];

  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">設定</h1>
        </div>
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-xl border border-border bg-card p-4 transition hover:border-accent/40"
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
