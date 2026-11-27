"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { glanceScript, type GlancePoint, type PracticeItem } from "@/lib/storyGlance";
import type { NarrationAudio } from "@/lib/magazine";
import { Icon } from "../Icon";
import { IntroPlayer } from "../magazine/IntroPlayer";

/*
  A news story's "At a glance" and "Put it into practice" (the owner, Nov 2026; lib/storyGlance). Editorial, not a
  course: one quiet tinted panel of takeaways under the hero, and at the end of the story a short list of optional ideas
  to try, which a reader can tick off for themselves if the author has turned the checklist on.
*/

/**
  The takeaways (the owner's design, Nov 2026): a short teal rule, "The essentials" and the heading,
  then numbered rows, each a short bold title and a line under it, ruled between. When there's an approved reading, a
  Play under them that never starts by itself.
*/
export function AtAGlance({ points, audio, className }: { points: GlancePoint[]; audio?: NarrationAudio | null; className?: string }) {
  return (
    <section aria-labelledby="glance-h" className={cx("rounded-2xl bg-tealtint px-5 pb-2 pt-5 sm:px-7 sm:pt-6", className)}>
      <span aria-hidden className="block h-[3px] w-12 rounded-full bg-[#007f7e] dark:bg-[#7fd6d2]" />
      {/* No reading time (the owner, Nov 2026). */}
      <div className="mt-3">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#007f7e] dark:text-[#7fd6d2]">The essentials</p>
        <h2 id="glance-h" className="mt-1 font-serif text-2xl font-semibold leading-tight text-ink">
          At a glance
        </h2>
      </div>
      <ol className="mt-2 divide-y divide-[#007f7e]/20 dark:divide-[#7fd6d2]/20">
        {points.map((p, i) => (
          <li key={i} className="flex gap-4 py-4">
            <span aria-hidden className="w-7 shrink-0 font-mulish text-lg leading-snug tabular-nums text-ink-muted/70">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 text-[1.0625rem] leading-relaxed">
              {p.title ? (
                <>
                  <p className="font-semibold leading-snug text-ink">{p.title}</p>
                  <p className="mt-1 text-ink-muted">{p.text}</p>
                </>
              ) : (
                <p className="text-ink">{p.text}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {audio && (
        <div className="border-t border-[#007f7e]/20 py-4 dark:border-[#7fd6d2]/20">
          <IntroPlayer quiet script={glanceScript(points)} audio={audio} label="Listen to the summary" className="mt-0" onEvent={() => {}} />
        </div>
      )}
    </section>
  );
}

/**
  Ideas to try after reading. None is required. With the checklist on, each can be ticked off; ticks are kept for this
  person only (server/storyGlance). In an author's preview nothing is saved.
*/
export function PutIntoPractice({
  slug,
  items,
  checklist,
  initialTicked,
  policy,
  preview = false,
  className,
}: {
  slug: string;
  items: PracticeItem[];
  checklist: boolean;
  initialTicked: string[];
  policy?: boolean;
  preview?: boolean;
  className?: string;
}) {
  const [ticked, setTicked] = useState(new Set(initialTicked));
  const [error, setError] = useState<string | null>(null);
  async function toggle(id: string, done: boolean) {
    const before = ticked;
    setTicked(new Set(done ? [...ticked, id] : [...ticked].filter((x) => x !== id)));
    setError(null);
    if (preview) return;
    try {
      const r = await api<{ ticked: string[] }>("/api/news/practice", { body: { slug, itemId: id, done } });
      setTicked(new Set(r.ticked));
    } catch (e) {
      setTicked(before);
      setError((e as Error).message);
    }
  }
  const count = items.filter((i) => ticked.has(i.id)).length;
  return (
    <section aria-labelledby="practice-h" className={cx("border-t-2 border-[#007f7e] pt-5 dark:border-[#7fd6d2]", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="practice-h" className="font-serif text-2xl font-semibold leading-tight text-ink">
          Put it into practice
        </h2>
        {checklist && (
          <p className="font-mulish text-sm text-ink-muted" aria-live="polite">
            {count ? `${count} of ${items.length} tried` : "Tick off what you try"}
          </p>
        )}
      </div>
      <p className="mt-1 text-base text-ink-muted">
        {policy
          ? "Reminders to help you act on this update. They don’t replace the approved policy or your usual sign-off."
          : "A few ideas to try in your own work. None of them is required."}
      </p>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((it) => {
          const done = ticked.has(it.id);
          return (
            <li key={it.id} className="flex gap-3 text-[1.0625rem] leading-relaxed">
              {checklist ? (
                <input
                  type="checkbox"
                  id={`try-${it.id}`}
                  checked={done}
                  onChange={(e) => void toggle(it.id, e.target.checked)}
                  className="mt-1 size-5 shrink-0 accent-[#007f7e]"
                />
              ) : (
                <Icon name="arrow-right" className="mt-1.5 size-4 shrink-0 text-[#007f7e] dark:text-[#7fd6d2]" />
              )}
              <span className="min-w-0">
                {checklist ? (
                  <label htmlFor={`try-${it.id}`} className={cx("cursor-pointer", done && "text-ink-muted")}>
                    {it.text}
                  </label>
                ) : (
                  it.text
                )}
                {it.href && (
                  <Link href={it.href} className="rich-link ml-1 inline-flex items-center gap-1 text-base">
                    {it.label || "Open"} <Icon name="arrow-right" className="size-3.5" />
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
    </section>
  );
}
