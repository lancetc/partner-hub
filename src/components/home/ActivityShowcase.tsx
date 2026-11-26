"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { FeaturedCard, ShowcaseCard, WorkTile } from "@/server/activityCatalogue";
import { Icon } from "../Icon";

/*
  “Practise the decisions you make every day” (docs/activity-catalogue-audit.md): the featured course first, large (two
  columns, one row tall, on a wide screen, like Lives in Progress's spotlight; ticked "Featured" in the course's settings),
  then the featured activities the person can open (four, or two beside a featured course: always one row), all visible at once (a row on wide screens, a stack on phones: no carousel), and one real tool for
  work, kept visibly apart from the fictional practice. The server has already removed anything unpublished, withdrawn
  or outside their audience. It records that each card was shown and which was opened: the activity, its version and
  the course, never anything typed inside it.
*/

type Event = { event: "shown_on_homepage" | "opened"; activity: string; surface: "home" | "work-tile"; ref?: string; revision?: string };
function send(e: Event) {
  try {
    const body = JSON.stringify(e);
    // A click leaves the page: keepalive lets the event finish on the way out.
    void fetch("/api/activities/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    // Analytics never gets in the learner's way.
  }
}

export function ActivityShowcase({ featured, cards, work }: { featured: FeaturedCard | null; cards: ShowcaseCard[]; work: WorkTile | null }) {
  const sent = useRef(false);
  // Shown once per visit to the page, after it's on screen (in an effect, never during render).
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (featured) send({ event: "shown_on_homepage", activity: featured.activity, surface: "home", ref: featured.slug, revision: featured.revision });
    for (const c of cards) send({ event: "shown_on_homepage", activity: c.activity, surface: "home", ref: c.slug, revision: c.revision });
    if (work) send({ event: "shown_on_homepage", activity: work.activity, surface: "work-tile" });
  }, [featured, cards, work]);
  if (!featured && !cards.length && !work) return null;
  return (
    <>
      {(featured || cards.length > 0) && (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {featured && (
            <li className="flex sm:col-span-2">
              <Link
                href={featured.href}
                onClick={() => send({ event: "opened", activity: featured.activity, surface: "home", ref: featured.slug, revision: featured.revision })}
                className="group flex w-full flex-col overflow-hidden rounded-3xl border-2 border-[#fab53d]/70 bg-surface shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action motion-reduce:transition-none xl:flex-row"
              >
                {/* Two cards wide and one tall (the owner, Nov 2026): on a wide screen the picture sits beside the words. */}
                <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[#007373] xl:aspect-auto xl:w-1/2">
                  {featured.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded course cover, sized by the frame
                    <img
                      src={featured.image}
                      alt=""
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  )}
                  <span aria-hidden className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#06223a]/45 to-transparent" />
                  <span className="absolute left-4 top-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fab53d] px-3 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43]">
                      <Icon name="star" className="size-3.5" /> Featured
                    </span>
                    <span className="rounded-full bg-white/90 px-3 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43]">
                      {featured.kind}
                      {featured.minutes ? ` · about ${featured.minutes} min` : ""}
                    </span>
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5 xl:p-6">
                  <p className="font-serif text-2xl font-semibold leading-snug">{featured.question}</p>
                  {featured.standfirst && featured.standfirst !== featured.question && (
                    <p className="line-clamp-4 text-sm leading-relaxed text-ink-muted">{featured.standfirst}</p>
                  )}
                  <p className="text-sm text-ink-muted">
                    {featured.title}. For {featured.audience}.
                  </p>
                  <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-action px-5 font-semibold text-on-action group-hover:bg-action-hover">
                    {featured.cta} <Icon name="arrow-right" className="size-4" />
                  </span>
                </div>
              </Link>
            </li>
          )}
          {cards.map((c) => (
            <li key={c.pick} className="flex">
              <Link
                href={c.href}
                onClick={() => send({ event: "opened", activity: c.activity, surface: "home", ref: c.slug, revision: c.revision })}
                className="group flex w-full flex-col overflow-hidden rounded-3xl border border-line bg-surface transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action motion-reduce:transition-none"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-[#007373]">
                  {c.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded course cover, sized by the frame
                    <img
                      src={c.image}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#102a43]">
                    {c.kind}
                    {c.minutes ? ` · about ${c.minutes} min` : ""}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="font-serif text-xl font-semibold leading-snug">{c.question}</p>
                  <p className="text-sm text-ink-muted">
                    {c.title}. For {c.audience}. A fictional case to practise on.
                  </p>
                  <span className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-full bg-action px-4 font-semibold text-on-action group-hover:bg-action-hover">
                    {c.cta} <Icon name="arrow-right" className="size-4" />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {work && (
        <Link
          href={work.href}
          onClick={() => send({ event: "opened", activity: work.activity, surface: "work-tile" })}
          className="group mt-5 flex items-start gap-4 rounded-3xl border-2 border-[#fab53d] bg-[#fab53d]/12 p-5 transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action motion-reduce:transition-none"
        >
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fab53d] text-[#102a43]">
            <Icon name={work.kind === "Calculator" ? "sliders" : "clipboard"} className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#8a5a00] dark:text-[#ffd48a]">
              Use it at work · {work.kind} · not a training exercise
            </span>
            <span className="mt-0.5 block font-serif text-xl font-semibold leading-snug group-hover:underline">{work.title}</span>
            <span className="mt-1 block text-ink-muted">{work.text}</span>
          </span>
          <span className="hidden min-h-11 shrink-0 items-center gap-1.5 self-center font-semibold text-accent sm:inline-flex">
            {work.cta} <Icon name="arrow-right" className="size-4" />
          </span>
        </Link>
      )}
    </>
  );
}
