"use client";

import { MotohubLogo } from "@/components/MotohubLogo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav-config";

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  return pathname === item.href;
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
      <div className="hidden p-4 md:block">
        <Link href={homeHref} className="flex items-center gap-2">
          <MotohubLogo width={88} height={28} className="h-7 w-auto" priority />
          <span className="text-sm font-semibold text-accent">MotoHub</span>
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-3">
        {items.map((item) => {
          const active = isActive(pathname, item);
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
