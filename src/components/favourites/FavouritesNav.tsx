"use client";

import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { openCompanion } from "../pocket/pocketApi";

/*
  The way to Favourites from anywhere in the Hub (docs/job-aids.md): a labelled action in the header on a desktop,
  and a labelled cell that stays put at the end of the bottom bar on a phone or tablet. One action, always
  visible, never only an icon and never only in the profile menu.

  It opens the Companion Drawer (docs/pocket-playbook.md): Pinned, Recent, Search Work Tools and Favourites in one
  place, over the page the person is on. The owner removed the separate Work Tools header item because Favourites
  covers it, so this one control is the way into both. The full list is "All Favourites" inside it (/favourites).
*/
export function FavouritesHeaderLink() {
  const active = usePathname().startsWith("/favourites");
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="Favourites and Work Tools"
      onClick={(e) => openCompanion(e.currentTarget)}
      className={cx(
        "hidden min-h-11 items-center gap-2 rounded-full border px-3 text-base font-semibold lg:inline-flex xl:px-4",
        active ? "border-action bg-tealtint text-ink" : "border-line-strong text-ink hover:bg-muted",
      )}
    >
      <Icon name={active ? "bookmark-filled" : "bookmark"} className="size-4" /> Favourites
    </button>
  );
}

export function FavouritesBottomLink() {
  const active = usePathname().startsWith("/favourites");
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label="Favourites and Work Tools"
      onClick={(e) => openCompanion(e.currentTarget)}
      className={cx(
        "relative flex min-h-16 w-[4.4rem] shrink-0 flex-col items-center justify-center gap-1 border-l border-line px-1 text-xs font-semibold",
        active ? "text-action" : "text-ink",
      )}
    >
      <span className={cx("rounded-full px-3 py-1", active ? "bg-tealtint" : "bg-muted")}>
        <Icon name={active ? "bookmark-filled" : "bookmark"} className="size-5" />
      </span>
      <span className="whitespace-nowrap text-center text-xs leading-tight tracking-tight">Favourites</span>
    </button>
  );
}
