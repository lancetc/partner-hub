"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import type { FavouriteItem } from "@/server/favourites";
import { Icon } from "../Icon";
import { eventKey } from "./favApi";
import { favouritesChanged } from "./SavedMarks";

/*
  Shown at the top of a guide or a Job Aid opened from Favourites (docs/job-aids.md): the passage the person
  saved, where it stands against what they're now reading, and the way back. An old quote is never shown here
  without saying it's old, and never at all when its source has been withdrawn or closed to them.
*/
export function FavouriteBanner({ className }: { className?: string }) {
  const [item, setItem] = useState<FavouriteItem | null>(null);
  const [from, setFrom] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("fav");
    // Read after the page has drawn: who came from Favourites is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrom(Boolean(id) || q.get("from") === "favourites");
    if (!id) return;
    // The part of the page the passage is in: brought into view and outlined, whichever way the page was reached.
    const at = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (at) {
      at.setAttribute("data-fav-target", "");
      at.scrollIntoView({ block: "center" });
    }
    api<FavouriteItem>(`/api/favourites?id=${encodeURIComponent(id)}`)
      .then((i) => {
        setItem(i);
        void api("/api/favourites", { body: { action: "opened", id, key: eventKey() } }).catch(() => undefined);
      })
      .catch(() => setItem(null));
  }, []);
  if (!from) return null;
  const warn = item && (item.state === "changed" || item.state === "superseded");
  return (
    <aside aria-label="From your Favourites" className={cx("rounded-3xl border border-line-strong bg-surface p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
          <Icon name="bookmark-filled" className="size-4" /> From your Favourites
        </p>
        <Link href="/favourites" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2">
          <Icon name="arrow-left" className="size-4" /> Back to Favourites
        </Link>
      </div>
      {item?.kind === "passage" && (
        <>
          {item.quote && (
            <blockquote
              className={cx(
                "mt-1 border-l-4 pl-3 text-lg",
                item.state === "superseded" ? "border-line-strong text-ink-muted line-through decoration-1" : "border-teal",
              )}
            >
              “{item.quote}”
            </blockquote>
          )}
          {(item.note || item.state === "current") && (
            <p
              className={cx(
                "mt-2 rounded-2xl px-3 py-2 text-sm",
                warn && !checked ? "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]" : "text-ink-muted",
              )}
              role="status"
            >
              {checked ? "Checked against the current version." : item.note || "This is the current version, and your passage is in it."}
            </p>
          )}
          {item.state === "changed" && !checked && (
            <button
              type="button"
              className="mt-2 inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
              onClick={async () => {
                await api("/api/favourites", { body: { action: "checked", id: item.id } }).catch(() => undefined);
                setChecked(true);
                // Checked: the passage is marked on the page again (SavedMarks).
                favouritesChanged();
              }}
            >
              I’ve checked the current passage
            </button>
          )}
        </>
      )}
    </aside>
  );
}
