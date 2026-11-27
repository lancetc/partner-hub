"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { isActiveInBar, navItems } from "./nav";
import { NavPending } from "./NavPending";
import { cx } from "@/lib/format";
import { FavouritesBottomLink } from "./favourites/FavouritesNav";
import { LearnSheet } from "./LearnMenu";

const itemClass = (active: boolean) =>
  cx("relative flex min-h-16 w-full flex-col items-center justify-center gap-1 px-0.5 text-xs font-medium", active ? "text-action" : "text-ink-muted");
const iconClass = (active: boolean) => cx("rounded-full px-3 py-1", active && "bg-tealtint");

/**
  Phone and tablet navigation within thumb reach: News, Learn, Community and Resources, then Favourites. Hidden inside the
  lesson player, which has its own controls, and on public links. Work Tools isn't a sixth item: it lives in Resources,
  which is lit up on its pages (nav.ts, isActiveInBar).
*/
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
        {navItems.flatMap((item, i) => {
          const active = isActiveInBar(pathname, item.href);
          const link = (
            <li key={item.href} className="flex-1">
              <Link href={item.href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
                <span className={iconClass(active)}>
                  <Icon name={item.icon} className="size-5" />
                </span>
                <span className="whitespace-nowrap text-center text-xs leading-tight tracking-tight">{item.short ?? item.label}</span>
                <NavPending className="inset-x-3 top-0" />
              </Link>
            </li>
          );
          // Learn comes second, after News: it opens the ways to learn as a sheet (LearnMenu).
          return i === 0
            ? [
                link,
                <li key="learn" className="flex-1">
                  <LearnSheet buttonClassName={itemClass} iconClassName={iconClass} />
                </li>,
              ]
            : [link];
        })}
      </ul>
      {/* Favourites stays put at the end while the rest of the row scrolls: one tap from any page, with its label. */}
      <FavouritesBottomLink />
    </nav>
  );
}
