"use client";

import { MotohubLogo } from "@/components/MotohubLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav-config";

function itemMatches(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
}

/** 最も具体的な href だけをハイライト（例: /admin/credit と /admin/credit/adjust） */
function isActive(pathname: string, item: NavItem, allItems: NavItem[]): boolean {
  const matches = allItems.filter((i) => itemMatches(pathname, i));
  if (!matches.some((m) => m.href === item.href)) return false;
  const best = matches.reduce((a, b) => (a.href.length >= b.href.length ? a : b));
  return best.href === item.href;
}

export function SidebarNav({
  items,
  badges = {},
  homeHref,
}: {
  items: NavItem[];
  badges?: Record<string, number>;
  homeHref: string;
}) {
  const pathname = usePathname();

  return (
  <aside className="flex w-full shrink-0 flex-col border-b border-border bg-zinc-950/50 md:w-52 md:border-b-0 md:border-r md:min-h-[calc(100vh-3.5rem)]">
      <div className="hidden border-b border-border/60 px-4 py-4 md:block">
        <Link href={homeHref} prefetch={false} className="inline-flex min-w-0">
          <MotohubLogo priority />
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-3">
        {items.map((item) => {
          const active = isActive(pathname, item, items);
          const badge = item.badgeKey ? badges[item.badgeKey] ?? 0 : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition md:w-full ${
                active
                  ? "bg-accent/15 font-medium text-accent"
                  : "text-muted hover:bg-zinc-900 hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              {badge > 0 ? (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
