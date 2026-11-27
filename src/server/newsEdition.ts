import "server-only";
import { randomUUID } from "node:crypto";
import type { Story } from "@/content/stories";
import { events } from "@/content/community";
import { textHash } from "@/lib/magazineNarration";
import { audit, type Db } from "./db";
import { canAuthor, HttpError, meantFor, type User } from "./auth";
import { catalogueTopics } from "./catalogue";
import { learnerGuides } from "./magazine";
import { momentFeed } from "./lifeMoments";
import { openPolicyAcksFor } from "./policyAcks";
import { makeRecording } from "./magazineNarration";
import type { NarrationAudio } from "@/lib/magazine";
import { cleanCues, cueTimes, CUE_SECTIONS, timedCues, type BriefingCue, type TimedCue } from "@/lib/briefingCues";

/*
  The homepage news as a living edition (the owner, Nov 2026). The broadsheet layout stays; around it:

  - an edition masthead that knows each person's previous visit: the month's edition, today's date, how many stories
    are new since they were last here, and when the news last changed;
  - a featured story chosen for each person on arrival: a priority announcement first, then the pinned editorial
    feature until they've read it, then unread stories that are seasonal or for their role, then the newest unread, and
    an archive story worth revisiting when there's nothing new. Up to three, to browse; never rotating by itself;
  - News in Brief from the rest of the Hub: new Topics and courses, Life Moments, Community events and policy updates,
    so the news changes even when nobody has written an article;
  - From the archive: an older story that's relevant now, with its original date;
  - The Trilogy Briefing: a short weekly audio bulletin, drafted from the week's news by rules, edited and approved by an
    author, and read in the Magazine Editorial Voice;
  - The weekly question: one question an author sets, answered in a tap, with the results after you answer.

  Reads and visits are kept per person on the server, so the same person sees the same thing on any device.
*/

const TZ = "Australia/Sydney";
const DAY = 86_400_000;
/** A new visit after this long away; reloading within it keeps the same "since your last visit". */
const SESSION_MS = 45 * 60_000;

export function ensureNews(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_visits (user_id TEXT PRIMARY KEY, last_at TEXT NOT NULL, previous_at TEXT);
    CREATE TABLE IF NOT EXISTS news_reads (user_id TEXT NOT NULL, slug TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (user_id, slug));
    CREATE TABLE IF NOT EXISTS news_briefings (
      week TEXT PRIMARY KEY, script TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', audio TEXT,
      approved_by TEXT, approved_at TEXT, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news_questions (
      id TEXT PRIMARY KEY, question TEXT NOT NULL, options TEXT NOT NULL, starts_on TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS news_answers (
      question_id TEXT NOT NULL, user_id TEXT NOT NULL, option_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (question_id, user_id)
    );
  `);
  // The briefing's narration cues (Nov 2026), added to the table after it was first made.
  if (!(db.prepare("PRAGMA table_info(news_briefings)").all() as { name: string }[]).some((c) => c.name === "cues"))
    db.exec("ALTER TABLE news_briefings ADD COLUMN cues TEXT");
}

// ---------------------------------------------------------------------------------------------
// Visits and reads
// ---------------------------------------------------------------------------------------------

/** Notes this homepage visit and gives back when they were last here before it (null on a first visit). */
export function recordNewsVisit(db: Db, user: User, now: Date): string | null {
  ensureNews(db);
  const at = now.toISOString();
  const r = db.prepare("SELECT last_at, previous_at FROM news_visits WHERE user_id = ?").get(user.id) as
    { last_at: string; previous_at: string | null } | undefined;
  if (!r) {
    db.prepare("INSERT INTO news_visits (user_id, last_at, previous_at) VALUES (?, ?, NULL)").run(user.id, at);
    return null;
  }
  // Still the same visit (a reload, back from a story): the same "since your last visit".
  if (now.getTime() - Date.parse(r.last_at) < SESSION_MS) {
    db.prepare("UPDATE news_visits SET last_at = ? WHERE user_id = ?").run(at, user.id);
    return r.previous_at;
  }
  db.prepare("UPDATE news_visits SET previous_at = last_at, last_at = ? WHERE user_id = ?").run(at, user.id);
  return r.last_at;
}

export function markStoryRead(db: Db, user: User, slug: unknown, now: Date) {
  ensureNews(db);
  if (typeof slug !== "string" || !/^[\w-]{1,120}$/.test(slug)) throw new HttpError(400, "Which story?");
  db.prepare("INSERT INTO news_reads (user_id, slug, at) VALUES (?, ?, ?) ON CONFLICT (user_id, slug) DO NOTHING").run(user.id, slug, now.toISOString());
  return { ok: true };
}

export function readSlugs(db: Db, user: User): Set<string> {
  ensureNews(db);
  return new Set((db.prepare("SELECT slug FROM news_reads WHERE user_id = ?").all(user.id) as { slug: string }[]).map((r) => r.slug));
}

// ---------------------------------------------------------------------------------------------
// The featured story
// ---------------------------------------------------------------------------------------------

/** The season a story can belong to, by its words: Christmas and the holidays, winter, or summer heat. */
const SEASONS: { re: RegExp; active: (now: Date) => boolean }[] = [
  {
    re: /christmas|festive|holiday|new year/i,
    active: (d) => (d.getUTCMonth() === 10 && d.getUTCDate() >= 10) || d.getUTCMonth() === 11 || (d.getUTCMonth() === 0 && d.getUTCDate() <= 6),
  },
  { re: /\bwinter\b|\bcold\b|\bflu\b/i, active: (d) => d.getUTCMonth() >= 4 && d.getUTCMonth() <= 7 },
  { re: /\bheat(wave)?\b|\bsummer\b|bushfire/i, active: (d) => d.getUTCMonth() === 11 || d.getUTCMonth() <= 1 },
];
export const isSeasonal = (s: Story, now: Date) => SEASONS.some((x) => x.active(now) && x.re.test(`${s.title} ${s.dek}`));
const pinned = (s: Story, now: Date) => s.featured === true && (!s.featuredUntil || now.toISOString().slice(0, 10) <= s.featuredUntil);
const priority = (s: Story, now: Date) => s.priority === true && now.getTime() - Date.parse(s.date) < 30 * DAY;
/** Written for this person's part of the business only (not for everyone). */
const forRole = (s: Story, user: User) => s.audience.length === 1 && (s.audience as string[]).includes(user.audience);

export type FeaturedReason = "priority" | "feature" | "seasonal" | "role" | "new" | "archive";

/**
  The featured stories, in the order the reader browses them (the owner, Nov 2026): only stories an author has ticked
  "Feature on the homepage" (until their pinned-until date) and priority announcements (for 30 days, until this person
  has read one). Unread before read, then newest first, up to five. With nothing ticked, the newest story leads, so the
  front page is never empty. Chosen on arrival; they never change by themselves while someone is reading.
*/
export function featuredFor(stories: Story[], user: User, read: Set<string>, now: Date): { story: Story; reason: FeaturedReason }[] {
  const urgent = (s: Story) => priority(s, now) && !read.has(s.slug);
  const chosen = stories
    .filter((s) => urgent(s) || pinned(s, now))
    .sort((a, b) => Number(urgent(b)) - Number(urgent(a)) || Number(read.has(a.slug)) - Number(read.has(b.slug)) || b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((s) => ({ story: s, reason: (urgent(s) ? "priority" : "feature") as FeaturedReason }));
  if (chosen.length) return chosen;
  const newest = [...stories].sort((a, b) => b.date.localeCompare(a.date))[0];
  return newest ? [{ story: newest, reason: "new" }] : [];
}

/** From the archive: an older story worth revisiting now (seasonal, for their role, or unread), never presented as new. */
export function archivePick(stories: Story[], user: User, read: Set<string>, exclude: Set<string>, now: Date): Story | null {
  const old = stories.filter((s) => now.getTime() - Date.parse(s.date) > 30 * DAY && !exclude.has(s.slug) && !s.policy);
  const score = (s: Story) => (isSeasonal(s, now) ? 30 : 0) + (forRole(s, user) ? 20 : 0) + (read.has(s.slug) ? 0 : 15) + (s.category === "case-study" ? 5 : 0);
  return old.sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date))[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// The edition masthead
// ---------------------------------------------------------------------------------------------

const dateIn = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-AU", { timeZone: TZ, ...opts });
const dayKey = (d: Date) => dateIn(d, { year: "numeric", month: "2-digit", day: "2-digit" });

/** "Updated this morning", "Updated this afternoon", "Updated yesterday", "Updated on Tuesday", "Updated 12 Nov". */
export function updatedLabel(at: Date, now: Date) {
  if (dayKey(at) === dayKey(now)) {
    const hour = Number(at.toLocaleTimeString("en-AU", { timeZone: TZ, hour: "numeric", hour12: false }));
    return hour < 12 ? "Updated this morning" : hour < 17 ? "Updated this afternoon" : "Updated this evening";
  }
  if (dayKey(new Date(at.getTime() + DAY)) === dayKey(now)) return "Updated yesterday";
  if (now.getTime() - at.getTime() < 6 * DAY) return `Updated on ${dateIn(at, { weekday: "long" })}`;
  return `Updated ${dateIn(at, { day: "numeric", month: "short" })}`;
}

export type Edition = { edition: string; date: string; since: string; updated: string };

export function editionOf(stories: Story[], brief: BriefItem[], previous: string | null, now: Date): Edition {
  const newCount = previous ? stories.filter((s) => s.date > previous).length : 0;
  const newBrief = previous ? brief.filter((b) => b.at > previous).length : 0;
  const latest = [...stories.map((s) => s.updated ?? s.date), ...brief.map((b) => b.at)]
    .filter((x) => x <= now.toISOString())
    .sort()
    .at(-1);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const since = !previous
    ? `${plural(stories.length, "story", "stories")} in this edition`
    : newCount && newBrief
      ? `${plural(newCount, "new story", "new stories")} and ${plural(newBrief, "update", "updates")} since your last visit`
      : newCount
        ? `${plural(newCount, "new story", "new stories")} since your last visit`
        : newBrief
          ? `${plural(newBrief, "new update", "new updates")} since your last visit`
          : "Nothing new since your last visit";
  return {
    edition: `${dateIn(now, { month: "long" })} edition`,
    date: dateIn(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    since,
    updated: latest ? updatedLabel(new Date(latest), now) : "",
  };
}

// ---------------------------------------------------------------------------------------------
// News in Brief: the rest of the Hub, as short items
// ---------------------------------------------------------------------------------------------

export type BriefKind = "New this week" | "Meanwhile, in their lives" | "The week ahead" | "Policy update" | "New on the Hub";
export type BriefItem = { id: string; kind: BriefKind; title: string; text: string; href: string; at: string; when: string };

/** "This morning", "Today", "Yesterday", "Earlier this week", "Last week", or "Coming up" for an event ahead. */
export function whenLabel(at: Date, now: Date) {
  if (at.getTime() > now.getTime()) return "Coming up";
  if (dayKey(at) === dayKey(now))
    return Number(at.toLocaleTimeString("en-AU", { timeZone: TZ, hour: "numeric", hour12: false })) < 12 ? "This morning" : "Today";
  if (dayKey(new Date(at.getTime() + DAY)) === dayKey(now)) return "Yesterday";
  return now.getTime() - at.getTime() < 6 * DAY ? "Earlier this week" : "Last week";
}

const clip = (s: string, n = 150) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

export function newsBrief(db: Db, user: User, now: Date, limit = 4): BriefItem[] {
  const recent = (iso: string | null | undefined, days = 21) =>
    Boolean(iso) && now.getTime() - Date.parse(iso!) < days * DAY && Date.parse(iso!) <= now.getTime();
  const items: BriefItem[] = [];
  // New Topics and courses for this person.
  for (const t of catalogueTopics(db, user.id))
    if (recent(t.publishedAt, 14))
      items.push({
        id: `topic:${t.slug}`,
        kind: "New this week",
        title: `New topic: ${t.title}`,
        text: clip(t.summary),
        href: `/topics/${t.slug}`,
        at: t.publishedAt!,
        when: "",
      });
  for (const g of learnerGuides(db, user, now))
    if (recent(g.publishedAt, 14))
      items.push({
        id: `course:${g.slug}`,
        kind: "New on the Hub",
        title: `New in the Magazine: ${g.title}`,
        text: clip(g.standfirst),
        href: `/magazine/${g.slug}`,
        at: g.publishedAt,
        when: "",
      });
  // The Digital Members' lives, carrying on.
  try {
    const feed = momentFeed(db, user, now)
      .cards.filter((c) => c.kind === "moment" && recent(c.publishedAt, 7))
      .slice(0, 1);
    for (const m of feed)
      items.push({
        id: `moment:${m.id}`,
        kind: "Meanwhile, in their lives",
        title: m.headline,
        text: clip(m.body || m.quote || ""),
        href: "/community/moments",
        at: m.publishedAt,
        when: "",
      });
  } catch {
    // The moments feed is optional here: news never fails because of it.
  }
  // The week ahead: the next Community event.
  const next = events.filter((e) => e.inDays >= 0 && e.inDays <= 7).sort((a, b) => a.inDays - b.inDays)[0];
  if (next) {
    const at = new Date(now.getTime() + next.inDays * DAY);
    items.push({
      id: `event:${next.id}`,
      kind: "The week ahead",
      title: next.title,
      text: clip(next.blurb),
      href: "/community#events",
      at: at.toISOString(),
      when: "",
    });
  }
  // Policy updates this person is asked to acknowledge.
  for (const p of openPolicyAcksFor(db, user))
    items.push({
      id: `policy:${p.id}`,
      kind: "Policy update",
      title: p.title,
      text: clip(p.summary || `Read and acknowledge by ${p.dueOn}.`),
      href: p.href,
      at: p.createdAt,
      when: "",
    });
  // Newest first, an event ahead counting as now; one of each kind before a second of any.
  const order = items.sort((a, b) => Math.min(Date.parse(b.at), now.getTime()) - Math.min(Date.parse(a.at), now.getTime()));
  const picked: BriefItem[] = [];
  for (const pass of [0, 1, 2])
    for (const i of order) if (picked.length < limit && !picked.includes(i) && picked.filter((p) => p.kind === i.kind).length === pass) picked.push(i);
  return picked
    .sort((a, b) => Math.min(Date.parse(b.at), now.getTime()) - Math.min(Date.parse(a.at), now.getTime()))
    .map((i) => ({ ...i, when: whenLabel(new Date(i.at), now) }));
}

// ---------------------------------------------------------------------------------------------
// The Trilogy Briefing: a weekly audio bulletin
// ---------------------------------------------------------------------------------------------

/** The week an edition belongs to: its Monday, in Australian Eastern time. */
export function weekOf(now: Date) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const back = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - back);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

type BriefingRow = {
  week: string;
  script: string;
  status: string;
  audio: string | null;
  cues: string | null;
  approved_by: string | null;
  approved_at: string | null;
};
export type Briefing = { week: string; script: string; audio: NarrationAudio; cues: TimedCue[] };

const cuesOf = (r: BriefingRow | undefined) => (r?.cues ? cleanCues(JSON.parse(r.cues)) : []);
const headline = (title: string) => title.replace(/[.:]\s*$/, "").replace(/:\s+/, ": ");
/** A cue starts at the first words of its sentence. */
const opening = (sentence: string) => sentence.split(/\s+/).slice(0, 7).join(" ");

/** Why a cue can't be trusted any more: its story was unpublished or deleted, or its headline changed. Flags the briefing for review. */
export function cueProblems(cues: BriefingCue[], stories: Story[]) {
  return cues.flatMap((c) => {
    if (!c.target.startsWith("story:")) return [];
    const s = stories.find((x) => x.slug === c.target.slice(6));
    if (!s) return [{ id: c.id, problem: `“${c.targetTitle ?? c.target.slice(6)}” isn’t published any more.` }];
    if (c.targetTitle && c.targetTitle !== s.title) return [{ id: c.id, problem: `The story’s headline has changed to “${s.title}”.` }];
    return [];
  });
}

/**
  This week's briefing for learners: approved, recorded, and a recording of its script. With the cues it can play:
  timed, pointing at stories this person can see, and not flagged.
*/
export function currentBriefing(db: Db, now: Date, stories: Story[] = []): Briefing | null {
  ensureNews(db);
  const r = db.prepare("SELECT * FROM news_briefings WHERE week = ?").get(weekOf(now)) as BriefingRow | undefined;
  if (!r || r.status !== "approved" || !r.audio) return null;
  const audio = JSON.parse(r.audio) as NarrationAudio;
  if (audio.scriptHash !== textHash(r.script.trim())) return null;
  const cues = cuesOf(r);
  const bad = new Set(cueProblems(cues, stories).map((x) => x.id));
  return {
    week: r.week,
    script: r.script,
    audio,
    cues: timedCues(
      cues.filter((c) => !bad.has(c.id)),
      r.script,
      audio,
    ),
  };
}

/**
  A first draft of this week's briefing, from the stories and the Hub's week, with a cue for each thing it mentions: an
  author edits both before it's recorded. Every cue points at a published story or a part of the newspaper.
*/
export function draftBriefing(stories: Story[], brief: BriefItem[], now: Date, opts: { question?: boolean } = {}) {
  const week = stories.filter((s) => now.getTime() - Date.parse(s.date) < 10 * DAY).slice(0, 3);
  const lead = stories.find((s) => pinned(s, now)) ?? week[0] ?? stories[0];
  const policy = stories.find((s) => s.policy && s !== lead && now.getTime() - Date.parse(s.date) < 30 * DAY);
  const parts: { text: string; target: string; treatment: BriefingCue["treatment"]; title?: string }[] = [];
  parts.push({ text: "Here's what's happening across Trilogy Care this week.", target: "section:masthead", treatment: "rule" });
  if (lead) parts.push({ text: `Our feature is ${headline(lead.title)}.`, target: `story:${lead.slug}`, treatment: "headline", title: lead.title });
  for (const s of week.filter((x) => x !== lead && x !== policy).slice(0, 2))
    parts.push({ text: `There's also ${headline(s.title)}.`, target: `story:${s.slug}`, treatment: "headline", title: s.title });
  if (policy)
    parts.push({
      text: `And a policy update to know about: ${headline(policy.title)}.`,
      target: `story:${policy.slug}`,
      treatment: "rule",
      title: policy.title,
    });
  const items = brief
    .slice(0, 3)
    .map((b) =>
      b.kind === "The week ahead"
        ? `${b.title} coming up`
        : b.title.replace(/^New topic: /, "a new topic, ").replace(/^New in the Magazine: /, "a new course, "),
    );
  if (items.length)
    parts.push({
      text: `Across the Hub, there's ${items.length > 1 ? `${items.slice(0, -1).join("; ")}; and ${items.at(-1)}` : items[0]}.`,
      target: "section:brief",
      treatment: "tint",
    });
  parts.push(
    opts.question
      ? {
          text: "Have a look when you've got a moment, and answer this week's question. Thanks for everything you do.",
          target: "section:question",
          treatment: "tint",
        }
      : { text: "Have a look at the news when you've got a moment, and thanks for everything you do.", target: "section:masthead", treatment: "rule" },
  );
  const script = parts.map((x) => x.text).join(" ");
  const cues: BriefingCue[] = parts.map((x, i) => ({
    id: `c${i + 1}`,
    excerpt: opening(x.text),
    target: x.target,
    treatment: x.treatment,
    ...(x.title ? { targetTitle: x.title } : {}),
  }));
  return { script, cues };
}

/**
  Cues for a script written another way (or before cues existed): the opening points at the masthead, each published
  story whose headline it mentions at that story, and a mention of the weekly question at the question.
*/
export function suggestCues(script: string, stories: Story[], brief: BriefItem[] = []): BriefingCue[] {
  const lower = script.toLowerCase();
  const found: { at: number; cue: Omit<BriefingCue, "id"> }[] = [];
  const first = script.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  if (first) found.push({ at: 0, cue: { excerpt: opening(first), target: "section:masthead", treatment: "rule" } });
  for (const s of stories) {
    const title = headline(s.title);
    // The whole headline, or failing that its first five words.
    const probe = [title, title.split(/\s+/).slice(0, 5).join(" ")].find((t) => t.split(/\s+/).length >= 3 && lower.includes(t.toLowerCase()));
    if (!probe) continue;
    const at = lower.indexOf(probe.toLowerCase());
    found.push({
      at,
      cue: { excerpt: script.slice(at, at + probe.length), target: `story:${s.slug}`, treatment: s.policy ? "rule" : "headline", targetTitle: s.title },
    });
  }
  // The first News in Brief item it mentions points at News in Brief.
  const item = brief
    .map((b) => b.title.replace(/^New topic: |^New in the Magazine: /, ""))
    .map((t) => t.split(/\s+/).slice(0, 4).join(" "))
    .filter((t) => t.split(/\s+/).length >= 2)
    .map((t) => ({ t, at: lower.indexOf(t.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)[0];
  if (item) found.push({ at: item.at, cue: { excerpt: script.slice(item.at, item.at + item.t.length), target: "section:brief", treatment: "tint" } });
  const q = lower.search(/\b(weekly )?question\b/);
  if (q > 0) {
    // From the start of its own clause, so it follows anything else mentioned earlier in the sentence.
    const sentenceStart = Math.max(0, ...[".", ",", ";"].map((m) => lower.lastIndexOf(m, q) + 1));
    found.push({ at: sentenceStart, cue: { excerpt: opening(script.slice(sentenceStart).trim()), target: "section:question", treatment: "tint" } });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .filter((x, i, all) => i === 0 || x.at !== all[i - 1].at)
    .map((x, i) => ({ id: `c${i + 1}`, ...x.cue }));
}

const requireAuthor = (u: User) => {
  if (!canAuthor(u)) throw new HttpError(403, "Only learning authors can edit the news edition.");
};

export function briefingAdmin(db: Db, actor: User, stories: Story[], brief: BriefItem[], now: Date) {
  requireAuthor(actor);
  ensureNews(db);
  const week = weekOf(now);
  const r = db.prepare("SELECT * FROM news_briefings WHERE week = ?").get(week) as BriefingRow | undefined;
  const audio = r?.audio ? (JSON.parse(r.audio) as NarrationAudio) : null;
  const draft = draftBriefing(stories, brief, now, { question: Boolean(activeRow(db, now)) });
  const script = r?.script ?? draft.script;
  const cues = r?.cues ? cuesOf(r) : r ? suggestCues(script, stories, brief) : draft.cues;
  return {
    week,
    script,
    cues,
    /** Cues an author hasn't saved yet: suggested for a script that has none. */
    cuesSuggested: !r?.cues,
    problems: cueProblems(cues, stories),
    saved: Boolean(r),
    status: (r?.status ?? "draft") as "draft" | "approved",
    audio,
    matches: Boolean(audio && r && audio.scriptHash === textHash(r.script.trim())),
    approvedBy: r?.approved_by ?? null,
    approvedAt: r?.approved_at ?? null,
    draft,
    targets: [...CUE_SECTIONS, ...stories.map((s) => ({ id: `story:${s.slug}`, label: s.title }))],
  };
}

/** For the editor's preview: when each cue would play in this recording (by hand, from the word timings, or not yet). */
export const briefingCueTimes = (cues: BriefingCue[], script: string, audio: NarrationAudio | null) => cueTimes(cues, script, audio);

export async function briefingAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureNews(db);
  const week = weekOf(now);
  const at = now.toISOString();
  const r = db.prepare("SELECT * FROM news_briefings WHERE week = ?").get(week) as BriefingRow | undefined;
  const save = (script: string, status: "draft" | "approved", audio: string | null, by: string | null, when: string | null, cues: string | null) =>
    db
      .prepare(
        `INSERT INTO news_briefings (week, script, status, audio, cues, approved_by, approved_at, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (week) DO UPDATE SET script = excluded.script, status = excluded.status, audio = excluded.audio, cues = excluded.cues,
           approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      )
      .run(week, script, status, audio, cues, by, when, actor.id, at);
  const script = typeof input.script === "string" ? input.script.trim().slice(0, 1200) : (r?.script ?? "");
  // Cues sent with the request replace the saved ones; otherwise the saved ones stay. Changing cues never needs a new recording.
  const cues = Array.isArray(input.cues) ? JSON.stringify(cleanCues(input.cues)) : (r?.cues ?? null);
  if (input.action === "save") {
    if (!script) throw new HttpError(400, "Write the briefing first.");
    // A changed script needs recording (and approving) again.
    const keep = r && r.script.trim() === script ? r : null;
    save(script, keep?.status === "approved" ? "approved" : "draft", keep?.audio ?? null, keep?.approved_by ?? null, keep?.approved_at ?? null, cues);
  } else if (input.action === "record") {
    if (!script) throw new HttpError(400, "Write the briefing first.");
    const audio = await makeRecording(db, actor, `briefing:${week}`, { script, voice: "profile:editorial", target: "news briefing" }, now);
    save(script, "draft", JSON.stringify(audio), null, null, cues);
  } else if (input.action === "approve") {
    if (!r?.audio) throw new HttpError(400, "Record the briefing before approving it.");
    if ((JSON.parse(r.audio) as NarrationAudio).scriptHash !== textHash(r.script.trim()))
      throw new HttpError(400, "The script has changed since it was recorded. Record it again.");
    save(r.script, "approved", r.audio, actor.name, at, cues);
    audit(db, { actor: actor.id, event: "news.briefing_approved", entity: `briefing:${week}`, at: now });
  } else if (input.action === "unapprove") {
    if (r) save(r.script, "draft", r.audio, null, null, cues);
  } else throw new HttpError(400, "Unknown action.");
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// The weekly question
// ---------------------------------------------------------------------------------------------

type QuestionRow = { id: string; question: string; options: string; starts_on: string; closed_at: string | null };
export type WeeklyQuestion = {
  id: string;
  question: string;
  options: { id: string; text: string }[];
  /** Yours, once you've answered: then the results show. */
  mine: string | null;
  results: { id: string; count: number }[] | null;
  total: number;
};

const activeRow = (db: Db, now: Date) =>
  db
    .prepare("SELECT * FROM news_questions WHERE closed_at IS NULL AND starts_on <= ? ORDER BY starts_on DESC, created_at DESC LIMIT 1")
    .get(now.toISOString().slice(0, 10)) as QuestionRow | undefined;

export function weeklyQuestion(db: Db, user: User, now: Date): WeeklyQuestion | null {
  ensureNews(db);
  const r = activeRow(db, now);
  if (!r) return null;
  const options = JSON.parse(r.options) as { id: string; text: string }[];
  const mine =
    (db.prepare("SELECT option_id FROM news_answers WHERE question_id = ? AND user_id = ?").get(r.id, user.id) as { option_id: string } | undefined)
      ?.option_id ?? null;
  const counts = new Map(
    (
      db.prepare("SELECT option_id, COUNT(*) AS n FROM news_answers WHERE question_id = ? GROUP BY option_id").all(r.id) as { option_id: string; n: number }[]
    ).map((x) => [x.option_id, x.n]),
  );
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return { id: r.id, question: r.question, options, mine, results: mine ? options.map((o) => ({ id: o.id, count: counts.get(o.id) ?? 0 })) : null, total };
}

export function answerQuestion(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensureNews(db);
  const r = activeRow(db, now);
  if (!r || r.id !== input.questionId) throw new HttpError(409, "That question has closed.");
  const options = JSON.parse(r.options) as { id: string }[];
  if (!options.some((o) => o.id === input.optionId)) throw new HttpError(400, "Choose one of the answers.");
  db.prepare(
    "INSERT INTO news_answers (question_id, user_id, option_id, at) VALUES (?, ?, ?, ?) ON CONFLICT (question_id, user_id) DO UPDATE SET option_id = excluded.option_id, at = excluded.at",
  ).run(r.id, user.id, input.optionId as string, now.toISOString());
  return weeklyQuestion(db, user, now);
}

/** For the News admin: the question that's showing, and setting a new one (which closes the last). */
export function questionAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureNews(db);
  const r = activeRow(db, now);
  if (!r) return null;
  const q = weeklyQuestion(db, actor, now)!;
  const counts = new Map(
    (
      db.prepare("SELECT option_id, COUNT(*) AS n FROM news_answers WHERE question_id = ? GROUP BY option_id").all(r.id) as { option_id: string; n: number }[]
    ).map((x) => [x.option_id, x.n]),
  );
  return { ...q, startsOn: r.starts_on, results: q.options.map((o) => ({ id: o.id, count: counts.get(o.id) ?? 0 })) };
}

export function setQuestion(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureNews(db);
  if (input.action === "close") {
    db.prepare("UPDATE news_questions SET closed_at = ? WHERE closed_at IS NULL").run(now.toISOString());
    return { ok: true };
  }
  const question = typeof input.question === "string" ? input.question.trim().slice(0, 200) : "";
  if (question.length < 5) throw new HttpError(400, "Write the question.");
  const options = (Array.isArray(input.options) ? input.options : [])
    .map((o) => (typeof o === "string" ? o.trim().slice(0, 80) : ""))
    .filter(Boolean)
    .slice(0, 5);
  if (options.length < 2) throw new HttpError(400, "Give at least two answers to choose from.");
  db.prepare("UPDATE news_questions SET closed_at = ? WHERE closed_at IS NULL").run(now.toISOString());
  db.prepare("INSERT INTO news_questions (id, question, options, starts_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    `nq-${randomUUID().slice(0, 12)}`,
    question,
    JSON.stringify(options.map((text, i) => ({ id: `o${i + 1}`, text }))),
    now.toISOString().slice(0, 10),
    actor.id,
    now.toISOString(),
  );
  audit(db, { actor: actor.id, event: "news.question_set", entity: "news", next: { question }, at: now });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Everything the homepage news needs, for one person
// ---------------------------------------------------------------------------------------------

export function newsEdition(db: Db, user: User, all: Story[], now: Date) {
  const stories = all.filter((s) => meantFor(user, s.audience) && Date.parse(s.date) <= now.getTime() + DAY).sort((a, b) => b.date.localeCompare(a.date));
  const previous = recordNewsVisit(db, user, now);
  const read = readSlugs(db, user);
  const featured = featuredFor(stories, user, read, now);
  const brief = newsBrief(db, user, now);
  const archive = archivePick(stories, user, read, new Set(featured.map((f) => f.story.slug)), now);
  return {
    stories,
    featured: featured.map((f) => ({ slug: f.story.slug, reason: f.reason })),
    edition: editionOf(stories, brief, previous, now),
    since: previous,
    read: [...read],
    brief,
    archive: archive?.slug ?? null,
    briefing: currentBriefing(db, now, stories),
    question: weeklyQuestion(db, user, now),
  };
}
export type NewsEdition = ReturnType<typeof newsEdition>;
