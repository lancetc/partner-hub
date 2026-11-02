"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isActive, navItems } from "./nav";
import { cx } from "@/lib/format";

/** Phone and tablet navigation within thumb reach. Hidden inside the lesson player, which has its own controls. */
export function BottomNav() {
  const pathname = usePathname();
  if (/^\/(learning|review)\/[^/]+/.test(pathname)) return null;
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-6">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs font-medium", active ? "text-action" : "text-ink-muted")}
              >
                <span className={cx("rounded-full px-4 py-1", active && "bg-tealtint")}>
                  <Icon name={item.icon} className="size-5" />
                </span>
                <span className="text-center leading-tight">{item.short ?? item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
