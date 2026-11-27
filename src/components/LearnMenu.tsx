"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { inLearn, isActive, learnItems } from "./nav";
import { cx } from "@/lib/format";

/*
  Learn, in the main menu: one place for the ways to learn (nav.ts, learnItems), each with an icon, its name and a
  line on how you learn there, so the menu stays short and still explains itself.

  - In the header (LearnMenu), a button that opens a panel under it, solid rather than frosted (a frosted panel
    inside the frosted header can't blur the page behind it). It's a disclosure, not an app-style menu: the
    panel's links follow the button for Tab, Escape closes it and puts focus back on the button, and a click
    anywhere else or going to another page closes it.
  - On phones (LearnSheet), the bottom bar's Learn button opens the same list as a sheet from the bottom, as a
    modal dialog, so focus stays in it until it's closed.
*/

/** Topics' picture: a phone with a lesson on its screen, drawn to sit with the emoji on the other tiles (Windows draws the phone emoji as a tablet). */
function PhoneArt() {
  // Its own ids: the menu and the phone sheet are both on the page, and a shared id can point into the hidden one.
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 28 44" className="h-[1.15em] w-auto drop-shadow-sm" aria-hidden>
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3d4f7a" />
          <stop offset="1" stopColor="#1b2540" />
        </linearGradient>
        <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5fd0cf" />
          <stop offset="1" stopColor="#008282" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="26" height="42" rx="6" fill={`url(#${id}-body)`} />
      <rect x="3.5" y="5" width="21" height="33" rx="3" fill={`url(#${id}-screen)`} />
      <rect x="11" y="2.4" width="6" height="1.4" rx="0.7" fill="#0e1528" />
      <rect x="6.5" y="9" width="15" height="9" rx="1.5" fill="#ffffff" fillOpacity="0.85" />
      <rect x="6.5" y="21" width="12" height="2" rx="1" fill="#ffffff" fillOpacity="0.9" />
      <rect x="6.5" y="25" width="15" height="1.6" rx="0.8" fill="#ffffff" fillOpacity="0.6" />
      <rect x="6.5" y="28.5" width="10" height="1.6" rx="0.8" fill="#ffffff" fillOpacity="0.6" />
      <rect x="6.5" y="32.5" width="15" height="3" rx="1.5" fill="#fab53d" />
      <rect x="11" y="40" width="6" height="1.2" rx="0.6" fill="#ffffff" fillOpacity="0.4" />
    </svg>
  );
}

/** Each way to learn: its picture on a coloured tile, its name and tagline, and a chevron. The longer description is read out. */
function LearnLinks({ pathname, onPick, compact }: { pathname: string; onPick: () => void; compact?: boolean }) {
  return (
    <ul className={cx("grid", compact ? "gap-1" : "gap-x-4 gap-y-2 sm:grid-cols-2")}>
      {learnItems.map((item, i) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href} className="learn-item-in" style={{ "--i": i } as React.CSSProperties}>
            <Link
              href={item.href}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              aria-describedby={`learn-desc-${item.label.replace(/\s+/g, "-")}`}
              className={cx(
                "group flex items-center gap-4 rounded-2xl p-2 transition-colors",
                active ? "bg-tealtint dark:bg-white/10" : "hover:bg-muted dark:hover:bg-white/5",
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "grid shrink-0 place-items-center rounded-2xl transition-transform motion-safe:group-hover:scale-[1.03]",
                  compact ? "h-14 w-20 text-2xl" : "h-[4.5rem] w-24 text-3xl",
                  item.tile,
                )}
              >
                {item.emoji === "phone" ? <PhoneArt /> : item.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block font-semibold text-ink", compact ? "text-base" : "text-lg")}>{item.label}</span>
                <span className="mt-0.5 block truncate text-ink-muted">{item.tagline}</span>
                <span id={`learn-desc-${item.label.replace(/\s+/g, "-")}`} className="sr-only">
                  {item.description}
                </span>
              </span>
              <Icon name="chevron-down" className="size-5 shrink-0 -rotate-90 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The heading over the list, with Explore all: My Discovery, where the Hub suggests what to learn from everything. */
function LearnHeading({ onPick, id }: { onPick: () => void; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1">
      <h2 id={id} className="whitespace-nowrap font-mulish text-lg font-extrabold uppercase tracking-[0.02em] text-ink sm:text-xl">
        Ways to learn
      </h2>
      <Link
        href="/discovery"
        onClick={onPick}
        className="inline-flex items-center gap-1 whitespace-nowrap text-sm text-ink-muted sm:text-base hover:text-ink hover:underline"
      >
        Explore all
        <Icon name="external" className="size-4" />
      </Link>
    </div>
  );
}

/** The Learn button and its panel, in the header's menu (laptop width and up). */
export function LearnMenu({ itemClassName }: { itemClassName: (active: boolean) => string }) {
  const pathname = usePathname();
  // Open for the page it was opened on, so going to another page closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();
  const wrap = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <li
      ref={wrap}
      className="relative"
      // Tabbing out past the last link closes it.
      onBlur={(e) => {
        if (open && !wrap.current?.contains(e.relatedTarget as Node | null)) setOpenOn(null);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        className={cx(itemClassName(inLearn(pathname) || open), "gap-1")}
      >
        Learn
        <Icon name="chevron-down" className={cx("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="learn-panel-in absolute left-0 top-full z-50 mt-2 w-[min(52rem,calc(100vw-2rem))] rounded-3xl border border-line bg-white p-4 shadow-xl dark:bg-[#284170]"
      >
        <LearnHeading onPick={() => setOpenOn(null)} />
        <LearnLinks pathname={pathname} onPick={() => setOpenOn(null)} />
      </div>
    </li>
  );
}

/** The Learn button in the phone's bottom bar, and the sheet it opens. */
export function LearnSheet({ buttonClassName, iconClassName }: { buttonClassName: (active: boolean) => string; iconClassName: (active: boolean) => string }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const active = inLearn(pathname);
  const close = () => dialog.current?.close();

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()} className={buttonClassName(active)}>
        <span className={iconClassName(active)}>
          <Icon name="bulb" className="size-5" />
        </span>
        <span className="whitespace-nowrap text-center text-xs leading-tight tracking-tight">Learn</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        // A tap on the dimmed page around the sheet closes it.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="learn-sheet m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl border-t border-line bg-surface p-0 text-ink backdrop:bg-black/40"
      >
        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-1">
            <div className="flex-1">
              <LearnHeading onPick={close} id={titleId} />
            </div>
            <button type="button" onClick={close} className="-mt-2 grid size-11 place-items-center rounded-full hover:bg-muted" aria-label="Close">
              <Icon name="close" className="size-5" />
            </button>
          </div>
          <LearnLinks pathname={pathname} onPick={close} compact />
        </div>
      </dialog>
    </>
  );
}

/** A way to learn's picture on its coloured tile, as in the Learn menu: for the end of that page's heading line. */
const PAGE_TILES: Record<string, { emoji: string; tile: string }> = {
  "/community": { emoji: "🤝", tile: "bg-[#dff3ec] dark:bg-[#1f4a3c]" },
  "/resources": { emoji: "📚", tile: "bg-[#e4ebf7] dark:bg-[#2a3a5e]" },
};

export function LearnTile({ href, className }: { href: string; className?: string }) {
  const item = learnItems.find((x) => x.href === href) ?? PAGE_TILES[href];
  if (!item) return null;
  return (
    <span aria-hidden className={cx("grid h-14 w-20 shrink-0 place-items-center rounded-2xl text-3xl shadow-sm sm:h-[4.5rem] sm:w-24", item.tile, className)}>
      {item.emoji === "phone" ? <PhoneArt /> : item.emoji}
    </span>
  );
}
