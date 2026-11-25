"use client";

import { useEffect, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { dayNumber, dayString, formatTime, weekdayOf } from "@/lib/livingCalendar";
import type { IntroAudioAction } from "@/lib/magazineNarration";
import type { CalendarEntry, LivingCalendarView } from "@/server/livingCalendar";
import { Icon, type IconName } from "../Icon";
import { Portrait, useDigitalMemberModal } from "./DigitalMemberProfile";
import { MemberChatWith } from "./MemberChat";
import { VoicePlayer } from "./LifeMoments";

/*
  Community → Living Calendar (docs/lives-in-progress.md): the Digital Members' lives by the day. A month, Monday
  first, with today marked and selected; a panel for the chosen day; filters by person and by kind of moment. It shows
  only what the server sends: what's been shared, what's coming (by its teaser alone) and their usual routines.

  Keyboard: the grid is one tab stop; the arrow keys move a day or a week, Home and End go to the start or end of the
  week, Page Up and Page Down change the month, and Enter or Space chooses the day. Every day has a full label.
*/

const FILTERS = [
  ["all", "All moments"],
  ["everyday", "Everyday life"],
  ["voice", "Voice messages"],
  ["celebration", "Celebrations"],
  ["story", "Story developments"],
  ["upcoming", "Upcoming events"],
  ["unseen", "Unseen updates"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const EVERYDAY = new Set(["everyday", "checking_in", "seasonal", "hobby", "quiet", "family", "community"]);
const CELEBRATION = new Set(["celebration", "milestone", "good_news"]);
const STORY = new Set(["new_chapter", "follow_up", "reflection", "think"]);
const shows = (e: CalendarEntry, f: Filter) =>
  f === "all" ||
  (f === "everyday" && (EVERYDAY.has(e.category) || e.kind === "routine")) ||
  (f === "voice" && (e.category === "voice" || Boolean(e.audio))) ||
  (f === "celebration" && CELEBRATION.has(e.category)) ||
  (f === "story" && (STORY.has(e.category) || e.kind === "episode" || e.kind === "chapter")) ||
  (f === "upcoming" && e.tense === "upcoming") ||
  (f === "unseen" && e.unread);

const KEY = "tc-calendar-filters";
function readSaved(): { who: string[]; following: boolean; filter: Filter } {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { who?: unknown; following?: unknown; filter?: unknown };
    return {
      who: Array.isArray(s.who) ? s.who.filter((x): x is string => typeof x === "string") : [],
      following: s.following === true,
      filter: FILTERS.some(([k]) => k === s.filter) ? (s.filter as Filter) : "all",
    };
  } catch {
    return { who: [], following: false, filter: "all" };
  }
}
const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const post = (body: Record<string, unknown>) => void api("/api/community/calendar", { body }).catch(() => {});
const postMoment = (body: Record<string, unknown>) => void api("/api/community/moments", { body }).catch(() => {});

export function LivingCalendar() {
  const [month, setMonth] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  // The person and kind filters stay as the months change, and next time in this browser. (The tab is chosen by the
  // address's hash, so this only ever renders in the browser.)
  const [saved] = useState(readSaved);
  const [who, setWho] = useState<string[]>(saved.who);
  const [following, setFollowing] = useState(saved.following);
  const [filter, setFilter] = useState<Filter>(saved.filter);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ who, following, filter }));
    } catch {}
  }, [who, following, filter]);
  const q = new URLSearchParams();
  if (month) q.set("month", month);
  if (following) q.set("following", "1");
  else if (who.length) q.set("members", who.join(","));
  const { data, error } = useApi<LivingCalendarView>(`/api/community/calendar?${q}`);
  const profile = useDigitalMemberModal();
  const grid = useRef<HTMLDivElement>(null);
  const visited = useRef(false);
  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    post({ kind: "visit" });
  }, []);
  // A day keeps its keyboard focus when the month changes under it.
  useEffect(() => {
    if (focus && grid.current?.contains(document.activeElement)) grid.current.querySelector<HTMLElement>(`[data-day="${focus}"]`)?.focus();
  }, [data, focus]);

  if (error) return <p className="text-ink-muted">{error}</p>;
  if (!data)
    return (
      <div className="min-h-96 animate-pulse rounded-3xl bg-muted motion-reduce:animate-none" aria-label="Loading the calendar">
        <span className="sr-only">Loading</span>
      </div>
    );

  const day = picked && data.days.some((d) => d.date === picked) ? picked : data.days.some((d) => d.date === data.today) ? data.today : `${data.month}-01`;
  const current = focus && data.days.some((d) => d.date === focus) ? focus : day;
  const single = !following && who.length === 1 ? data.members.find((m) => m.id === who[0]) : null;
  const entries = (date: string) => (data.days.find((d) => d.date === date)?.entries ?? []).filter((e) => shows(e, filter));
  const choose = (date: string) => {
    setPicked(date);
    setFocus(date);
    setShowAll(false);
    if (date.slice(0, 7) !== data.month) setMonth(date.slice(0, 7));
    post({ kind: "day", detail: date });
  };
  const move = (by: number) => {
    const next = dayString(dayNumber(current) + by);
    setFocus(next);
    if (next.slice(0, 7) !== data.month && !data.days.some((d) => d.date === next)) setMonth(next.slice(0, 7));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const by =
      k === "ArrowRight"
        ? 1
        : k === "ArrowLeft"
          ? -1
          : k === "ArrowDown"
            ? 7
            : k === "ArrowUp"
              ? -7
              : k === "Home"
                ? -weekdayOf(current)
                : k === "End"
                  ? 6 - weekdayOf(current)
                  : 0;
    if (by) {
      e.preventDefault();
      move(by);
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      const m = k === "PageUp" ? data.prev : data.next;
      setMonth(m);
      setFocus(`${m}-${current.slice(8, 10) > "28" ? "28" : current.slice(8, 10)}`);
    } else if (k === "Enter" || k === " ") {
      e.preventDefault();
      choose(current);
    }
  };
  const toggleWho = (id: string) => {
    setFollowing(false);
    setWho(who.includes(id) ? who.filter((x) => x !== id) : [...who, id]);
    post({ kind: "filter", memberId: id, detail: "person" });
  };
  const monthName = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
  const dayEntries = entries(day);
  const open = (e: CalendarEntry) => {
    post({ kind: "event", memberId: e.people[0]?.id, detail: e.id });
    if (e.kind === "moment" || e.kind === "episode") postMoment({ kind: "open", id: e.id });
    profile.open(e.people[0].id, e.episodeId || null);
  };

  return (
    <div>
      <div className="rounded-3xl bg-[#102a43] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#fab53d]">Lives in Progress</p>
        <h2 className="mt-2 font-serif text-3xl font-semibold">Living Calendar</h2>
        <p className="mt-1 font-serif text-xl italic text-white/90">A little window into their lives.</p>
        <p className="mt-2 max-w-2xl text-white/80">
          Every day brings something different. Discover what’s been happening in the lives of our digital members, share in their little victories and see what
          they’re looking forward to.
        </p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
          <Icon name="info" className="size-3.5" /> Fictional people and moments, written for Trilogy Care training.
        </p>
      </div>

      {/* Who: everyone, the people you follow, or any of them. */}
      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Whose calendar">
        <button
          type="button"
          aria-pressed={!following && !who.length}
          onClick={() => (setWho([]), setFollowing(false), post({ kind: "filter", detail: "everyone" }))}
          className={chip(!following && !who.length)}
        >
          Everyone
        </button>
        <button
          type="button"
          aria-pressed={following}
          onClick={() => (setFollowing(!following), setWho([]), post({ kind: "filter", detail: "following" }))}
          className={chip(following)}
        >
          <Icon name="bookmark" className="size-4" /> People I follow
        </button>
        {data.members.map((m) => (
          <button key={m.id} type="button" aria-pressed={who.includes(m.id)} onClick={() => toggleWho(m.id)} className={chip(who.includes(m.id))}>
            <Portrait name={m.name} src={m.portrait} className="size-6 text-[0.55rem] ring-0" />
            <span className="size-2 rounded-full" style={{ background: m.colour }} aria-hidden />
            {m.name}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="What kind of moments">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => (setFilter(k), post({ kind: "filter", detail: k }))}
            className={cx(
              "min-h-9 rounded-full px-3 text-sm font-semibold",
              filter === k ? "bg-tealtint text-ink" : "text-ink-muted hover:bg-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <section aria-labelledby="calendar-month" className="rounded-3xl border border-line bg-surface p-3 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="calendar-month" className="font-serif text-2xl font-semibold">
              {single ? (
                <>
                  A month in the life of {single.name} <span className="block text-base font-normal text-ink-muted">{monthName}</span>
                </>
              ) : (
                monthName
              )}
            </h3>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(data.prev)} className={navBtn}>
                <Icon name="arrow-left" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => (setMonth(null), setPicked(null), setFocus(null))}
                className={cx(navBtn, "w-auto px-3 text-sm font-semibold")}
              >
                Today
              </button>
              <button type="button" aria-label="Next month" onClick={() => setMonth(data.next)} className={navBtn}>
                <Icon name="arrow-right" className="size-4" />
              </button>
            </div>
          </div>
          <div role="grid" aria-labelledby="calendar-month" ref={grid} onKeyDown={onKey} className="mt-3">
            <div role="row" className="grid grid-cols-7 gap-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                <span
                  key={d}
                  role="columnheader"
                  aria-label={["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][i]}
                  className="px-1 text-center text-xs font-semibold text-ink-muted"
                >
                  {d}
                </span>
              ))}
            </div>
            {Array.from({ length: data.days.length / 7 }, (_, w) => (
              <div role="row" key={w} className="mt-1 grid grid-cols-7 gap-1">
                {data.days.slice(w * 7, w * 7 + 7).map((d) => {
                  const list = entries(d.date);
                  const isToday = d.date === data.today;
                  const isPicked = d.date === day;
                  const names = [...new Set(list.flatMap((e) => e.people.map((p) => p.name)))];
                  const label = `${longDate(d.date)}${isToday ? ", today" : ""}: ${
                    list.length ? `${list.length} ${list.length === 1 ? "moment" : "moments"}, ${names.join(", ")}` : "a quiet day"
                  }`;
                  return (
                    <div role="gridcell" key={d.date} aria-selected={isPicked}>
                      <button
                        type="button"
                        data-day={d.date}
                        tabIndex={d.date === current ? 0 : -1}
                        aria-label={label}
                        onClick={() => choose(d.date)}
                        onFocus={() => setFocus(d.date)}
                        className={cx(
                          "flex h-full min-h-14 w-full flex-col items-stretch rounded-xl border p-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus)] sm:min-h-24",
                          isPicked ? "border-[#008282] bg-tealtint" : "border-line hover:border-line-strong",
                          !d.inMonth && "opacity-45",
                        )}
                      >
                        <span
                          className={cx("grid size-6 place-items-center self-start rounded-full text-xs font-semibold", isToday && "bg-[#102a43] text-white")}
                        >
                          {Number(d.date.slice(8))}
                        </span>
                        {/* Phones: a dot per person. Wider: up to two entries, then "+ more". */}
                        <span className="mt-auto flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                          {list.slice(0, 4).map((e) => (
                            <span
                              key={e.id}
                              className={cx("size-1.5 rounded-full", e.kind === "routine" && "opacity-50")}
                              style={{ background: e.people[0]?.colour }}
                            />
                          ))}
                        </span>
                        <span className="mt-1 hidden flex-col gap-0.5 sm:flex" aria-hidden>
                          {list.slice(0, 2).map((e) => (
                            <span
                              key={e.id}
                              className={cx(
                                "flex items-center gap-1 truncate rounded-md px-1 py-0.5 text-[0.68rem] leading-tight",
                                e.kind === "routine" ? "text-ink-muted" : "bg-bg",
                              )}
                            >
                              <span className="size-1.5 shrink-0 rounded-full" style={{ background: e.people[0]?.colour }} />
                              <Icon name={(e.audio ? "volume" : e.icon) as IconName} className="size-3 shrink-0" />
                              <span className="truncate">{e.title}</span>
                              {e.unread && <span className="size-1.5 shrink-0 rounded-full bg-[#fab53d]" />}
                            </span>
                          ))}
                          {list.length > 2 && <span className="px-1 text-[0.68rem] font-semibold text-ink-muted">+ {list.length - 2} more</span>}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Use the arrow keys to move between days, Page Up and Page Down to change the month.</p>
        </section>

        <section aria-labelledby="calendar-day" aria-live="polite" className="rounded-3xl border border-line bg-surface p-4 sm:p-5 lg:self-start">
          <h3 id="calendar-day" className="font-serif text-xl font-semibold">
            {longDate(day)}
            {day === data.today && <span className="ml-2 align-middle text-xs font-bold uppercase tracking-wide text-[#007373]">Today</span>}
          </h3>
          {dayEntries.length ? (
            <ul className="mt-3 flex flex-col gap-4">
              {(showAll ? dayEntries : dayEntries.slice(0, 5)).map((e) => (
                <li key={e.id}>
                  <DayEntry e={e} chat={data.chat[e.people[0]?.id ?? ""]} onOpen={() => open(e)} />
                </li>
              ))}
              {dayEntries.length > 5 && !showAll && (
                <li>
                  <button type="button" className="text-sm font-semibold text-[#007373] hover:underline" onClick={() => setShowAll(true)}>
                    Show all {dayEntries.length}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-3 font-serif text-lg italic text-ink-muted">A quiet day in their lives.</p>
          )}
        </section>
      </div>
      {profile.modal}
    </div>
  );
}

const chip = (on: boolean) =>
  cx(
    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold",
    on ? "border-[#008282] bg-tealtint text-ink" : "border-line text-ink-muted hover:text-ink",
  );
const navBtn = "grid min-h-10 w-10 place-items-center rounded-full border border-line-strong hover:bg-muted";

/** One thing on the chosen day: who, what kind, when; the words; a voice message to play; and where it leads. */
function DayEntry({ e, chat, onOpen }: { e: CalendarEntry; chat?: LivingCalendarView["chat"][string]; onOpen: () => void }) {
  const p = e.people[0];
  const muted = e.kind === "routine" || e.kind === "chapter";
  const onEvent = (a: IntroAudioAction) => {
    if (a === "play" || a === "replay") postMoment({ kind: "audio_play", id: e.id });
    else if (a === "complete") postMoment({ kind: "audio_complete", id: e.id });
  };
  return (
    <article aria-label={`${e.people.map((x) => x.name).join(" and ")}: ${e.title}`} className={cx("rounded-2xl", muted && "opacity-90")}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
        <span className="flex -space-x-1.5">
          {e.people.map((x) => (
            <Portrait key={x.id} name={x.name} src={x.portrait} className="size-7 text-[0.55rem]" />
          ))}
        </span>
        <span className="font-semibold text-ink">{e.people.map((x) => x.name).join(" and ")}</span>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          <Icon name={e.icon as IconName} className="size-3.5" /> {e.kind === "routine" ? "Usual routine" : e.categoryLabel}
        </span>
        {e.time && <span>· {formatTime(e.time)}</span>}
        {e.tense === "upcoming" && e.kind !== "routine" && (
          <span className="rounded-full bg-[#fff4dc] px-2 text-[#6b4a00] dark:bg-[#3a2e12] dark:text-[#f5d48a]">Coming up</span>
        )}
        {e.unread && <span className="rounded-full bg-[#fab53d] px-1.5 font-bold text-[#102a43]">New</span>}
      </p>
      <h4 className={cx("mt-1.5 font-serif text-lg font-semibold leading-snug", muted && "text-ink-muted")}>{e.title}</h4>
      {e.kind === "routine" && (
        <p className="text-sm text-ink-muted">
          {e.routine}. Part of {p?.possessive ?? "their"} usual week.
        </p>
      )}
      {e.narrative && e.kind !== "routine" && <p className="mt-1 text-sm leading-snug">{e.narrative}</p>}
      {e.quote && <p className="mt-1.5 font-serif italic leading-snug">“{e.quote}”</p>}
      {e.audio && p && (
        <div className="mt-2 overflow-hidden rounded-xl border border-line">
          <VoicePlayer
            src={e.image.src}
            focus={e.image.focus}
            transcript={e.transcript}
            audio={e.audio}
            first={p.first}
            what={e.kind === "episode" ? "diary" : "message"}
            onEvent={onEvent}
            className="mt-0"
          />
        </div>
      )}
      {e.audio && e.transcript && (
        <details className="mt-1.5 text-sm" onToggle={(ev) => ev.currentTarget.open && postMoment({ kind: "transcript", id: e.id })}>
          <summary className="cursor-pointer text-xs font-semibold text-[#007373] dark:text-[#3cb8b9]">Transcript</summary>
          <p className="mt-1 font-serif leading-relaxed">{e.transcript}</p>
        </details>
      )}
      {p && e.action === "chat" ? (
        <div className="mt-2">
          <MemberChatWith
            member={{ id: p.id, name: p.name, role: "", portrait: p.portrait, hello: e.quote || e.title }}
            story={chat ? { ...chat, historical: false } : undefined}
            opener={e.opener}
            label={e.actionLabel}
            icon="chat"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-tealtint px-3.5 text-sm font-semibold text-ink hover:bg-[#d3ecea] dark:hover:bg-white/15"
            onStart={() => postMoment({ kind: "chat", id: e.id })}
          />
        </div>
      ) : (
        p &&
        e.action === "story" && (
          <button
            type="button"
            onClick={onOpen}
            className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#007373] hover:underline dark:text-[#3cb8b9]"
          >
            {e.actionLabel} <span aria-hidden>→</span>
          </button>
        )
      )}
    </article>
  );
}
