"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { Portrait, useDigitalMemberModal } from "./DigitalMemberProfile";
import { MemberChatButton } from "./MemberChat";
import type { DigitalMemberCard } from "@/server/digitalMembers";
import type { DIGITAL_GROUPS } from "@/content/digitalMembers";
import { Icon } from "../Icon";
import { portraitCard } from "./portraitCard";

/*
  Community → Digital Members: the fictional people learners meet in training, introduced before they turn up in a
  scenario (server/digitalMembers.ts). Each card opens their profile page.
*/

type Data = { members: DigitalMemberCard[]; groups: typeof DIGITAL_GROUPS };

/**
  A Digital Member as a portrait card: their photo fills a tall card inside a soft white frame, and their name, a
  "digital member" badge (fictional, so a spark rather than a verified tick) and what they do sit on a pale fade at
  the foot, with where you'll meet them and a Meet button. The whole card opens their profile.
*/
function MemberCard({ m, onClick }: { m: DigitalMemberCard; onClick: (e: React.MouseEvent) => void }) {
  const first = m.name.split(" ")[0] === "Mr" || m.name.split(" ")[0] === "Mrs" ? m.name : m.name.split(" ")[0];
  return (
    <Link
      href={`/community/digital/${m.id}`}
      onClick={onClick}
      aria-label={`${m.name}, ${m.role}. Meet ${first}`}
      className={cx(portraitCard.frame, portraitCard.lift)}
    >
      <div className={portraitCard.window}>
        {m.portrait ? (
          // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
          <img
            src={m.portrait}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-x-0 bottom-0 h-[116%] w-full object-cover object-[center_30%] transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
          />
        ) : (
          <Portrait name={m.name} src="" className="absolute left-1/2 top-[18%] size-32 -translate-x-1/2 text-3xl" />
        )}
        {/* A pale fade up from the foot, so the words read over any photo. */}
        <div aria-hidden className={portraitCard.fade} />
        {m.story && (
          // Lives in Progress: their story carries on (docs/lives-in-progress.md).
          <span className="absolute left-3 top-3 flex items-center gap-1.5">
            <span className="rounded-full bg-[#102a43]/85 px-2.5 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-white backdrop-blur-sm">
              Lives in Progress · Ep {String(m.story.number).padStart(2, "0")}
            </span>
            {m.story.isNew && (
              <span className="rounded-full bg-[#fab53d] px-2 py-1 font-mulish text-xs font-extrabold uppercase tracking-[0.1em] text-[#102a43]">New</span>
            )}
          </span>
        )}
        <div className={portraitCard.foot}>
          <p className={portraitCard.name}>
            <span className="truncate">{m.name}</span>
            <span title="Digital member: a fictional person from your training" className={cx(portraitCard.badge, "bg-[#008282]")}>
              <Icon name="spark" className="size-3.5" />
            </span>
          </p>
          <p className="line-clamp-2 text-base leading-snug text-ink-muted">{m.role}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="flex items-center gap-3 whitespace-nowrap text-sm font-semibold text-ink">
              <span className="inline-flex items-center gap-1.5" title={`In ${m.courses} ${m.courses === 1 ? "course" : "courses"} you can open`}>
                <Icon name="book" className="size-4 text-ink-muted" />
                {m.courses}
                <span className="sr-only">{m.courses === 1 ? "course" : "courses"}</span>
              </span>
              <span
                className="inline-flex items-center gap-1.5"
                title={`Helps you learn about ${m.themes.length} ${m.themes.length === 1 ? "topic" : "topics"}`}
              >
                <Icon name="layers" className="size-4 text-ink-muted" />
                {m.themes.length}
                <span className="sr-only">{m.themes.length === 1 ? "topic" : "topics"}</span>
              </span>
            </p>
            <span className={cx(portraitCard.pill, "group-hover:bg-[#e8f6f6]")}>
              Meet <Icon name="plus" className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function DigitalMembers() {
  const { data, error } = useApi<Data>("/api/community/digital-members");
  const profile = useDigitalMemberModal();
  const [group, setGroup] = useState<string>("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = (data?.members ?? []).filter(
    (m) => (group === "all" || m.group === group) && (!q || [m.name, m.role, m.tagline, ...m.themes].some((s) => s.toLowerCase().includes(q))),
  );
  return (
    <div>
      <div className="grid gap-5 rounded-3xl bg-[#102a43] p-6 text-white sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">A digital introduction</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold">Meet the people in your training</h2>
          <p className="mt-2 max-w-2xl text-white/80">
            The clients, families and colleagues you’ll meet in Topics, Magazine courses and Play. Say hello now, and when they turn up in a scenario you’ll
            already know a little about them and what matters to them.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
            <Icon name="info" className="size-3.5" />
            Fictional people. Any resemblance to real clients or staff is coincidental.
          </p>
        </div>
        {data && (
          // The faces, and under them the way to chat with one (server/memberChat; hidden when chat is off).
          <div className="flex flex-col items-start gap-4 lg:items-center">
            <div className="flex -space-x-3" aria-hidden>
              {data.members
                .filter((m) => m.portrait)
                .slice(0, 6)
                .map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are
                  <img key={m.id} src={m.portrait} alt="" className="size-14 rounded-full object-cover ring-[3px] ring-[#102a43]" />
                ))}
            </div>
            <MemberChatButton members={data.members} />
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter digital members">
          {[{ id: "all", label: "Everyone" }, ...(data?.groups ?? [])].map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={group === g.id}
              onClick={() => setGroup(g.id)}
              className={cx(
                "min-h-10 shrink-0 rounded-full border px-4 text-sm font-semibold",
                group === g.id ? "border-[#008282] bg-tealtint text-ink" : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <label className="relative block lg:w-80">
          <span className="sr-only">Search digital members</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “roses” or “invoices”"
            className="min-h-11 w-full rounded-full border border-line bg-surface pl-9 pr-4"
          />
        </label>
      </div>

      {error && <p className="mt-6 rounded-2xl border border-line p-6 text-center text-ink-muted">Couldn’t load the digital members: {error}</p>}
      {!data && !error && (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <li key={i} className="aspect-[3/4.2] animate-pulse rounded-[2rem] bg-muted" />
          ))}
        </ul>
      )}

      {data && (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((m) => (
            <li key={m.id}>
              <MemberCard m={m} onClick={profile.onCardClick(m.id)} />
            </li>
          ))}
        </ul>
      )}
      {data && shown.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">No one matches that yet.</p>
      )}
      {profile.modal}
    </div>
  );
}
