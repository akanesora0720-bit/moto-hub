"use client";

import Link from "next/link";
import { MotohubLogo } from "@/components/MotohubLogo";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SidebarNav } from "@/components/layout/SidebarNav";
import { canAccessAdmin } from "@/lib/auth";
import { dealerNavForLimitedAccess } from "@/lib/account-status";
import { adminNavItems, dealerNavItems, staffNavItems } from "@/lib/nav-config";
import { createClient } from "@/lib/supabase/client";
import type { AccountStatus, MemberType, Profile } from "@/lib/types";

export function AppShell({
  children,
  isAdmin: isAdminProp,
  memberType: memberTypeProp,
  showAdminNav: showAdminNavProp,
  mode,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  memberType?: MemberType;
  showAdminNav?: boolean;
  mode?: "dealer" | "admin";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [memberType, setMemberType] = useState<MemberType>(
    memberTypeProp ?? "dealer",
  );
  const [showAdmin, setShowAdmin] = useState(
    showAdminNavProp ?? !!isAdminProp,
  );
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);

  const isAdminRoute = pathname.startsWith("/admin");
  const isStaff = memberType === "staff";
  const useAdminShell =
    mode === "dealer"
      ? false
      : mode === "admin" || isAdminRoute || isStaff;

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
        .select("member_type, is_admin, is_active, account_status")
        .eq("id", auth.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          const p = data as Pick<Profile, "member_type" | "is_admin" | "is_active" | "account_status">;
          setMemberType(p.member_type ?? "dealer");
          setAccountStatus(p.account_status ?? "pre_registered");
          setShowAdmin(isAdminProp ?? canAccessAdmin(p as Profile));
        });
    });
  }, [isAdminProp, memberTypeProp, showAdminNavProp]);

  const refreshBadges = useCallback(() => {
    const scope = useAdminShell ? "admin" : "dealer";
    fetch(`/api/dashboard/badges?scope=${scope}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => setBadges(data as Record<string, number>))
      .catch(() => {});
  }, [useAdminShell]);

  useEffect(() => {
    refreshBadges();
    const interval = window.setInterval(refreshBadges, 30_000);
    return () => window.clearInterval(interval);
  }, [pathname, refreshBadges]);

  useEffect(() => {
    const onFocus = () => refreshBadges();
    const onBadgeRefresh = () => refreshBadges();
    window.addEventListener("focus", onFocus);
    window.addEventListener("motohub:refresh-badges", onBadgeRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("motohub:refresh-badges", onBadgeRefresh);
    };
  }, [refreshBadges]);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  const dealerNav =
    !useAdminShell && accountStatus && accountStatus !== "approved"
      ? dealerNavForLimitedAccess(dealerNavItems)
      : dealerNavItems;

  const navItems = useAdminShell
    ? isStaff
      ? staffNavItems
      : adminNavItems
    : dealerNav;
  const homeHref = useAdminShell ? "/admin" : "/home";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link href={homeHref} prefetch={false} className="flex min-w-0 items-center gap-2">
            <MotohubLogo priority />
          </Link>
          <div className="flex shrink-0 items-center gap-2 text-sm">
            {!useAdminShell && showAdmin && !isStaff ? (
              <Link href="/admin" className="text-accent hover:underline">
                運営画面
              </Link>
            ) : null}
            {useAdminShell && !isStaff ? (
              <Link href="/home" className="text-muted hover:text-foreground">
                加盟店画面
              </Link>
            ) : null}
            <Link
              href={useAdminShell ? "/admin/notifications" : "/notifications"}
              className="text-muted hover:text-foreground"
            >
              通知
              {badges.unreadNotifications ? (
                <span className="ml-0.5 text-rose-400">({badges.unreadNotifications})</span>
              ) : null}
            </Link>
            <button
              type="button"
              onClick={logout}
              className="text-muted hover:text-foreground"
            >
              ログアウト
            </button>
          </div>
        </div>
        <p className="border-t border-border/60 px-4 py-1.5 text-xs text-muted">
          {useAdminShell ? "運営管理センター" : "加盟店ダッシュボード"}
        </p>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <SidebarNav items={navItems} badges={badges} homeHref={homeHref} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="hidden border-b border-border bg-background/90 px-6 py-3 md:flex md:items-center md:justify-between">
            <p className="text-sm font-medium text-foreground">
              {useAdminShell ? "運営管理センター" : "加盟店ダッシュボード"}
            </p>
            <div className="flex items-center gap-3 text-sm">
              {!useAdminShell && showAdmin && !isStaff ? (
                <Link href="/admin" className="text-accent hover:underline">
                  運営画面へ
                </Link>
              ) : null}
              {useAdminShell && !isStaff ? (
                <Link href="/home" className="text-muted hover:text-foreground">
                  加盟店画面へ
                </Link>
              ) : null}
              <Link
                href={useAdminShell ? "/admin/notifications" : "/notifications"}
                className="text-muted hover:text-foreground"
              >
                通知
                {badges.unreadNotifications ? (
                  <span className="ml-1 text-rose-400">({badges.unreadNotifications})</span>
                ) : null}
              </Link>
              <button
                type="button"
                onClick={logout}
                className="text-muted hover:text-foreground"
              >
                ログアウト
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
