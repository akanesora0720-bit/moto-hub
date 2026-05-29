import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";

export default function FavoritesPage() {
  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">お気に入り</h1>
          <p className="mt-1 text-sm text-muted">ウォッチリスト機能は準備中です。</p>
        </div>
        <Link
          href="/search"
          className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
        >
          車両を探す →
        </Link>
      </div>
    </AuthenticatedShell>
  );
}
