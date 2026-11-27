"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Story } from "@/content/stories";
import type { BriefItem, Edition, FeaturedReason, WeeklyQuestion } from "@/server/newsEdition";
import { api } from "@/lib/api";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "../Icon";

/*
  The pieces of the homepage news as a living edition (server/newsEdition, the owner, Nov 2026): the edition strip, the
  featured story's browser, News in Brief, From the archive, the weekly question and The Trilogy Briefing.
*/

const label = "font-mulish text-xs font-extrabold uppercase tracking-[0.16em]";

/** The edition strip: which edition, today's date, what's new since your last visit, and when the news last changed. */
export function EditionStrip({ edition }: { edition: Edition }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-strong py-2.5">
      <p className={cx(label, "text-ink")}>
        The Partner Hub <span aria-hidden>·</span> {edition.edition}
        <span className="ml-3 font-serif text-sm font-normal normal-case tracking-normal text-ink-muted italic">{edition.date}</span>
      </p>
      <p className="font-mulish text-sm text-ink-muted">
        <span className="font-semibold text-ink">{edition.since}</span>
        {edition.updated && (
          <>
            <span aria-hidden> · </span>
            {edition.updated}
          </>
        )}
      </p>
    </div>
  );
}

const REASON: Record<FeaturedReason, string | null> = {
  priority: "Priority announcement",
  feature: null,
  seasonal: "In season",
  role: "For your role",
  new: null,
  archive: "Worth revisiting",
};

/**
  The featured story, chosen for this person on arrival, with "Featured story · 01 / 03" to browse the others. It never
  moves by itself: the reader chooses when to look at the next one.
*/
export function FeaturedBrowser({
  items,
  render,
}: {
  items: { story: Story; reason: FeaturedReason }[];
  render: (story: Story, note: React.ReactNode) => React.ReactNode;
}) {
  const [i, setI] = useState(0);
  const cur = items[Math.min(i, items.length - 1)];
  if (!cur) return null;
  const n = items.length;
  const pad = (x: number) => String(x).padStart(2, "0");
  const note = (
    <div className="flex items-center justify-between gap-3">
      <p className={cx(label, "text-ink-muted")} aria-live="polite">
        Featured story{n > 1 && ` · ${pad(i + 1)} / ${pad(n)}`}
        {REASON[cur.reason] && (
          <span className="ml-2 rounded-full bg-[#fff1d6] px-2 py-0.5 text-[#6b4a12] normal-case tracking-normal">{REASON[cur.reason]}</span>
        )}
      </p>
      {n > 1 && (
        <span className="relative z-10 flex gap-1">
          <button
            type="button"
            onClick={() => setI((i - 1 + n) % n)}
            aria-label="Previous featured story"
            className="grid size-9 place-items-center rounded-full border border-line-strong hover:bg-[#e6f3f1]"
          >
            <Icon name="arrow-left" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setI((i + 1) % n)}
            aria-label="Next featured story"
            className="grid size-9 place-items-center rounded-full border border-line-strong hover:bg-[#e6f3f1]"
          >
            <Icon name="arrow-right" className="size-4" />
          </button>
        </span>
      )}
    </div>
  );
  return <>{render(cur.story, note)}</>;
}

/** News in Brief: the rest of the Hub, in items that take under 30 seconds. */
export function NewsInBrief({ items }: { items: BriefItem[] }) {
  if (!items.length) return null;
  return (
    <ol className="mt-3 divide-y divide-line-strong">
      {items.map((b) => (
        <li key={b.id} className="tile group relative py-3.5 first:pt-1">
          <p className={cx(label, "text-accent")}>
            {b.when} <span aria-hidden>·</span> <span className="text-ink-muted">{b.kind}</span>
          </p>
          <h4 className="mt-1 font-serif text-[1.08rem] font-bold leading-snug text-ink">
            <Link href={b.href} className="tile-link">
              {b.title}
            </Link>
          </h4>
          {b.text && <p className="mt-1 text-base leading-snug text-ink-muted">{b.text}</p>}
        </li>
      ))}
    </ol>
  );
}

/** From the archive: an older story worth revisiting, with its original date so it's never mistaken for new. */
export function FromTheArchive({ story }: { story: Story }) {
  return (
    <article data-cue={`story:${story.slug}`} className="tile group relative">
      <h4 className="font-serif text-[1.35rem] font-bold leading-tight text-ink">
        <Link href={`/news/${story.slug}`} className="tile-link">
          {story.title}
        </Link>
      </h4>
      <p className="mt-2 text-base leading-snug text-ink-muted">{story.dek}</p>
      <p className="mt-3 font-mulish text-sm text-ink-muted">First published {formatDate(story.date)}</p>
      <span className="mt-2 inline-flex items-center gap-1.5 font-semibold text-accent transition-colors group-hover:text-[#007f7e]">
        Read the story <Icon name="arrow-right" className="size-4" />
      </span>
    </article>
  );
}

/**
  The weekly question (the owner's design, Nov 2026): a tinted card under a dark rule, "The weekly question" with a
  small chart mark, the question, then one tap to answer. Once you have, how the community answered, most popular
  first, the leading answer in teal; the number of responses, and the way into the Community conversation.
*/
export function WeeklyQuestionCard({ initial, className }: { initial: WeeklyQuestion; className?: string }) {
  const [q, setQ] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function answer(optionId: string) {
    setBusy(true);
    setError(null);
    try {
      setQ(await api<WeeklyQuestion>("/api/news/question", { body: { questionId: q.id, optionId } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const counted = q.results
    ? q.options
        .map((o) => ({ ...o, count: q.results!.find((r) => r.id === o.id)?.count ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .map((o) => ({ ...o, pct: q.total ? Math.round((o.count / q.total) * 100) : 0 }))
    : [];
  const lead = counted[0]?.count ? counted[0].id : null;
  return (
    <section aria-labelledby={`wq-${q.id}`} className={cx("rounded-xl bg-tealtint px-5 pb-4 pt-0", className)}>
      <span aria-hidden className="-mx-5 block h-[3px] rounded-t-xl bg-ink" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-ink-muted">The weekly question</h2>
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 text-[#007f7e] dark:text-[#7fd6d2]" fill="currentColor">
          <rect x="1.5" y="7" width="3.2" height="7.5" rx="0.8" />
          <rect x="6.4" y="2" width="3.2" height="12.5" rx="0.8" />
          <rect x="11.3" y="5" width="3.2" height="9.5" rx="0.8" />
        </svg>
      </div>
      <p id={`wq-${q.id}`} className="mt-3 text-[1.35rem] font-bold leading-snug text-ink">
        {q.question}
      </p>
      {q.results ? (
        <>
          <p className="mt-3 text-base text-ink-muted">Here’s what our community is saying.</p>
          <ul className="mt-2 flex flex-col" aria-label="How people answered">
            {counted.map((o) => (
              <li key={o.id} className="py-2.5">
                <p className="flex items-baseline justify-between gap-3 text-[1.0625rem]">
                  <span className={cx("min-w-0", o.id === lead ? "font-semibold text-ink" : "text-ink")}>
                    {o.text}
                    {o.id === q.mine && <span className="ml-1.5 whitespace-nowrap font-mulish text-xs font-normal text-ink-muted">· Your answer</span>}
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-ink">{o.pct}%</span>
                </p>
                <div aria-hidden className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#10283f]/10 dark:bg-white/15">
                  <div className={cx("h-full rounded-full", o.id === lead ? "bg-[#007f7e]" : "bg-[#7d93a3]")} style={{ width: `${o.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#10283f]/15 pt-3 text-sm dark:border-white/15">
            <span className="text-ink-muted">
              {q.total} {q.total === 1 ? "response" : "responses"}
            </span>
            <button type="button" className="text-[#007f7e] hover:underline dark:text-[#7fd6d2]" onClick={() => setQ({ ...q, results: null })}>
              Change my answer
            </button>
          </div>
        </>
      ) : (
        <div role="group" aria-label={q.question} className="mt-4 flex flex-col gap-2">
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={busy}
              onClick={() => void answer(o.id)}
              className={cx(
                "min-h-11 rounded-xl border px-3 py-2 text-left text-base transition-colors hover:border-[#007f7e] hover:bg-[#e6f3f1] disabled:opacity-60",
                o.id === q.mine ? "border-[#007f7e] bg-[#e6f3f1] font-semibold" : "border-line-strong bg-surface/70",
              )}
            >
              {o.text}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-danger">{error}</p>}
      <Link href="/community" className="mt-1 flex min-h-11 items-center justify-between gap-3 font-semibold text-ink transition-colors hover:text-[#007f7e]">
        Continue the conversation <Icon name="arrow-right" className="size-4" />
      </Link>
    </section>
  );
}

/** Opening a story tells the homepage it's been read, so it stops featuring it to this person. */
export function MarkStoryRead({ slug }: { slug: string }) {
  useEffect(() => {
    void api("/api/news/read", { body: { slug } }).catch(() => {});
  }, [slug]);
  return null;
}
