"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canAccessAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type { MemberType, Profile } from "@/lib/types";

const dealerNav = [
  { href: "/", label: "在庫" },
  { href: "/deals", label: "取引" },
  { href: "/listings/new", label: "出品" },
  { href: "/listings/mine", label: "自分の出品" },
  { href: "/evaluation", label: "評価基準" },
  { href: "/my/dashboard", label: "マイ統計" },
  { href: "/profile", label: "信用証" },
];

export function AppShell({
  children,
  isAdmin: isAdminProp,
  memberType: memberTypeProp,
  showAdminNav: showAdminNavProp,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  /** サーバーから渡すとクライアント側の再取得をスキップ */
  memberType?: MemberType;
  showAdminNav?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [memberType, setMemberType] = useState<MemberType>(
    memberTypeProp ?? "dealer",
  );
  const [showAdmin, setShowAdmin] = useState(
    showAdminNavProp ?? !!isAdminProp,
  );

  useEffect(() => {
    if (memberTypeProp !== undefined) {
      setMemberType(memberTypeProp);
      setShowAdmin(showAdminNavProp ?? !!isAdminProp);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: auth }) => {
      if (!auth.user) return;
      supabase
        .from("profiles")
        .select("member_type, is_admin, is_active")
        .eq("id", auth.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          const p = data as Pick<Profile, "member_type" | "is_admin" | "is_active">;
          setMemberType(p.member_type ?? "dealer");
          setShowAdmin(isAdminProp ?? canAccessAdmin(p as Profile));
        });
    });
  }, [isAdminProp, memberTypeProp, showAdminNavProp]);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const isStaff = memberType === "staff";
  const nav = isStaff
    ? [
        { href: "/admin", label: "管理" },
        { href: "/admin/credit", label: "信用" },
        { href: "/evaluation", label: "評価基準" },
      ]
    : dealerNav;
  const homeHref = isStaff ? "/admin" : "/";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href={homeHref}
            prefetch={false}
            className="text-lg font-semibold tracking-wide text-accent"
          >
            MotoHub
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`rounded-lg px-3 py-1.5 transition ${
                  pathname === item.href || (item.href === "/admin" && pathname.startsWith("/admin"))
                    ? "bg-zinc-800 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {showAdmin && !isStaff ? (
              <>
                <Link
                  href="/admin"
                  prefetch={false}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    pathname.startsWith("/admin")
                      ? "bg-zinc-800 text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  管理
                </Link>
              </>
            ) : null}
            {showAdmin ? (
              <Link
                href="/admin/disputes"
                prefetch={false}
                className={`rounded-lg px-3 py-1.5 transition ${
                  pathname === "/admin/disputes"
                    ? "bg-zinc-800 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Dispute
              </Link>
            ) : null}
            {showAdmin ? (
              <Link
                href="/admin/credit"
                prefetch={false}
                className={`rounded-lg px-3 py-1.5 transition ${
                  pathname === "/admin/credit"
                    ? "bg-zinc-800 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                信用
              </Link>
            ) : null}
            {!isStaff ? (
              <Link
                href="/onboarding"
                prefetch={false}
                className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
              >
                店舗情報
              </Link>
            ) : (
              <Link
                href="/onboarding"
                prefetch={false}
                className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
              >
                スタッフ情報
              </Link>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-muted hover:text-foreground"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
