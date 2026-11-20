"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isActive, navItems } from "./nav";
import { NavPending } from "./NavPending";
import { cx } from "@/lib/format";
import { FavouritesBottomLink } from "./favourites/FavouritesNav";

/** Phone and tablet navigation within thumb reach; on a narrow phone the row scrolls sideways. Hidden inside the lesson player, which has its own controls, and on public links. */
export function BottomNav() {
  const pathname = usePathname();
  const ownControls = /^\/(learning|review|open)\/[^/]+/.test(pathname);
  if (ownControls || pathname === "/login") return null;
  return (
    <nav
      aria-label="Primary"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="flex min-w-0 flex-1 overflow-x-auto sm:grid sm:grid-flow-col sm:auto-cols-fr">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx("relative flex min-h-16 flex-col items-center justify-center gap-1 px-0.5 text-xs font-medium", active ? "text-action" : "text-ink-muted")}
              >
                <span className={cx("rounded-full px-3 py-1", active && "bg-tealtint")}>
                  <Icon name={item.icon} className="size-5" />
                </span>
                {/* Seven items across a phone: a touch smaller, and never narrower than the label, so they don’t run together; the row scrolls instead. */}
                <span className="whitespace-nowrap text-center text-[0.66rem] leading-tight tracking-tight">{item.short ?? item.label}</span>
                <NavPending className="inset-x-3 top-0" />
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Favourites stays put at the end while the rest of the row scrolls: one tap from any page, with its label. */}
      <FavouritesBottomLink />
    </nav>
  );
}
