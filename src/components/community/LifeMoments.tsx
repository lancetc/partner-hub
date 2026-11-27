"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, useApi } from "@/lib/api";
import type { IntroAudioAction } from "@/lib/magazineNarration";
import type { FeedCard, FeedChat, FeedPerson } from "@/server/lifeMoments";
import { IntroPlayer } from "../magazine/IntroPlayer";
import { Icon, type IconName } from "../Icon";
import { Portrait, useDigitalMemberModal } from "./DigitalMemberProfile";
import { MemberChatWith } from "./MemberChat";

/*
  "Meanwhile, in their lives…" (docs/lives-in-progress.md): Life Moments from the Digital Members, in a horizontal
  row on the homepage under Your Favourites. It leads with one person, picked at random on each visit (never the same
  one twice running) and shown large, two cards wide; then the other moments, unread first and the rest in a fresh
  order each visit, so a returning reader doesn't meet the same row. Five across on a wide screen with arrows; one and
  a peek of the next on a phone, swiped. It never scrolls or rotates by itself, and a voice message plays only when asked, one
  sound at a time on the page (IntroPlayer uses lib/onePlayer). A card opens the person's story in the same modal
  as everywhere else, at the episode it belongs to.
*/

type Feed = { cards: FeedCard[]; chat: Record<string, FeedChat>; people?: Record<string, FeedPerson> };
const URL_FEED = "/api/community/moments";

const post = (body: Record<string, unknown>) => void api(URL_FEED, { body }).catch(() => {});

/** Cards that were on screen for a moment, sent in small batches: "seen" for the reader, impressions for the report. */
function useSeen(enabled: boolean) {
  const queue = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    const ids = [...queue.current];
    queue.current.clear();
    if (ids.length) post({ kind: "seen", ids });
  }, []);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.moment;
          if (!e.isIntersecting || !id || sent.current.has(id)) continue;
          sent.current.add(id);
          queue.current.add(id);
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, 1500);
      },
      { threshold: 0.6 },
    );
    return () => {
      observer.current?.disconnect();
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [enabled, flush]);
  return useCallback((el: HTMLElement | null) => {
    if (el) observer.current?.observe(el);
  }, []);
}

const LAST_FEATURED = "tc-meanwhile-featured";

/** A small seeded random number source, so one visit's arrangement holds still while the page re-renders. */
function seeded(seed: number) {
  let a = Math.floor(seed * 2 ** 32) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
  This visit's line-up: one person to feature (at random, a little likelier with something new or a voice message,
  and not whoever was featured last time) with their best moment, then the rest: unread in the feed's order, then the
  others shuffled.
*/
export function arrangeMoments(cards: FeedCard[], seed: number, lastFeatured: string | null) {
  const random = seeded(seed);
  const people = [...new Set(cards.map((c) => c.memberId))];
  const pool = people.length > 1 ? people.filter((id) => id !== lastFeatured) : people;
  const weight = (id: string) => 1 + (cards.some((c) => c.memberId === id && c.unread) ? 1 : 0) + (cards.some((c) => c.memberId === id && c.audio) ? 0.5 : 0);
  let roll = random() * pool.reduce((n, id) => n + weight(id), 0);
  const chosen = pool.find((id) => (roll -= weight(id)) < 0) ?? pool[0];
  const featured = cards.find((c) => c.memberId === chosen) ?? null;
  const rest = cards.filter((c) => c !== featured);
  const read = rest.filter((c) => !c.unread);
  for (let i = read.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [read[i], read[j]] = [read[j], read[i]];
  }
  return { featured, rest: [...rest.filter((c) => c.unread), ...read] };
}

/** On the homepage, under Your Favourites. Nothing shows until there's something to show. */
export function HomeLifeMoments() {
  const { data } = useApi<Feed>(URL_FEED);
  const profile = useDigitalMemberModal();
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const watch = useSeen(Boolean(data?.cards.length));
  // One arrangement per visit: a seed, and who was featured last time (kept in this browser only). Both are read in
  // the browser after it loads, never while the server renders the page.
  const [visit, setVisit] = useState<{ seed: number; lastFeatured: string | null } | null>(null);
  useEffect(() => {
    let lastFeatured: string | null = null;
    try {
      lastFeatured = localStorage.getItem(LAST_FEATURED);
    } catch {
      // Private browsing: no memory of the last visit.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once per visit, in the browser only
    setVisit({ seed: Math.random(), lastFeatured });
  }, []);
  const lineup = useMemo(() => (data && visit ? arrangeMoments(data.cards, visit.seed, visit.lastFeatured) : null), [data, visit]);
  const featuredId = lineup?.featured?.memberId;
  useEffect(() => {
    if (!featuredId) return;
    try {
      localStorage.setItem(LAST_FEATURED, featuredId);
    } catch {
      // Private browsing: the next visit may feature them again, which is fine.
    }
  }, [featuredId]);
  const update = useCallback(() => {
    const t = track.current;
    if (t) setEdges({ start: t.scrollLeft < 8, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 8 });
  }, []);
  useEffect(update, [data, update]);
  if (!data?.cards.length || !lineup) return null;
  const openCard = (c: FeedCard) => (m: string, ep: string | null) => (post({ kind: "open", id: c.id }), profile.open(m, ep));
  const move = (dir: 1 | -1) => {
    const t = track.current;
    if (!t) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    t.scrollBy({ left: dir * t.clientWidth * 0.9, behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <section aria-labelledby="home-moments" className="mt-10 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#007373] dark:text-[#3cb8b9]">
            {/* Regularly updated: a quiet pulse, still for anyone who prefers less motion. */}
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-[#fab53d] opacity-60 motion-safe:animate-ping [animation-duration:2.5s]" />
              <span className="relative inline-flex size-2 rounded-full bg-[#fab53d]" />
            </span>
            Lives in Progress
          </p>
          <h2 id="home-moments" className="mt-1 font-serif text-2xl font-semibold">
            Meanwhile, in their lives…
          </h2>
          <p className="text-sm text-ink-muted">Little moments from the people we support.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {/* Straight to Community → Living Calendar (lib/livingCalendar). */}
          <Link href="/community#calendar" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2">
            Explore the Living Calendar{" "}
            <span aria-hidden className="ml-1">
              →
            </span>
          </Link>
          <Link href="/community/moments" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-2">
            See all moments
          </Link>
          <div className="hidden gap-1 sm:flex">
            <button
              type="button"
              aria-label="Earlier cards"
              disabled={edges.start}
              onClick={() => move(-1)}
              className="grid size-10 place-items-center rounded-full border border-line-strong hover:bg-muted disabled:opacity-35"
            >
              <Icon name="arrow-left" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="More cards"
              disabled={edges.end}
              onClick={() => move(1)}
              className="grid size-10 place-items-center rounded-full border border-line-strong hover:bg-muted disabled:opacity-35"
            >
              <Icon name="arrow-right" className="size-4" />
            </button>
          </div>
        </div>
      </div>
      <ul
        ref={track}
        onScroll={update}
        tabIndex={0}
        aria-label="Life Moments. Scroll sideways for more."
        className="-mx-5 mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2 [scrollbar-width:thin] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] sm:-mx-6 sm:scroll-px-6 sm:px-6"
      >
        {lineup.featured && (
          <li
            key={lineup.featured.id}
            ref={watch}
            data-moment={lineup.featured.id}
            className="w-[92%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3*2+1rem)] lg:w-[calc((100%-3rem)/4*2+1rem)] xl:w-[calc((100%-4rem)/5*2+1rem)]"
          >
            <FeaturedProfile
              card={lineup.featured}
              person={data.people?.[lineup.featured.memberId]}
              chat={data.chat[lineup.featured.memberId]}
              onOpen={openCard(lineup.featured)}
            />
          </li>
        )}
        {lineup.rest.map((c) => (
          <li
            key={c.id}
            ref={watch}
            data-moment={c.id}
            className="w-[78%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)]"
          >
            <LifeMomentCard card={c} chat={data.chat[c.memberId]} onOpen={openCard(c)} />
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
        <Icon name="info" className="size-3.5 shrink-0" />
        Fictional people and moments, written for Trilogy Care training.
      </p>
      {profile.modal}
    </section>
  );
}

/** Every moment that's out, newest first: the "See all" page. */
export function AllLifeMoments() {
  const { data, error } = useApi<Feed>(`${URL_FEED}?all=1`);
  const profile = useDigitalMemberModal();
  const watch = useSeen(Boolean(data?.cards.length));
  if (error) return <p className="text-ink-muted">{error}</p>;
  if (!data) return <p className="text-ink-muted">Loading…</p>;
  if (!data.cards.length) return <p className="text-ink-muted">Nothing to share just yet.</p>;
  return (
    <>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.cards.map((c) => (
          <li key={c.id} ref={watch} data-moment={c.id}>
            <LifeMomentCard card={c} chat={data.chat[c.memberId]} onOpen={(m, ep) => (post({ kind: "open", id: c.id }), profile.open(m, ep))} />
          </li>
        ))}
      </ul>
      {profile.modal}
    </>
  );
}

/**
  The visit's featured person, two cards wide: their portrait large, who they are (age and circumstances, where,
  their tagline), then their latest moment with its voice message if there is one, and the same actions as a card.
*/
function FeaturedProfile({
  card: c,
  person,
  chat,
  onOpen,
}: {
  card: FeedCard;
  person?: FeedPerson;
  chat?: FeedChat;
  onOpen: (memberId: string, episodeId: string | null) => void;
}) {
  const log = (kind: string) => post({ kind, id: c.id });
  const onEvent = (a: IntroAudioAction) => {
    if (a === "play" || a === "replay") log("audio_play");
    else if (a === "complete") log("audio_complete");
    else if (a === "transcript") log("transcript");
  };
  const member = { id: c.memberId, name: c.name, role: "", portrait: c.portrait, hello: c.quote || c.headline };
  const open = () => onOpen(c.memberId, c.episodeId || null);
  const about = [person?.circumstances, person?.location].filter(Boolean).join(" · ");
  const primary =
    "inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";
  const quiet =
    "inline-flex min-h-11 items-center text-sm font-semibold text-[#007373] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus)] dark:text-[#3cb8b9]";
  return (
    <article
      aria-label={`Featured: ${c.name}`}
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#fab53d]/70 bg-bg shadow-sm sm:flex-row"
    >
      <button
        type="button"
        onClick={open}
        aria-label={`Open ${c.possessive} story`}
        className="group relative aspect-[4/3] shrink-0 overflow-hidden bg-[#0b1f33] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus)] sm:aspect-auto sm:w-[46%]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
        <img
          src={c.portrait}
          alt=""
          className="absolute inset-0 size-full object-cover transition duration-500 motion-safe:group-hover:scale-[1.03]"
          style={{ objectPosition: "50% 30%" }}
        />
        <span aria-hidden className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-[#06223a]/50 to-transparent" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[#fab53d] px-2.5 py-1 font-mulish text-xs font-extrabold uppercase tracking-wider text-[#102a43]">
          <Icon name="star" className="size-3" /> In the spotlight
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-serif text-2xl font-semibold leading-tight">{c.name}</h3>
        {about && <p className="mt-0.5 text-sm text-ink-muted">{about}</p>}
        {person?.tagline && <p className="mt-2 line-clamp-2 text-sm leading-snug">{person.tagline}</p>}
        <div className="mt-3 rounded-xl bg-tealtint/70 p-3 dark:bg-white/5">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <Icon name={c.icon as IconName} className="size-3" /> {c.categoryLabel}
            <span aria-hidden>·</span>
            <span className="font-semibold normal-case tracking-normal">{c.when}</span>
            {c.unread && (
              <span className="rounded-full bg-[#fab53d] px-1.5 py-0.5 font-mulish text-xs font-extrabold uppercase tracking-wider text-[#102a43]">
                New
              </span>
            )}
          </p>
          <p className="mt-1 line-clamp-2 font-serif text-lg font-semibold leading-snug">{c.headline}</p>
          {c.quote ? (
            <p className="mt-1 line-clamp-3 font-serif text-sm italic leading-snug">“{c.quote}”</p>
          ) : c.body ? (
            <p className="mt-1 line-clamp-3 text-sm leading-snug text-ink-muted">{c.body}</p>
          ) : null}
        </div>
        {c.audio && (
          <IntroPlayer
            className="mt-3 rounded-xl pb-2.5 pt-2.5"
            poster={{ src: c.portrait }}
            posterControls="only"
            script={c.transcript}
            audio={{ src: c.audio.src, seconds: c.audio.seconds, words: null, scriptHash: c.audio.scriptHash, voice: c.audio.voice, at: c.audio.at }}
            onEvent={onEvent}
            label={`Listen to ${c.first}’s ${c.kind === "episode" ? "diary" : "message"}`}
          />
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4">
          {c.action === "chat" ? (
            <>
              <MemberChatWith
                member={member}
                story={chat ? { ...chat, historical: false } : undefined}
                opener={c.opener}
                label={c.actionLabel}
                icon="chat"
                className={primary}
                onStart={() => log("chat")}
              />
              <button type="button" className={quiet} onClick={open}>
                {c.possessive[0].toUpperCase() + c.possessive.slice(1)} story
              </button>
            </>
          ) : (
            <button type="button" className={primary} onClick={open}>
              {c.actionLabel} <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
  One Life Moment, sized for five across a wide screen: a short picture (their portrait unless the moment has its own),
  what kind of moment and when, the headline, their words, and at most one main action and one quiet link. A voice
  message with a checked recording plays in the picture's place (IntroPlayer's reduced player, one sound at a time);
  without one, "Read her message" shows the words. `preview` is an author's look before it's shared: nothing is
  counted and the buttons do nothing.
*/
export function LifeMomentCard({
  card: c,
  chat,
  onOpen,
  preview,
}: {
  card: FeedCard;
  chat?: FeedChat;
  onOpen: (memberId: string, episodeId: string | null) => void;
  preview?: boolean;
}) {
  const [words, setWords] = useState(false);
  const log = (kind: string) => !preview && post({ kind, id: c.id });
  const onEvent = (a: IntroAudioAction) => {
    if (a === "play" || a === "replay") log("audio_play");
    else if (a === "complete") log("audio_complete");
    else if (a === "transcript") log("transcript");
  };
  const voice = c.category === "voice";
  const member = { id: c.memberId, name: c.name, role: "", portrait: c.portrait, hello: c.quote || c.headline };
  const open = () => !preview && onOpen(c.memberId, c.episodeId || null);
  const primary =
    "inline-flex min-h-10 items-center gap-1.5 rounded-2xl bg-tealtint px-3.5 py-1.5 text-left text-sm font-semibold leading-tight text-ink hover:bg-[#d3ecea] focus-visible:outline-2 focus-visible:outline-[var(--focus)] dark:hover:bg-white/15";
  const quiet =
    "inline-flex min-h-10 items-center text-sm font-semibold text-[#007373] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus)] dark:text-[#3cb8b9]";
  const chip = (
    <span className="absolute left-2.5 top-2.5 z-10 inline-flex max-w-[calc(100%-4rem)] items-center gap-1 truncate rounded-full bg-white/92 px-2 py-0.5 text-xs font-bold text-[#102a43]">
      <Icon name={c.icon as IconName} className="size-3 shrink-0" />
      <span className="truncate">{c.categoryLabel}</span>
    </span>
  );
  const fresh = c.unread && (
    <span className="absolute right-2.5 top-2.5 z-10 rounded-full bg-[#fab53d] px-1.5 py-0.5 font-mulish text-xs font-extrabold uppercase tracking-wider text-[#102a43]">
      New
    </span>
  );
  return (
    <article aria-label={`${c.name}: ${c.headline}`} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-bg">
      {c.audio ? (
        // The picture stays clear: Play, the label, the time and the live caption sit underneath it (posterControls "below").
        <div className="relative shrink-0">
          {fresh}
          <VoicePlayer
            src={c.image.src}
            focus={c.image.focus}
            transcript={c.transcript}
            audio={c.audio}
            first={c.first}
            what={c.kind === "episode" ? "diary" : "message"}
            onEvent={onEvent}
            className="mt-0 rounded-none"
          />
        </div>
      ) : (
        <div className="relative aspect-[16/9] shrink-0 overflow-hidden bg-[#0b1f33]">
          {/* eslint-disable-next-line @next/next/no-img-element -- library pictures are served as they are */}
          <img
            src={c.image.src}
            alt={c.image.alt}
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
            style={{ objectPosition: c.image.focus }}
          />
          <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[#06223a]/55 to-transparent" />
          {chip}
          {fresh}
        </div>
      )}
      <div className="flex flex-1 flex-col p-3.5">
        {c.audio && (
          // A voice card's category sits here, not over the picture.
          <p className="mb-1.5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink-muted">
            <Icon name={c.icon as IconName} className="size-3" /> {c.categoryLabel}
          </p>
        )}
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-muted">
          <Portrait name={c.name} src={c.portrait} className="size-5 text-[0.55rem] ring-1" />
          <span className="truncate font-semibold text-ink">{c.name}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{c.when}</span>
        </p>
        <h3 className="mt-1.5 line-clamp-2 font-serif text-base font-semibold leading-snug">{c.headline}</h3>
        {c.quote ? (
          <p className="mt-1 line-clamp-3 font-serif text-sm italic leading-snug text-ink">“{c.quote}”</p>
        ) : c.body ? (
          <p className="mt-1 line-clamp-3 text-sm leading-snug text-ink-muted">{c.body}</p>
        ) : null}
        {c.relationship && <p className="mt-1.5 text-xs font-semibold text-[#007373] dark:text-[#3cb8b9]">{c.relationship}</p>}
        {c.audio && c.transcript && (
          <details className="mt-1.5 text-sm" onToggle={(e) => e.currentTarget.open && log("transcript")}>
            <summary className="cursor-pointer text-xs font-semibold text-[#007373] dark:text-[#3cb8b9]">Transcript</summary>
            <p className="mt-1 font-serif leading-relaxed">{c.transcript}</p>
          </details>
        )}
        {voice && !c.audio && words && (
          <p className="mt-2 font-serif text-sm leading-relaxed">
            {c.transcript}
            <span className="mt-1 block font-sans text-xs text-ink-muted">The recording isn’t ready yet.</span>
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3">
          {voice && !c.audio && c.transcript ? (
            // A message without its recording: reading it is the main thing; their story is the quiet link.
            <>
              <button
                type="button"
                aria-expanded={words}
                onClick={() => {
                  setWords(!words);
                  if (!words) log("transcript");
                }}
                className={primary}
              >
                <Icon name="doc" className="size-4" /> {words ? "Hide message" : `Read ${c.possessive} message`}
              </button>
              <button type="button" className={quiet} onClick={open}>
                {c.episodeId ? "Their story" : `Catch up with ${c.first}`}
              </button>
            </>
          ) : c.action === "chat" && !preview ? (
            <>
              <MemberChatWith
                member={member}
                story={chat ? { ...chat, historical: false } : undefined}
                opener={c.opener}
                label={c.actionLabel}
                icon="chat"
                className={primary}
                onStart={() => log("chat")}
              />
              <button type="button" className={quiet} onClick={open}>
                Their story
              </button>
            </>
          ) : (
            <button type="button" className={primary} onClick={open}>
              {c.actionLabel} <span aria-hidden>→</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
  A character's voice message or diary as a small picture with the controls under it (IntroPlayer, posterControls
  "below"), so their face is never covered. One sound at a time on the page; never plays by itself. Used on Life
  Moment cards and in the Living Calendar's day panel.
*/
export function VoicePlayer({
  src,
  focus,
  transcript,
  audio,
  first,
  onEvent,
  className,
  what = "message",
}: {
  src: string;
  focus: string;
  transcript: string;
  audio: NonNullable<FeedCard["audio"]>;
  first: string;
  onEvent: (a: IntroAudioAction) => void;
  className?: string;
  what?: string;
}) {
  return (
    <IntroPlayer
      className={className}
      poster={{ src, position: focus }}
      posterControls="below"
      script={transcript}
      audio={{ src: audio.src, seconds: audio.seconds, words: null, scriptHash: audio.scriptHash, voice: audio.voice, at: audio.at }}
      onEvent={onEvent}
      label={`Listen to ${first}’s ${what}`}
    />
  );
}
