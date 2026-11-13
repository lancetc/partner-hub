"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useApi, type Me } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import { cx } from "@/lib/format";
import {
  ago,
  avatarColour,
  COMMUNITY_SIZE,
  events,
  initials,
  LEVELS,
  levelFor,
  memberById,
  members,
  posts,
  sortPosts,
  spaces,
  type Comment,
  type CommunityEvent,
  type Member,
  type Post,
  type SpaceId,
} from "@/content/community";
import { cardOfTheWeek, perspectives, themeOf } from "@/content/conversations";
import Link from "next/link";
import { Icon } from "../Icon";

/*
  The Community: a feed of posts in spaces, events, a member directory and a leaderboard, in the
  spirit of Skool and Mighty Networks. The posts, people and events are demonstration content;
  what you do here (likes, votes, posts, replies, RSVPs) is kept on this device for each person.
*/

// ---------- What you've done, kept per person on this device ----------

type MyPost = { id: string; space: SpaceId; title: string; body: string; at: string };
type MyReply = { id: string; body: string; at: string };
type Mine = { liked: string[]; votes: Record<string, string>; posts: MyPost[]; replies: Record<string, MyReply[]>; going: string[] };
const EMPTY: Mine = { liked: [], votes: {}, posts: [], replies: {}, going: [] };
const storageKey = (who: string) => `tc-community-${who}`;

function load(who: string): Mine {
  try {
    const raw = localStorage.getItem(storageKey(who));
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
function save(who: string, m: Mine) {
  try {
    localStorage.setItem(storageKey(who), JSON.stringify(m));
  } catch {}
}

const hoursSince = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);

// ---------- Tabs, kept in the address (#events) so the homepage can link straight to one ----------

const TABS = [
  { id: "feed", label: "Feed", icon: "chat" },
  { id: "events", label: "Events", icon: "calendar" },
  { id: "members", label: "Members", icon: "people" },
  { id: "leaderboard", label: "Leaderboard", icon: "star" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const subscribeHash = (on: () => void) => {
  window.addEventListener("hashchange", on);
  return () => window.removeEventListener("hashchange", on);
};
function useTab(): [Tab, (t: Tab) => void] {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => "",
  );
  const tab = (TABS.find((t) => t.id === hash)?.id ?? "feed") as Tab;
  return [tab, (t) => (window.location.hash = t === "feed" ? "" : t)];
}

// ---------- The page ----------

type You = { id: string; name: string; role: string; photo?: string | null };

export function Community() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  const who = me?.user.id ?? "guest";
  const you: You = { id: "you", name: me?.user.name ?? "You", photo: me?.user.avatar ?? null, role: me?.user.serviceRole ?? (me?.user.audience === "coordinator" ? "Care coordinator" : "Care Partner") };
  const [saved, setSaved] = useState<Record<string, Mine>>({});
  const mine = saved[who] ?? (hydrated ? load(who) : EMPTY);
  const update = (change: (m: Mine) => Mine) => {
    const next = change(mine);
    setSaved((all) => ({ ...all, [who]: next }));
    save(who, next);
  };
  const [tab, setTab] = useTab();

  const online = members.filter((m) => m.online);
  const yourPoints = mine.posts.length + Object.values(mine.replies).reduce((n, r) => n + r.length, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      {/* The community at a glance. */}
      <header className="relative overflow-hidden rounded-3xl bg-[#008282] px-5 py-6 text-white sm:px-8 sm:py-8">
        <Pattern />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#bdeeee]">Trilogy Care Community</p>
            <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Learn from each other</h1>
            <p className="mt-2 text-lg text-white/90">
              Care Partners and coordinators from every corner of Australia, sharing what works, asking what doesn’t, and cheering each other on.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex -space-x-2" aria-hidden>
              {members.slice(0, 6).map((m) => (
                <Avatar key={m.id} person={m} size="sm" ring="ring-[#008282]" />
              ))}
            </div>
            <dl className="flex gap-6 font-mulish">
              <Stat label="members" value={COMMUNITY_SIZE.toLocaleString("en-AU")} />
              <Stat label="online now" value={String(online.length + 1)} dot />
              <Stat label="posts this week" value={String(posts.filter((p) => p.hoursAgo < 24 * 7).length + mine.posts.length + 57)} />
            </dl>
          </div>
        </div>
      </header>

      {/* Tabs. */}
      <div role="tablist" aria-label="Community" className="mt-4 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--line)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`community-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`community-panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx(
              "inline-flex min-h-12 shrink-0 items-center gap-2 border-b-[3px] px-4 font-semibold",
              tab === t.id ? "border-[#008282] text-ink dark:border-[#3cb8b9]" : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            <Icon name={t.icon} className="size-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`community-panel-${tab}`} aria-labelledby={`community-tab-${tab}`} className="pb-10 pt-6">
        {tab === "feed" && <Feed you={you} mine={mine} update={update} hydrated={hydrated} yourPoints={yourPoints} goTo={setTab} />}
        {tab === "events" && <Events mine={mine} update={update} hydrated={hydrated} />}
        {tab === "members" && <Members />}
        {tab === "leaderboard" && <Leaderboard you={you} yourPoints={yourPoints} />}
      </div>
    </div>
  );
}

function Stat({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="flex items-center gap-1.5 text-2xl font-extrabold tabular-nums">
        {dot && <span className="size-2.5 rounded-full bg-[#7ef0a6]" aria-hidden />}
        {value}
      </dd>
      <dd className="text-sm text-white/80" aria-hidden>
        {label}
      </dd>
    </div>
  );
}

/** Soft circles in the brand colours behind the heading. */
function Pattern() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 800 240">
      <circle cx="720" cy="40" r="120" fill="#3cb8b9" opacity="0.35" />
      <circle cx="610" cy="230" r="80" fill="#fab53d" opacity="0.25" />
      <circle cx="790" cy="210" r="46" fill="#c7393e" opacity="0.3" />
    </svg>
  );
}

// ---------- People ----------

/** `photo`: the signed-in person's own profile picture, when they've added one. */
type Person = Pick<Member, "id" | "name"> & { online?: boolean; level?: number; photo?: string | null };

function Avatar({ person, size = "md", ring, level }: { person: Person; size?: "xs" | "sm" | "md" | "lg"; ring?: string; level?: number }) {
  const sizes = { xs: "size-7 text-[0.65rem]", sm: "size-9 text-xs", md: "size-11 text-sm", lg: "size-16 text-lg" };
  return (
    <span className="relative inline-flex shrink-0">
      {person.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- the person's own picture from this hub's avatar endpoint
        <img src={person.photo} alt="" className={cx("rounded-full object-cover ring-2", sizes[size], ring ?? "ring-surface")} />
      ) : (
        <span
          className={cx("grid place-items-center rounded-full font-mulish font-extrabold text-white ring-2", sizes[size], ring ?? "ring-surface")}
          style={{ background: person.id === "you" ? "#102a43" : avatarColour(person.id) }}
          aria-hidden
        >
          {initials(person.name)}
        </span>
      )}
      {level !== undefined && (
        <span
          className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-[#fab53d] font-mulish text-[0.65rem] font-extrabold text-[#102a43] ring-2 ring-surface"
          title={`Level ${level}`}
        >
          {level}
        </span>
      )}
      {person.online && level === undefined && <span className="absolute bottom-0 right-0 size-3 rounded-full bg-[#2fbf71] ring-2 ring-surface" />}
    </span>
  );
}

// ---------- Feed ----------

type FeedPost = Post & { mine?: boolean };
type Update = (change: (m: Mine) => Mine) => void;

function Feed({
  you,
  mine,
  update,
  hydrated,
  yourPoints,
  goTo,
}: {
  you: You;
  mine: Mine;
  update: Update;
  hydrated: boolean;
  yourPoints: number;
  goTo: (t: Tab) => void;
}) {
  const [space, setSpace] = useState<SpaceId | "all">("all");
  const [order, setOrder] = useState<"latest" | "top">("latest");
  const yours: FeedPost[] = mine.posts.map((p) => ({ ...p, authorId: "you", hoursAgo: hoursSince(p.at), likes: 0, comments: [], mine: true }));
  const all = [...yours, ...posts];
  const shown = sortPosts(
    all.filter((p) => space === "all" || p.space === space),
    order,
  );
  const count = (id: SpaceId) => all.filter((p) => p.space === id).length;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_18rem]">
      {/* Spaces: a list beside the feed on a laptop, chips across the top on a phone. */}
      <nav aria-label="Spaces" className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="mb-2 hidden font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted lg:block">Spaces</h2>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
          {[{ id: "all" as const, name: "All posts", emoji: "🏡" }, ...spaces].map((s) => (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSpace(s.id)}
                aria-pressed={space === s.id}
                className={cx(
                  "flex min-h-10 w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 text-left text-sm font-medium lg:rounded-xl lg:border-0",
                  space === s.id ? "border-[#008282] bg-tealtint text-ink" : "border-line text-ink-muted hover:bg-muted hover:text-ink",
                )}
              >
                <span aria-hidden>{s.emoji}</span>
                <span className="flex-1">{s.name}</span>
                {s.id !== "all" && <span className="hidden text-xs tabular-nums text-ink-muted lg:inline">{count(s.id)}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        {space !== "all" && (
          <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-ink-muted">
            <span className="font-semibold text-ink">{spaces.find((s) => s.id === space)?.name}:</span> {spaces.find((s) => s.id === space)?.blurb}
          </p>
        )}
        <Composer
          you={you}
          space={space === "all" ? "ask" : space}
          onPost={(p) => update((m) => ({ ...m, posts: [p, ...m.posts] }))}
        />
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold">{space === "all" ? "Latest from everyone" : spaces.find((s) => s.id === space)?.name}</h2>
          <div className="flex rounded-full bg-muted p-1 text-sm font-semibold" role="group" aria-label="Sort posts">
            {(["latest", "top"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={order === o}
                onClick={() => setOrder(o)}
                className={cx("min-h-9 rounded-full px-4 capitalize", order === o ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">No posts here yet. Be the first!</p>}
        {shown.map((p) => (
          <PostCard key={p.id} post={p} you={you} mine={mine} update={update} hydrated={hydrated} onSpace={setSpace} />
        ))}
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start" aria-label="Around the community">
        {hydrated && <WeekCard />}
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Community guidelines</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            <li className="flex gap-2">
              <span aria-hidden>💛</span> Be kind. Everyone here is learning.
            </li>
            <li className="flex gap-2">
              <span aria-hidden>🔒</span> Protect client privacy: no names, addresses or photos.
            </li>
            <li className="flex gap-2">
              <span aria-hidden>📞</span> Anything urgent? Call the client’s coordinator, not the Community.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Coming up</h2>
            <button type="button" onClick={() => goTo("events")} className="text-sm font-semibold text-accent hover:underline">
              All events
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-3">
            {events.slice(0, 2).map((e) => (
              <li key={e.id} className="flex gap-3">
                <DateBlock event={e} hydrated={hydrated} small />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">{e.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {timeLabel(e)} · {e.going + Number(mine.going.includes(e.id))} going
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Leaderboard · 7 days</h2>
            <button type="button" onClick={() => goTo("leaderboard")} className="text-sm font-semibold text-accent hover:underline">
              See all
            </button>
          </div>
          <ol className="mt-3 flex flex-col gap-2">
            {[...members]
              .sort((a, b) => b.points.week - a.points.week)
              .slice(0, 5)
              .map((m, i) => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span className="w-4 text-center font-mulish font-extrabold text-ink-muted">{i + 1}</span>
                  <Avatar person={m} size="xs" />
                  <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                  <span className="font-semibold tabular-nums text-[#008282] dark:text-[#3cb8b9]">+{m.points.week}</span>
                </li>
              ))}
          </ol>
          <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-ink-muted">
            You’re level {levelFor(yourPoints).level} with {yourPoints} {yourPoints === 1 ? "point" : "points"}. Post or reply to earn more.
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Online now</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {members
              .filter((m) => m.online)
              .map((m) => (
                <li key={m.id} title={`${m.name}, ${m.role}`}>
                  <Avatar person={m} size="sm" />
                  <span className="sr-only">
                    {m.name}, {m.role}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function Composer({ you, space, onPost }: { you: You; space: SpaceId; onPost: (p: MyPost) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [where, setWhere] = useState<SpaceId | null>(null);
  const target = where ?? space;
  const reset = () => {
    setOpen(false);
    setTitle("");
    setBody("");
    setWhere(null);
  };
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-left text-ink-muted hover:border-[#008282]"
      >
        <Avatar person={you} size="sm" />
        <span className="flex-1">Share a win, ask a question or pass on a tip…</span>
        <span className="hidden rounded-full bg-[#008282] px-4 py-2 text-sm font-semibold text-white sm:inline">Post</span>
      </button>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-[#008282] bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        onPost({ id: `you-${Date.now()}`, space: target, title: title.trim(), body: body.trim(), at: new Date().toISOString() });
        reset();
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar person={you} size="sm" />
        <span className="text-sm">
          <span className="font-semibold">{you.name}</span> posting in{" "}
          <label className="sr-only" htmlFor="compose-space">
            Space
          </label>
          <select
            id="compose-space"
            value={target}
            onChange={(e) => setWhere(e.target.value as SpaceId)}
            className="rounded-lg border border-line bg-surface px-2 py-1 font-semibold"
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </option>
            ))}
          </select>
        </span>
      </div>
      <label className="sr-only" htmlFor="compose-title">
        Title
      </label>
      <input
        id="compose-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="rounded-xl border border-line bg-surface px-3 py-2 font-semibold"
        maxLength={120}
      />
      <label className="sr-only" htmlFor="compose-body">
        What would you like to share?
      </label>
      <textarea
        id="compose-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What would you like to share? Leave out client names and anything that could identify them."
        rows={4}
        autoFocus
        className="rounded-xl border border-line bg-surface px-3 py-2"
        maxLength={2000}
      />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={reset} className="min-h-10 rounded-full px-4 font-semibold text-ink-muted hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!body.trim()}
          className="min-h-10 rounded-full bg-[#008282] px-5 font-semibold text-white hover:bg-[#006b6b] disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </form>
  );
}

function PostCard({
  post,
  you,
  mine,
  update,
  hydrated,
  onSpace,
}: {
  post: FeedPost;
  you: You;
  mine: Mine;
  update: Update;
  hydrated: boolean;
  onSpace: (s: SpaceId) => void;
}) {
  const author: Person & { role: string; region?: string } = post.mine ? { ...you, region: undefined } : memberById(post.authorId)!;
  const space = spaces.find((s) => s.id === post.space)!;
  const liked = mine.liked.includes(post.id);
  const replies = mine.replies[post.id] ?? [];
  const comments: (Comment & { mine?: boolean })[] = [
    ...post.comments,
    ...replies.map((r) => ({ id: r.id, authorId: "you", hoursAgo: hoursSince(r.at), body: r.body, likes: 0, mine: true })),
  ];
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const long = post.body.length > 320;
  const toggleLike = (id: string) => update((m) => ({ ...m, liked: m.liked.includes(id) ? m.liked.filter((x) => x !== id) : [...m.liked, id] }));
  const level = post.mine ? undefined : levelFor(memberById(post.authorId)!.points.all).level;

  return (
    <article className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <Avatar person={author} level={level} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold">{author.name}</span>
            {!post.mine && memberById(post.authorId)?.host && (
              <span className="rounded-full bg-[#c7393e] px-2 py-0.5 text-[0.7rem] font-bold text-white">Host</span>
            )}
          </p>
          <p className="text-xs text-ink-muted">
            {author.role}
            {author.region && ` · ${author.region}`} · {post.mine && !hydrated ? "" : ago(post.hoursAgo)} ·{" "}
            <button type="button" onClick={() => onSpace(post.space)} className="font-medium hover:text-ink hover:underline">
              {space.emoji} {space.name}
            </button>
          </p>
        </div>
        {post.pinned && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1d6] px-2.5 py-1 text-xs font-bold text-[#7a4a00]">
            <Icon name="pin" className="size-3.5" /> Pinned
          </span>
        )}
      </header>

      {post.title && <h3 className="mt-3 font-serif text-lg font-semibold leading-snug">{post.title}</h3>}
      <p className={cx("mt-1.5 whitespace-pre-line", long && !more && "line-clamp-4")}>{post.body}</p>
      {long && (
        <button type="button" onClick={() => setMore(!more)} className="mt-1 text-sm font-semibold text-accent hover:underline">
          {more ? "Show less" : "See more"}
        </button>
      )}

      {post.poll && <Poll postId={post.id} poll={post.poll} vote={mine.votes[post.id]} onVote={(o) => update((m) => ({ ...m, votes: { ...m.votes, [post.id]: o } }))} />}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          aria-pressed={liked}
          onClick={() => toggleLike(post.id)}
          className={cx(
            "inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
            liked ? "bg-[#fde8e9] text-[#c7393e] dark:bg-[#4a1c1e] dark:text-[#ff9ea2]" : "text-ink-muted hover:bg-muted hover:text-ink",
          )}
        >
          <Icon name="heart" className={cx("size-4", liked && "fill-current")} />
          {post.likes + Number(liked)} <span className="sr-only">likes{liked ? ", including yours" : ""}</span>
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-muted hover:bg-muted hover:text-ink"
        >
          <Icon name="chat" className="size-4" />
          {comments.length} {comments.length === 1 ? "comment" : "comments"}
        </button>
        {comments.length > 0 && !open && (
          <span className="ml-auto flex items-center gap-2 text-xs text-ink-muted">
            <span className="flex -space-x-1.5">
              {[...new Set(comments.map((c) => c.authorId))].slice(0, 3).map((id) => (
                <Avatar key={id} person={id === "you" ? you : memberById(id)!} size="xs" />
              ))}
            </span>
            <span className="hidden sm:inline">Last reply {ago(Math.min(...comments.map((c) => c.hoursAgo)))} ago</span>
          </span>
        )}
      </footer>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {comments.map((c) => {
            const by = c.mine ? you : memberById(c.authorId)!;
            const cLiked = mine.liked.includes(c.id);
            return (
              <div key={c.id} className="flex gap-2.5">
                <Avatar person={by} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="rounded-2xl bg-muted px-3.5 py-2.5">
                    <p className="text-sm font-semibold">
                      {by.name} <span className="font-normal text-ink-muted">· {by.role}</span>
                    </p>
                    <p className="text-[0.95rem]">{c.body}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-3 pl-3 text-xs text-ink-muted">
                    <span>{ago(c.hoursAgo)}</span>
                    {!c.mine && (
                      <button
                        type="button"
                        aria-pressed={cLiked}
                        onClick={() => toggleLike(c.id)}
                        className={cx("inline-flex min-h-8 items-center gap-1 font-semibold hover:text-ink", cLiked && "text-[#c7393e] dark:text-[#ff9ea2]")}
                      >
                        <Icon name="heart" className={cx("size-3.5", cLiked && "fill-current")} />
                        {c.likes + Number(cLiked)}
                        <span className="sr-only">likes</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <Reply
            you={you}
            onReply={(body) => update((m) => ({ ...m, replies: { ...m.replies, [post.id]: [...(m.replies[post.id] ?? []), { id: `r-${Date.now()}`, body, at: new Date().toISOString() }] } }))}
          />
        </div>
      )}
    </article>
  );
}

function Reply({ you, onReply }: { you: You; onReply: (body: string) => void }) {
  const [text, setText] = useState("");
  const id = useId();
  return (
    <form
      className="flex items-center gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onReply(text.trim());
        setText("");
      }}
    >
      <Avatar person={you} size="sm" />
      <label className="sr-only" htmlFor={id}>
        Write a reply
      </label>
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a reply…"
        className="min-h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4"
        maxLength={1000}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="min-h-10 rounded-full bg-[#008282] px-4 text-sm font-semibold text-white hover:bg-[#006b6b] disabled:opacity-50"
      >
        Reply
      </button>
    </form>
  );
}

function Poll({ postId, poll, vote, onVote }: { postId: string; poll: NonNullable<Post["poll"]>; vote?: string; onVote: (option: string) => void }) {
  const total = poll.options.reduce((n, o) => n + o.votes, 0) + (vote ? 1 : 0);
  return (
    <fieldset className="mt-3 flex flex-col gap-2">
      <legend className="sr-only">Poll</legend>
      {poll.options.map((o) => {
        const votes = o.votes + Number(vote === o.id);
        const percent = Math.round((votes / total) * 100);
        return (
          <label
            key={o.id}
            className={cx(
              "relative flex min-h-11 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border px-3",
              vote === o.id ? "border-[#008282]" : "border-line hover:border-[#3cb8b9]",
            )}
          >
            {vote && <span aria-hidden className="absolute inset-y-0 left-0 bg-[#3cb8b9]/20" style={{ width: `${percent}%` }} />}
            <input type="radio" name={`poll-${postId}`} checked={vote === o.id} onChange={() => onVote(o.id)} className="relative accent-[#008282]" />
            <span className="relative flex-1 text-sm font-medium">{o.label}</span>
            {vote && <span className="relative text-sm font-semibold tabular-nums">{percent}%</span>}
          </label>
        );
      })}
      <p className="text-xs text-ink-muted">
        {total} votes{vote ? " · you can change your vote" : " · vote to see the results"}
      </p>
    </fieldset>
  );
}

// ---------- Events ----------

function eventDate(e: CommunityEvent) {
  const d = new Date();
  d.setDate(d.getDate() + e.inDays);
  return d;
}
function timeLabel(e: CommunityEvent) {
  const h = ((e.hour + 11) % 12) + 1;
  return `${h}:${String(e.minutes).padStart(2, "0")} ${e.hour < 12 ? "am" : "pm"} AEDT`;
}

function DateBlock({ event, hydrated, small }: { event: CommunityEvent; hydrated: boolean; small?: boolean }) {
  // Dates are worked out in the browser only: "today" on the server would be fixed at build time.
  const d = hydrated ? eventDate(event) : null;
  return (
    <span
      className={cx(
        "flex shrink-0 flex-col items-center justify-center rounded-xl bg-[#fab53d] font-mulish text-[#102a43] shadow-sm",
        small ? "size-12" : "size-16",
      )}
      aria-hidden
    >
      <span className={cx("font-extrabold uppercase", small ? "text-[0.6rem]" : "text-xs")}>
        {d?.toLocaleDateString("en-AU", { month: "short" })}
      </span>
      <span className={cx("font-extrabold leading-none", small ? "text-lg" : "text-2xl")}>{d?.getDate()}</span>
    </span>
  );
}

function Events({ mine, update, hydrated }: { mine: Mine; update: Update; hydrated: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-4">
        <h2 className="font-serif text-2xl font-semibold">Upcoming events</h2>
        {events.map((e) => {
          const going = mine.going.includes(e.id);
          const host = memberById(e.host)!;
          return (
            <article key={e.id} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:p-5">
              <DateBlock event={e} hydrated={hydrated} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#008282] dark:text-[#3cb8b9]">
                  {hydrated ? eventDate(e).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }) : ""} · {timeLabel(e)} · {e.where}
                </p>
                <h3 className="mt-1 font-serif text-xl font-semibold leading-snug">{e.title}</h3>
                <p className="mt-1 text-ink-muted">{e.blurb}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <Avatar person={host} size="xs" /> Hosted by {host.name}
                  </span>
                  <span className="text-sm text-ink-muted">· {e.going + Number(going)} going</span>
                </div>
              </div>
              <button
                type="button"
                aria-pressed={going}
                onClick={() => update((m) => ({ ...m, going: going ? m.going.filter((x) => x !== e.id) : [...m.going, e.id] }))}
                className={cx(
                  "inline-flex min-h-11 items-center justify-center gap-1.5 self-start rounded-full px-5 font-semibold",
                  going ? "bg-tealtint text-ink ring-1 ring-[#008282]" : "bg-[#008282] text-white hover:bg-[#006b6b]",
                )}
              >
                {going ? (
                  <>
                    <Icon name="check" className="size-4" /> You’re going
                  </>
                ) : (
                  "I’m going"
                )}
              </button>
            </article>
          );
        })}
      </div>
      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl bg-[#1d2b4f] p-5 text-white">
          <h2 className="font-serif text-xl font-semibold">Host your own</h2>
          <p className="mt-2 text-white/85">
            Got something others could learn from? Run a 30-minute session for the community. We’ll set up the call and send the invites.
          </p>
          <p className="mt-3 text-sm text-white/70">Post in “Start here” and the Community host will be in touch.</p>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Recently</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>📝 Falls Q&amp;A notes, shared in Clinical corner</li>
            <li>🎥 Recording: Dementia-friendly visits</li>
            <li>☕ 31 people at last Friday’s virtual cuppa</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}

// ---------- Members ----------

const ROLE_GROUPS = [
  { id: "all", label: "Everyone", match: () => true },
  { id: "clinical", label: "Clinical", match: (m: Member) => /nurse|physio|occupational|podiatr|dietit/i.test(m.role) },
  { id: "home", label: "Home & garden", match: (m: Member) => /garden|clean|handyman/i.test(m.role) },
  { id: "coordinators", label: "Coordinators", match: (m: Member) => /coordinator|host/i.test(m.role) },
  { id: "support", label: "Support workers", match: (m: Member) => /support worker/i.test(m.role) },
] as const;

function Members() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<(typeof ROLE_GROUPS)[number]["id"]>("all");
  const q = query.trim().toLowerCase();
  const shown = members.filter(
    (m) =>
      ROLE_GROUPS.find((g) => g.id === group)!.match(m) &&
      (!q || [m.name, m.role, m.region, ...m.askMeAbout].some((s) => s.toLowerCase().includes(q))),
  );
  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold">Find someone who’s been there</h2>
          <p className="text-ink-muted">Search by name, role, place or what people are happy to be asked about.</p>
        </div>
        <label className="relative block lg:w-80">
          <span className="sr-only">Search members</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “falls” or “Newcastle”"
            className="min-h-11 w-full rounded-full border border-line bg-surface pl-9 pr-4"
          />
        </label>
      </div>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by role">
        {ROLE_GROUPS.map((g) => (
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
      <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3">
              <Avatar person={m} size="lg" level={levelFor(m.points.all).level} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  {m.name}
                  {m.online && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1f8a52] dark:text-[#7ef0a6]">
                      <span className="size-2 rounded-full bg-[#2fbf71]" aria-hidden /> Online
                    </span>
                  )}
                </p>
                <p className="text-sm text-ink-muted">{m.role}</p>
                <p className="text-sm text-ink-muted">
                  <Icon name="pin" className="mr-1 inline size-3.5" />
                  {m.region}
                </p>
              </div>
            </div>
            <p className="text-sm">{m.bio}</p>
            <div className="mt-auto">
              <p className="font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-ink-muted">Ask me about</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {m.askMeAbout.map((t) => (
                  <li key={t} className="rounded-full bg-tealtint px-2.5 py-1 text-xs font-medium">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-ink-muted">
              Member for {m.joinedMonthsAgo >= 12 ? `${Math.floor(m.joinedMonthsAgo / 12)} year${m.joinedMonthsAgo >= 24 ? "s" : ""}` : `${m.joinedMonthsAgo} months`} ·{" "}
              {m.points.all.toLocaleString("en-AU")} points
            </p>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-ink-muted">No one matches that yet.</p>}
    </div>
  );
}

// ---------- Leaderboard ----------

const PERIODS = [
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All time" },
] as const;

function Leaderboard({ you, yourPoints }: { you: You; yourPoints: number }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("week");
  const ranked = [...members].sort((a, b) => b.points[period] - a.points[period]);
  const yours = levelFor(yourPoints);
  const atLevel = (lvl: number) => Math.round((members.filter((m) => levelFor(m.points.all).level === lvl).length / members.length) * 100);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-semibold">Leaderboard</h2>
          <div className="flex rounded-full bg-muted p-1 text-sm font-semibold" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={cx("min-h-9 rounded-full px-4", period === p.id ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <ol className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          {ranked.map((m, i) => (
            <li key={m.id} className={cx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-line")}>
              <span
                className={cx(
                  "grid size-8 shrink-0 place-items-center rounded-full font-mulish text-sm font-extrabold",
                  i === 0 ? "bg-[#fab53d] text-[#102a43]" : i === 1 ? "bg-[#d9dee5] text-[#102a43]" : i === 2 ? "bg-[#e7b48a] text-[#102a43]" : "text-ink-muted",
                )}
              >
                {i + 1}
              </span>
              <Avatar person={m} size="sm" level={levelFor(m.points.all).level} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{m.name}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {m.role} · {m.region}
                </span>
              </span>
              <span className="font-mulish font-extrabold tabular-nums text-[#008282] dark:text-[#3cb8b9]">
                {period === "all" ? "" : "+"}
                {m.points[period].toLocaleString("en-AU")}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-2xl bg-[#1d2b4f] p-5 text-white">
          <div className="flex items-center gap-4">
            <Avatar person={you} size="lg" level={yours.level} ring="ring-[#1d2b4f]" />
            <div>
              <p className="font-serif text-xl font-semibold">Level {yours.level}</p>
              <p className="text-sm text-white/80">
                {yours.next === null ? "Top level. Legend." : `${yours.toNext} ${yours.toNext === 1 ? "point" : "points"} to level ${yours.level + 1}`}
              </p>
            </div>
          </div>
          {yours.next !== null && (
            <span className="mt-4 block h-2 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <span
                className="block h-full rounded-full bg-[#fab53d]"
                style={{ width: `${Math.round(((yourPoints - LEVELS[yours.level - 1]) / (yours.next - LEVELS[yours.level - 1])) * 100)}%` }}
              />
            </span>
          )}
          <p className="mt-4 text-sm text-white/85">
            You earn a point each time someone likes your post or reply. In this demo, every post and reply you share counts as one.
          </p>
        </section>
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Levels</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {LEVELS.map((min, i) => (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={cx(
                    "grid size-6 place-items-center rounded-full font-mulish text-xs font-extrabold",
                    yours.level === i + 1 ? "bg-[#fab53d] text-[#102a43]" : "bg-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="flex-1">{min.toLocaleString("en-AU")} points</span>
                <span className="text-xs text-ink-muted">{atLevel(i + 1)}% of members</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

/** Care Conversations' card of the week, for everyone to add a perspective to. Shown once in the browser, where "this week" is known. */
function WeekCard() {
  const card = cardOfTheWeek(new Date());
  const theme = themeOf(card.theme);
  const shared = perspectives.filter((p) => p.cardId === card.id).length;
  return (
    <Link href="/play/conversations" className="group block overflow-hidden rounded-2xl ring-1 ring-line hover:ring-[#008282]">
      <span className="block p-4" style={{ background: theme.colour, color: theme.ink }}>
        <span className="block font-mulish text-[0.7rem] font-extrabold uppercase tracking-[0.14em] opacity-90">
          Card of the week · {theme.emoji} {theme.name}
        </span>
        <span className="mt-2 block font-serif text-lg font-semibold leading-snug">{card.question}</span>
      </span>
      <span className="flex items-center justify-between gap-2 bg-surface px-4 py-3 text-sm font-semibold text-accent">
        {shared ? `${shared} ${shared === 1 ? "perspective" : "perspectives"} shared · add yours` : "Be the first to share a perspective"}
        <Icon name="arrow-right" className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
