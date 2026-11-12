"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, navItems } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { SearchButton } from "./SearchDialog";
import { AccountMenu } from "./AccountMenu";
import { Icon } from "./Icon";
import { api, useApi, type Me } from "@/lib/api";
import { cx } from "@/lib/format";

export function Logo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <>
      <Image src="/brand/trilogy-logo.svg" alt="Trilogy Care" width={1789} height={576} priority className={cx(className, "dark:hidden")} />
      <Image src="/brand/trilogy-logo-dark.svg" alt="Trilogy Care" width={1789} height={576} priority className={cx(className, "hidden dark:block")} />
    </>
  );
}

export function Header() {
  const pathname = usePathname();
  const me = useApi<Me>("/api/me").data;
  const inAdmin = pathname.startsWith("/admin");
  // Someone outside the hub (reviewing a lesson, or opening a public learning path) sees the brand only, not the hub's menus.
  if (pathname.startsWith("/review/") || pathname.startsWith("/open/"))
    return (
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo className="h-8 w-auto shrink-0 sm:h-10" />
          <span aria-hidden className="h-6 w-px bg-line-strong" />
          <span className="font-mulish text-xs font-bold tracking-wide text-ink-muted sm:text-sm">
            {pathname.startsWith("/open/") ? "Learning" : pathname.startsWith("/review/path/") ? "Learning path review" : "Topic review"}
          </span>
        </div>
      </header>
    );
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" translate="no" className="flex min-w-0 shrink items-center gap-2 rounded-lg sm:gap-3" aria-label="Trilogy Care Partner Hub home">
          <Logo className="h-8 w-auto shrink-0 sm:h-10" />
          {/* On phones and smaller laptops the buttons and menu need the room, so the logo stands alone. */}
          <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block lg:max-xl:hidden" />
          <span className="sr-only font-mulish text-sm font-bold tracking-wide text-ink-muted sm:not-sr-only lg:max-xl:sr-only xl:whitespace-nowrap">
            Partner Hub
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden lg:block xl:ml-6">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-[0.95rem] font-medium transition-colors xl:px-4",
                      active ? "bg-tealtint text-ink" : "text-ink-muted hover:bg-muted hover:text-ink",
                    )}
                  >
                    {item.short ? (
                      // The short label on smaller laptops, where the full row doesn't fit.
                      <>
                        <span className="xl:hidden">{item.short}</span>
                        <span className="hidden xl:inline">{item.label}</span>
                      </>
                    ) : (
                      item.label
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {/* Prototype: shown to everyone. A learner who clicks it is switched to the demo author account,
              since admin pages need an admin. Real sign-in would show it to admins only; the API enforces access either way. */}
          {me && (
            <Link
              href="/admin"
              aria-current={inAdmin ? "page" : undefined}
              title={me.canReport ? undefined : "Switches to the demo author account (Jordan Lee)"}
              onClick={async (e) => {
                if (me.canReport) return;
                e.preventDefault();
                await api("/api/demo/session", { body: { userId: "jordan" } });
                // A full load so every part of the page picks up the new demo account.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/admin/lessons");
              }}
              className={cx(
                "mr-1 inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-[0.95rem] font-semibold sm:px-4",
                inAdmin ? "border-action bg-tealtint text-ink" : "border-line-strong text-ink hover:bg-muted",
              )}
            >
              <Icon name="lock" className="size-4" />
              <span className="hidden sm:inline">Admin</span>
              <span className="sr-only sm:hidden">Admin</span>
            </Link>
          )}
          <SearchButton />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
