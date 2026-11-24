"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerItems, isActiveInBar } from "./nav";
import { NavPending } from "./NavPending";
import { ThemeToggle } from "./ThemeToggle";
import { SearchButton } from "./SearchDialog";
import { AccountMenu } from "./AccountMenu";
import { InboxButton } from "./InboxButton";
import { FavouritesHeaderLink } from "./favourites/FavouritesNav";
import { CompanionDrawer } from "./pocket/CompanionDrawer";
import { Icon } from "./Icon";
import { LearnMenu } from "./LearnMenu";
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

/** A main menu item: the current section and hover are solid white over the glass header; dark mode keeps its own shades, so the light text stays readable. */
const navItemClass = (active: boolean) =>
  cx(
    "relative inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 text-[0.95rem] font-medium transition-colors lg:max-xl:px-2 xl:px-4",
    active ? "bg-white text-ink dark:bg-tealtint" : "text-ink-muted hover:bg-white hover:text-ink dark:hover:bg-muted",
  );

export function Header() {
  const pathname = usePathname();
  const me = useApi<Me>("/api/me").data;
  const inAdmin = pathname.startsWith("/admin");
  // The sign-in page has its own logo and nothing to navigate to yet.
  if (pathname === "/login") return null;
  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" translate="no" className="flex shrink-0 items-center gap-2 rounded-lg sm:gap-3" aria-label="Trilogy Care Partner Hub home">
          {/* The smaller logo on small laptops (1024 to 1279px), where the menu and the buttons only just fit. */}
          <Logo className="h-8 w-auto shrink-0 sm:h-10 lg:max-xl:h-8" />
          {/*
            "Partner Hub" beside the logo only on tablets, where there's no menu next to it. From laptop width up the
            menu, Admin, Favourites and the buttons need the whole row (the header never gets wider than 1280px), so
            the logo stands alone; on phones the buttons need the room.
          */}
          <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block lg:hidden" />
          <span className="sr-only whitespace-nowrap font-mulish text-sm font-bold tracking-wide text-ink-muted sm:not-sr-only lg:sr-only">Partner Hub</span>
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden lg:block xl:ml-6">
          <ul className="flex items-center gap-1">
            {/* Learn opens the ways to learn (LearnMenu); then the Community and Resources (Work Tools pages light up Resources). */}
            <LearnMenu itemClassName={navItemClass} />
            {/* No News item up here: the logo goes to the homepage, which is the news. */}
            {headerItems.map((item) => {
              const active = isActiveInBar(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={active ? "page" : undefined} className={navItemClass(active)}>
                    {item.short ? (
                      // The short label on smaller laptops, where the full row doesn't fit.
                      <>
                        <span className="xl:hidden">{item.short}</span>
                        <span className="hidden xl:inline">{item.label}</span>
                      </>
                    ) : (
                      item.label
                    )}
                    <NavPending className="inset-x-3 bottom-1" />
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
                "mr-1 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border px-3 text-[0.95rem] font-semibold sm:px-4 lg:max-xl:px-3",
                inAdmin ? "border-action bg-tealtint text-ink" : "border-line-strong text-ink hover:bg-muted",
              )}
            >
              <Icon name="lock" className="size-4" />
              {/* Named on screen except on phones and small laptops, where the row needs the room; always named for a screen reader. */}
              <span className="hidden sm:inline lg:max-xl:hidden">Admin</span>
              <span className="sr-only sm:hidden lg:max-xl:inline">Admin</span>
            </Link>
          )}
          {me && <FavouritesHeaderLink />}
          {/* The Companion Drawer the Favourites control opens, here and from the phone bar (docs/pocket-playbook.md). */}
          {me && <CompanionDrawer />}
          <SearchButton />
          {me && <InboxButton />}
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}
