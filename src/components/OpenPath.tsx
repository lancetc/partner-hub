"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { whoPhotoFor } from "@/lib/pathPhoto";
import { cx, formatDuration } from "@/lib/format";
import { readOpen, syncOpen } from "@/lib/openProgress";
import { useHydrated } from "@/lib/store";
import { Icon } from "./Icon";

export type OpenPathData = {
  token: string;
  name: string;
  description: string;
  inOrder: boolean;
  whoFor: string;
  whoPhoto: string;
  outcomes: string[];
  minutes: number;
  topics: { slug: string; title: string; summary: string; minutes: number }[];
};

/*
  A learning path opened from its public link or QR code, without signing in. The ticks are kept on
  this device only; the hub just counts, anonymously, that the path was opened and finished.
*/
export function OpenPath({ path: p }: { path: OpenPathData }) {
  const slugs = p.topics.map((t) => t.slug);
  // Read after the page loads: the server can't see this device's ticks.
  const hydrated = useHydrated();
  const [synced, setSynced] = useState<string[] | null>(null);
  const done = synced ?? (hydrated ? readOpen(p.token).done : null);
  useEffect(() => {
    syncOpen(p.token, slugs).then((s) => setSynced(s.done));
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.token]);

  const finished = done ? p.topics.filter((t) => done.includes(t.slug)).length : 0;
  const allDone = finished === p.topics.length && p.topics.length > 0;
  const next = done ? p.topics.find((t) => !done.includes(t.slug)) : p.topics[0];
  const href = (slug: string) => `/open/${p.token}/${encodeURIComponent(slug)}`;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Learning path</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight sm:text-4xl">{p.name}</h1>
      {p.description && <p className="mt-3 text-lg text-ink-muted">{p.description}</p>}

      <ul className="mt-5 grid gap-2 sm:grid-cols-2">
        <li className="flex items-start gap-3 rounded-2xl bg-muted p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
            <Icon name="clock" className="size-4" />
          </span>
          <span>
            <span className="block font-semibold leading-snug">{formatDuration(p.minutes)}</span>
            <span className="block text-sm text-ink-muted">in total, at your own pace</span>
          </span>
        </li>
        <li className="flex items-start gap-3 rounded-2xl bg-muted p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-accent">
            <Icon name="list" className="size-4" />
          </span>
          <span>
            <span className="block font-semibold leading-snug">
              {p.topics.length} short {p.topics.length === 1 ? "topic" : "topics"}
            </span>
            <span className="block text-sm text-ink-muted">{p.inOrder ? "taken in order" : "in any order"}</span>
          </span>
        </li>
      </ul>

      {p.whoFor && (
        // Fixed brand colours, so the panel looks the same in light and dark mode.
        <section className="relative isolate mt-5 overflow-hidden rounded-3xl bg-[#2d4875] p-5 text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={whoPhotoFor(p.whoPhoto)} alt="" aria-hidden className="absolute inset-0 -z-20 size-full scale-[1.06] object-cover" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,rgb(16_42_67/0.05)_0%,rgb(16_42_67/0.35)_45%,rgb(16_42_67/0.75)_100%)]"
          />
          <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#ffc72c]">Who it’s for</h2>
          <p className="mt-1.5 leading-relaxed text-white/90">{p.whoFor}</p>
        </section>
      )}

      {p.outcomes.length > 0 && (
        <section className="mt-5">
          <h2 className="font-serif text-xl font-semibold">What you’ll be able to do</h2>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {p.outcomes.map((o) => (
              <li key={o} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tealtint text-accent">
                  <Icon name="check" className="size-3.5" />
                </span>
                <span className="leading-snug">{o}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-5 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-ink-muted">
        <Icon name="info" className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          No account or sign in needed, and nothing about you is recorded. This phone or computer remembers which topics you’ve finished, so you can stop and
          come back here any time.
        </span>
      </p>

      {allDone ? (
        <div role="status" className="mt-6 rounded-3xl bg-[#DDE8D9] p-5 text-[#102a43]">
          <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em]">
            <Icon name="circle-check" className="size-4" /> Completed
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold leading-snug">You’ve finished {p.name}. Well done!</p>
          <p className="mt-1">You can go back to any topic whenever you like.</p>
        </div>
      ) : (
        next && (
          <Link
            href={href(next.slug)}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-action px-6 text-lg font-semibold text-on-action hover:bg-action-hover sm:w-auto"
          >
            {finished ? "Continue" : "Start"}: {next.title} <Icon name="arrow-right" className="size-5" />
          </Link>
        )
      )}

      <div className="mt-8 flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold">Topics</h2>
        {done && (
          <p className="text-sm text-ink-muted">
            {finished} of {p.topics.length} done
          </p>
        )}
      </div>
      <ol className="mt-3 flex flex-col gap-3">
        {p.topics.map((t, i) => {
          const isDone = Boolean(done?.includes(t.slug));
          // In order: a topic opens once the one before it is done (on this device).
          const locked = p.inOrder && Boolean(done) && i > 0 && !done!.includes(p.topics[i - 1].slug) && !isDone;
          return (
            <li
              key={t.slug}
              className={cx("relative flex items-start gap-4 rounded-2xl border border-line bg-surface p-4", !locked && "hover:border-line-strong")}
            >
              <span
                className={cx(
                  "grid size-9 shrink-0 place-items-center rounded-full font-mulish text-sm font-bold",
                  isDone ? "bg-accent text-on-action" : "bg-muted",
                )}
              >
                {isDone ? <Icon name="check" className="size-4" /> : i + 1}
                {isDone && <span className="sr-only">Done:</span>}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-serif text-xl font-semibold leading-snug">
                  {locked ? (
                    t.title
                  ) : (
                    <Link href={href(t.slug)} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                      {t.title}
                    </Link>
                  )}
                </h3>
                {t.summary && <p className="mt-1 text-sm text-ink-muted">{t.summary}</p>}
                <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-muted">
                  <span>{t.minutes} min</span>
                  {locked && (
                    <span className="inline-flex items-center gap-1">
                      <Icon name="lock" className="size-3.5" /> Opens after the topic before
                    </span>
                  )}
                </p>
              </div>
              {!locked && <Icon name={isDone ? "refresh" : "arrow-right"} className="mt-2 size-5 shrink-0 text-accent" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A public link that's been switched off, or a topic that's no longer part of the path. */
export function LinkOff() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-serif text-3xl font-semibold">This link isn’t active</h1>
      <p className="mt-3 text-ink-muted">The learning path may have been taken down. Ask the person who gave you the link or QR code for a new one.</p>
    </div>
  );
}
