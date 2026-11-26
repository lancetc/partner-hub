"use client";

import { useEffect, useState } from "react";
import { cx } from "@/lib/format";
import { Icon } from "./Icon";

/*
  The search, filters and sort on Topics, Discovery Paths and the Magazine, folded into a card that opens and closes
  like Your learning (the owner, Nov 2026). Closed, it says what's chosen (or what you can do) in a line; it opens by
  itself when the address already holds a search or filter, and otherwise remembers how each person left it.
*/

export function BrowsePanel({
  id,
  title,
  count,
  summary,
  active,
  startOpen,
  storageKey,
  children,
}: {
  /** The heading's id, for the section's aria-labelledby. */
  id: string;
  title: string;
  count: number;
  /** The closed line: what's chosen, or what the panel offers. */
  summary: string;
  /** A search or filter is on. */
  active: boolean;
  /** The address held a search or filter on arrival, so start open. */
  startOpen: boolean;
  storageKey: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(storageKey);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once, after hydration, from the address and their last choice
    if (startOpen || saved === "1") setOpen(true);
    // Only on arrival: later filter changes happen inside the open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(storageKey, open ? "0" : "1");
    } catch {}
  };
  const panelId = `${id}-panel`;

  return (
    <div className="rounded-3xl border border-line bg-surface">
      <h2 id={id} className="py-2 pl-2 pr-5 sm:pr-6">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full min-w-0 items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-muted sm:px-4"
        >
          <Icon name="chevron-down" className={cx("size-5 shrink-0 text-ink-muted transition-transform", !open && "-rotate-90")} />
          <span className="min-w-0">
            <span className="block font-serif text-xl font-semibold sm:text-2xl">
              {title} <span className="text-base font-normal text-ink-muted">({count})</span>
            </span>
            <span className={cx("block truncate font-sans text-sm font-normal", active ? "font-semibold text-accent" : "text-ink-muted")}>{summary}</span>
          </span>
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="px-5 pb-5 sm:px-6 sm:pb-6">
        {children}
      </div>
    </div>
  );
}
