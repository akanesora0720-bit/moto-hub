import Link from "next/link";
import { MotohubLogo } from "@/components/MotohubLogo";
import { BRAND } from "@/lib/brand";

export function LpHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/lp" className="min-w-0">
          <MotohubLogo priority />
        </Link>
        <nav className="flex shrink-0 items-center gap-2 text-sm md:gap-4">
          <Link href="/pricing" className="hidden text-muted hover:text-foreground sm:inline">
            料金表
          </Link>
          <Link href={BRAND.loginUrl} className="text-muted hover:text-foreground">
            ログイン
          </Link>
          <Link
            href={BRAND.signupUrl}
            className="rounded-lg bg-accent px-3 py-2 font-semibold text-black hover:opacity-90 md:px-4"
          >
            加盟申請
          </Link>
        </nav>
      </div>
    </header>
  );
}
