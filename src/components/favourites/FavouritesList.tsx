"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import type { FavouriteItem, favouritesList } from "@/server/favourites";
import { Icon } from "../Icon";
import { aidEvent, eventKey } from "./favApi";

/*
  Favourites (docs/job-aids.md): a person's own saved Job Aids and highlighted passages. A way back to content.
  Pinned first, then most recently opened. Nothing recommended is mixed in, and nothing here says a person has
  finished or passed anything. Each item says where it stands against its source now.
*/

type Loaded = ReturnType<typeof favouritesList>;
const KINDS = [
  { key: "", label: "All" },
  { key: "job_aid", label: "Job Aids" },
  { key: "passage", label: "Highlights" },
] as const;
const TONE: Record<FavouriteItem["state"], string> = {
  current: "",
  moved: "bg-tealtint",
  updated: "bg-tealtint",
  changed: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  superseded: "bg-[#fff1cc] text-[#4a3400] dark:bg-[#3d2f08] dark:text-[#ffd97a]",
  unavailable: "bg-muted",
};
const STATE: Record<FavouriteItem["state"], string> = {
  current: "",
  moved: "Moved",
  updated: "Updated",
  changed: "Guidance changed",
  superseded: "Superseded",
  unavailable: "Unavailable",
};

export function FavouritesList() {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]["key"]>("");
  const loaded = useApi<Loaded>(`/api/favourites?${new URLSearchParams({ ...(asked && { q: asked }), ...(kind && { kind }) })}`);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState("");
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    aidEvent({ event: "favourites_opened" });
  }, []);
  // Search as they type, a moment after they stop.
  useEffect(() => {
    const t = window.setTimeout(() => setAsked(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const act = async (body: Record<string, unknown>) => {
    setError("");
    try {
      await api("/api/favourites", { body });
      loaded.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn’t work. Try again.");
    }
  };
  const d = loaded.data;
  const none = d && d.counts.all === 0;
  // Arrived from "Open in Favourites" on a marked passage (/favourites#fav-…): that item, in view and outlined, once.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !d) return;
    const el = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (!el) return;
    landed.current = true;
    el.setAttribute("data-fav-target", "");
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  }, [d]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 font-semibold">
          Search your Favourites
          <input
            type="search"
            className="min-h-12 w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg font-normal"
            placeholder="A word from the task, like “rate”"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div role="group" aria-label="Show" className="flex gap-1 rounded-full bg-muted p-1">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              aria-pressed={kind === k.key}
              onClick={() => setKind(k.key)}
              className={cx("min-h-11 rounded-full px-4 text-sm font-semibold", kind === k.key ? "bg-surface shadow-sm" : "text-ink-muted")}
            >
              {k.label}
              {d && <span className="ml-1 tabular-nums text-ink-muted">{k.key === "" ? d.counts.all : d.counts[k.key]}</span>}
            </button>
          ))}
        </div>
      </div>
      {(error || loaded.error) && (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error || loaded.error}
        </p>
      )}
      {!d ? (
        <p className="mt-6 text-ink-muted">Loading your Favourites…</p>
      ) : none ? (
        <div className="mt-6 rounded-3xl bg-muted p-6">
          <p className="text-lg font-semibold">Nothing saved yet.</p>
          <p className="mt-1 text-ink-muted">
            Save a Job Aid with <strong>Save to Favourites</strong>, or select a sentence in a Magazine guide, a Topic card or a news story and save that.
            They’ll be here, one tap away.
          </p>
          <Link href="/tools" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action">
            Browse Work Tools <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      ) : !d.items.length ? (
        <p className="mt-6 text-lg">Nothing in your Favourites matches that.</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {d.items.map((i) => (
            <li key={i.id} id={i.id} tabIndex={-1} className="scroll-mt-24 rounded-3xl border border-line bg-surface p-4 sm:p-5">
              <p className="flex flex-wrap items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                <Icon name={i.kind === "job_aid" ? "clipboard" : i.kind === "tool" ? "sliders" : "pen"} className="size-4" /> {i.label}
                {i.pinned && <span className="rounded-full bg-tealtint px-2 py-0.5 normal-case tracking-normal text-ink">Pinned</span>}
                {STATE[i.state] && <span className={cx("rounded-full px-2 py-0.5 normal-case tracking-normal", TONE[i.state])}>{STATE[i.state]}</span>}
              </p>
              <Link
                href={i.href}
                onClick={() => {
                  void api("/api/favourites", { body: { action: "opened", id: i.id, key: eventKey() } }).catch(() => undefined);
                  if (i.kind === "passage" && i.state !== "unavailable")
                    aidEvent({ event: "current_source_opened", sourceKind: "passage", place: "favourites" });
                }}
                className="mt-1 block min-h-11 font-serif text-xl font-semibold leading-snug transition-colors hover:text-[#007f7e] dark:hover:text-[#7fd6d2]"
              >
                {i.title}
              </Link>
              {i.detail && <p className="text-ink-muted">{i.detail}</p>}
              {i.quote && (
                <blockquote
                  className={cx(
                    "mt-2 border-l-4 pl-3",
                    i.state === "superseded" ? "border-line-strong text-ink-muted line-through decoration-1" : "border-teal",
                  )}
                >
                  “{i.quote}”
                </blockquote>
              )}
              {i.note && <p className={cx("mt-2 rounded-2xl px-3 py-2 text-sm", TONE[i.state] || "text-ink-muted")}>{i.note}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <Link
                  href={i.href}
                  onClick={() => void api("/api/favourites", { body: { action: "opened", id: i.id, key: eventKey() } }).catch(() => undefined)}
                  className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent underline underline-offset-2"
                >
                  {i.state === "unavailable"
                    ? "See what to use instead"
                    : i.kind === "passage"
                      ? "Open current guidance"
                      : i.kind === "tool"
                        ? "Open the tool"
                        : "Open the Job Aid"}{" "}
                  <Icon name="arrow-right" className="size-4" />
                </Link>
                <button
                  type="button"
                  className="min-h-11 font-semibold underline underline-offset-2"
                  onClick={() => void act({ action: "pin", id: i.id, on: !i.pinned })}
                >
                  {i.pinned ? "Unpin" : "Pin"}
                </button>
                {i.state !== "unavailable" && (
                  <button
                    type="button"
                    className="min-h-11 font-semibold underline underline-offset-2"
                    onClick={() => setRenaming({ id: i.id, title: i.title })}
                  >
                    Rename
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-11 font-semibold underline underline-offset-2"
                  onClick={async () => {
                    if (
                      await confirmAction(
                        i.kind === "passage"
                          ? "This highlight is removed from your Favourites. The guidance itself isn’t changed."
                          : "This Job Aid is removed from your Favourites. It stays in Work Tools.",
                        { confirmLabel: "Remove" },
                      )
                    )
                      void act({ action: "remove", id: i.id });
                  }}
                >
                  Remove
                </button>
              </div>
              {renaming?.id === i.id && (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await act({ action: "rename", id: i.id, title: renaming.title });
                    setRenaming(null);
                  }}
                >
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
                    A short label, to find it again. Not a client’s name or details.
                    <input
                      className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal"
                      maxLength={80}
                      value={renaming.title}
                      onChange={(e) => setRenaming({ id: i.id, title: e.target.value })}
                      autoFocus
                    />
                  </label>
                  <button className="min-h-11 rounded-full bg-action px-4 font-semibold text-on-action">Save</button>
                  <button type="button" className="min-h-11 px-2 font-semibold underline" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-ink-muted">
        Favourites are yours alone. They’re a way back to guidance, not a record that you’ve completed or been assessed on anything, and a saved passage is only
        current when it says so. Mentor notes you’ve kept are in your{" "}
        <Link href="/pocket-deck" className="font-semibold underline underline-offset-2">
          Pocket Deck
        </Link>
        .
      </p>
    </div>
  );
}

/** On the Hub home: the two or three most recent Favourites, and the way to all of them and to Work Tools. */
export function HomeFavourites() {
  const d = useApi<Loaded>("/api/favourites?limit=3").data;
  if (!d) return null;
  return (
    <section aria-labelledby="home-favourites" className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-favourites" className="flex items-center gap-2 font-serif text-2xl font-semibold">
          <Icon name="bookmark-filled" className="size-5 text-accent" /> Your Favourites
        </h2>
        <div className="flex flex-wrap gap-x-4 text-sm font-semibold">
          <Link href="/favourites" className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
            View all{d.counts.all > 0 && ` (${d.counts.all})`}
          </Link>
          <Link href="/tools" className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
            Work Tools
          </Link>
        </div>
      </div>
      {d.items.length ? (
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {d.items.map((i) => (
            <li key={i.id}>
              <Link href={i.href} className="flex h-full min-h-16 flex-col justify-center rounded-2xl bg-muted px-4 py-3 hover:ring-1 hover:ring-action">
                <span className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-accent">
                  {i.label}
                  {STATE[i.state] && ` · ${STATE[i.state]}`}
                </span>
                <span className="font-semibold leading-snug">{i.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-ink-muted">Save a Job Aid from Work Tools, or a sentence from a guide, and it’s here whenever you need it at work.</p>
      )}
    </section>
  );
}
