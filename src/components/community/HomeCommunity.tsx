"use client";

import Link from "next/link";
import { useHydrated } from "@/lib/store";
import { ago, avatarColour, COMMUNITY_SIZE, events, initials, memberById, members, posts, spaces } from "@/content/community";
import { Icon } from "../Icon";

/*
  On the homepage: the Community, featured. What people are talking about right now, the next
  event, who's online, and a way in. The posts and people are demonstration content.
*/

/** A date some days from today, worked out in the browser (on the server "today" would be fixed at build time). */
function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export function HomeCommunity() {
  const hydrated = useHydrated();
  const latest = [...posts].filter((p) => !p.pinned).sort((a, b) => a.hoursAgo - b.hoursAgo).slice(0, 3);
  const next = events[0];
  const online = members.filter((m) => m.online);

  return (
    <section aria-labelledby="home-community" className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* The invitation. */}
        <div className="relative flex flex-col gap-4 overflow-hidden bg-[#008282] p-6 text-white sm:p-7">
          <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMaxYMax slice" viewBox="0 0 360 300">
            <circle cx="330" cy="40" r="90" fill="#3cb8b9" opacity="0.35" />
            <circle cx="300" cy="300" r="60" fill="#fab53d" opacity="0.3" />
            <circle cx="20" cy="300" r="34" fill="#c7393e" opacity="0.3" />
          </svg>
          <div className="relative">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#bdeeee]">New · Community</p>
            <h2 id="home-community" className="mt-1 font-serif text-3xl font-semibold leading-tight">
              Learn from each other
            </h2>
            <p className="mt-2 text-white/90">
              Ask a question, share a win, find someone who’s been there. {COMMUNITY_SIZE.toLocaleString("en-AU")} Care Partners and coordinators, all in one
              place.
            </p>
          </div>
          <div className="relative flex items-center gap-3">
            <span className="flex -space-x-2" aria-hidden>
              {online.map((m) => (
                <span
                  key={m.id}
                  className="grid size-9 place-items-center rounded-full font-mulish text-xs font-extrabold text-white ring-2 ring-[#008282]"
                  style={{ background: avatarColour(m.id) }}
                >
                  {initials(m.name)}
                </span>
              ))}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="size-2.5 rounded-full bg-[#7ef0a6]" aria-hidden /> {online.length} online now
            </span>
          </div>
          <div className="relative mt-auto flex flex-wrap gap-2">
            <Link
              href="/community"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-5 font-semibold text-[#004f4f] hover:bg-[#e3f5f5]"
            >
              Join the conversation <Icon name="arrow-right" className="size-4" />
            </Link>
            <Link href="/community#events" className="inline-flex min-h-11 items-center rounded-full px-4 font-semibold text-white ring-1 ring-white/60 hover:bg-white/10">
              Events
            </Link>
          </div>
        </div>

        {/* What people are talking about. */}
        <div className="flex min-w-0 flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Talking about now</h3>
            <Link href="/community" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
              See all <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
          <ul className="flex flex-col">
            {latest.map((p, i) => {
              const author = memberById(p.authorId)!;
              const space = spaces.find((s) => s.id === p.space)!;
              return (
                <li key={p.id} className={i > 0 ? "border-t border-line" : undefined}>
                  <Link href="/community" className="group flex gap-3 rounded-xl py-3 sm:px-2 hover:bg-muted">
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-full font-mulish text-xs font-extrabold text-white"
                      style={{ background: avatarColour(author.id) }}
                      aria-hidden
                    >
                      {initials(author.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug group-hover:underline">{p.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-ink-muted">
                        {author.name} · {author.role} · {space.emoji} {space.name}
                      </span>
                    </span>
                    <span className="hidden shrink-0 flex-col items-end gap-0.5 text-xs text-ink-muted sm:flex">
                      <span>{ago(p.hoursAgo)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="heart" className="size-3.5" /> {p.likes}
                        <Icon name="chat" className="ml-1.5 size-3.5" /> {p.comments.length}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/community#events"
            className="mt-2 flex items-center gap-3 rounded-2xl bg-[#fff1d6] px-4 py-3 text-[#4a2e00] hover:ring-1 hover:ring-[#fab53d]"
          >
            <Icon name="calendar" className="size-5 shrink-0 text-[#b8772a]" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">Next up: {next.title}</span>
              <span className="block text-[#6b4a12]">
                {hydrated ? inDays(next.inDays).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }) : "Soon"} · {next.going} going
              </span>
            </span>
            <Icon name="arrow-right" className="size-4 shrink-0" />
          </Link>
        </div>
      </div>
    </section>
  );
}
