import "server-only";
import { randomUUID } from "node:crypto";
import { lessonBySlug, type Card, type Lesson } from "@/content/lessons";
import { resources } from "@/content/resources";
import { storyBySlug, type StoryBlock } from "@/content/stories";
import { applyFacts } from "@/lib/facts";
import { isLanguage } from "@/lib/languages";
import { pageBlocks, pageTitle, type Block, type GuideDoc } from "@/lib/magazine";
import { normText } from "@/lib/passageMatch";
import { AID_CLIENT_EVENTS, AID_TEMPLATES, checksum, REVIEW_DECISIONS, type AidEvent, type ReviewDecision } from "@/lib/playbook";
import { identifierWarnings } from "@/lib/redpen";
import { plainText } from "@/lib/richText";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { missionLock } from "./challenges";
import { factValues } from "./facts";
import { translationIfReady } from "./lessonTranslations";
import { readGuide } from "./magazine";
import { ensurePlaybooks as ensurePlaybookSeed, markViewed, playbookList, recordAidEvent, resolveSnippet } from "./playbooks";
import { plannerEligible, TOOL_HREF, TOOL_ID, TOOL_TITLE } from "./caseloadPlanner";
import { isPocketTool, pocketFavourite } from "./pocketTools";
import { CARD_PREFIX, referralCardFavourite } from "./referralStudio";
import { isMythTarget, mythStanding } from "./myths";

/*
  Favourites and highlights (docs/job-aids.md). One private list per person: whole Job Aids and passages they
  highlighted in approved text. A way back to content, never a qualification, an assignment or a source of
  authority.

  - A saved aid always opens at its current approved release, and says so when that release is newer than the one
    the person last saw.
  - A saved passage keeps the words as published when it was saved. Every time it is listed or opened it is read
    against the source again: still there, moved, changed, or gone. An old quote is never shown as current
    guidance without saying so, and never shown at all once the source is withdrawn or closed to the person.
  - Only published text can be saved: the server checks a selection is really in the source, so a client's name or
    a note typed somewhere else can't be stored as a highlight.
  - Access is checked when something is saved and again every time it is listed or opened.

  Passages can be highlighted in a Magazine guide, a Job Aid, a Topic card, a news story and a Resources entry.
  Each is anchored to its source, the part of it the words were in, and the version they were saved from.
*/

export const PASSAGE_MIN = 12;
export const PASSAGE_MAX = 600;
/** Where a passage can be highlighted. The first two came first; the database is widened for the rest (ensurePassageKinds). */
export const PASSAGE_KINDS = ["guide", "aid", "topic", "news", "resource"] as const;
export type PassageKind = (typeof PASSAGE_KINDS)[number];
type FlatKind = Exclude<PassageKind, "guide" | "aid">;

const passageKindsReady = new WeakSet<object>();
/**
  Makes sure saved passages can come from every kind of source, for a database made when only guides and Job Aids
  could be highlighted. SQLite can't change a CHECK in place, so the rows are copied into a table that allows them
  all and it is swapped in (the same pattern as Favourites holding a tool, server/db ensureCaseload).
*/
export function ensurePassageKinds(db: Db) {
  if (passageKindsReady.has(db)) return;
  const t = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'saved_passages'").get() as { sql: string } | undefined;
  if (t && !t.sql.includes("'topic'")) {
    const cols = "id, user_id, source_kind, source_id, version, page_id, section_id, block_id, source_title, quote, hash, whole_section, created_at";
    db.exec(`BEGIN;
CREATE TABLE saved_passages_all_kinds (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source_kind TEXT NOT NULL CHECK (source_kind IN (${PASSAGE_KINDS.map((k) => `'${k}'`).join(", ")})), source_id TEXT NOT NULL,
  version TEXT NOT NULL, page_id TEXT NOT NULL DEFAULT '', section_id TEXT NOT NULL DEFAULT '', block_id TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL, hash TEXT NOT NULL, whole_section INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE (user_id, source_kind, source_id, hash)
);
INSERT INTO saved_passages_all_kinds (${cols}) SELECT ${cols} FROM saved_passages;
DROP TABLE saved_passages;
ALTER TABLE saved_passages_all_kinds RENAME TO saved_passages;
COMMIT;`);
  }
  passageKindsReady.add(db);
}
/** The playbook tables and their seed, then the wider saved passages table. */
function ensurePlaybooks(db: Db, now: Date) {
  ensurePlaybookSeed(db, now);
  ensurePassageKinds(db);
}

type FavRow = {
  id: string;
  user_id: string;
  kind: "job_aid" | "passage" | "tool";
  target_id: string;
  title: string;
  pinned: number;
  seen: string;
  saved_at: string;
  last_opened_at: string | null;
};
type PassageRow = {
  id: string;
  user_id: string;
  source_kind: PassageKind;
  source_id: string;
  version: string;
  page_id: string;
  section_id: string;
  block_id: string;
  source_title: string;
  quote: string;
  hash: string;
  whole_section: number;
  created_at: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
/** Text as it compares (lib/passageMatch): the page's marker finds a passage the same way. */
export { normText };
const SKIP = new Set([
  "id",
  "type",
  "src",
  "href",
  "poster",
  "captions",
  "position",
  "kind",
  "verdict",
  "style",
  "layout",
  "frame",
  "width",
  "template",
  "status",
  "scriptHash",
]);
/** Every word a block shows, in order, as plain text. */
export function blockWords(b: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown, key = "") => {
    if (SKIP.has(key)) return;
    if (typeof v === "string") out.push(plainText(v));
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(b);
  return out.join(" ").replace(/\s+/g, " ").trim();
}
const clipSentence = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return stop > max / 2 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
};
/** Short pieces of text read as sentences, for a whole-section save: each ends with a stop. */
const sentences = (parts: (string | undefined)[]) =>
  parts
    .map((s) => plainText(s ?? "").trim())
    .filter(Boolean)
    .map((s) => (/[.!?:…]$/.test(s) ? s : `${s}.`))
    .join(" ");

// ---------------------------------------------------------------------------------------------
// Topics, news and Resources: sources made of parts (a card, a paragraph, an entry)
// ---------------------------------------------------------------------------------------------

/** One part of a source a passage can sit in. `lead` is what Save this section keeps; empty for a heading. */
type Part = { id: string; section: string; words: string; lead: string; label: string };
type Flat = { kind: FlatKind; id: string; version: string; title: string; parts: Part[]; href: (part: string) => string; where: (part: Part) => string };

function cardPart(c: Card, also?: Card): Part {
  const words = (x: Card) =>
    [
      x.label,
      x.type === "wall" ? x.prompt : x.heading,
      x.body,
      x.keyPoints?.title,
      ...(x.keyPoints?.items.flatMap((i) => [i.title ?? "", i.text]) ?? []),
      x.keyPoints?.tip,
      x.detail?.title,
      ...(x.detail?.paragraphs ?? []),
    ]
      .map((s) => plainText(s ?? ""))
      .join(" ");
  return {
    id: c.id,
    section: c.id,
    // A reader in another language may have highlighted the translation: both count as what they read.
    words: also ? `${words(c)} ${words(also)}` : words(c),
    // Words that run on in `words`, so the saved section is found there again.
    lead: sentences([c.body]) || sentences(c.keyPoints?.items.flatMap((i) => [i.title, i.text]) ?? []) || sentences([c.heading]),
    label: plainText(c.heading || c.label),
  };
}

/**
  A Topic as this person may read it now: published, not deleted, and not a challenge mission that hasn't opened
  for them. Shared facts show their current values, as on the page. Anything else is not there to read.
*/
function readTopic(db: Db, user: User, slug: unknown, now: Date): Lesson {
  const live = lessonBySlug(str(slug, 120));
  if (!live || missionLock(db, user, live.slug, now)) throw new HttpError(404, "Topic not found.");
  return applyFacts(live, factValues(db));
}

const storyWords = (b: StoryBlock) =>
  b.type === "list"
    ? b.items.map(plainText).join(" ")
    : b.type === "image"
      ? (b.caption ?? "")
      : b.type === "quote"
        ? `${b.text} ${b.cite}`
        : plainText(b.text);

/** A source made of parts, as this person reads it now. Throws 404 when it isn't there for them. */
function flatSource(db: Db, user: User, kind: FlatKind, id: unknown, now: Date): Flat {
  if (kind === "topic") {
    const lesson = readTopic(db, user, id, now);
    const lang = user.language;
    const t = lang && lang !== "en" && isLanguage(lang) ? translationIfReady(db, lesson, lang) : null;
    return {
      kind,
      id: lesson.slug,
      version: lesson.version,
      title: lesson.title,
      parts: Object.values(lesson.nodes).map((c) => cardPart(c, t?.nodes[c.id])),
      href: (part) => `/topics/${lesson.slug}?card=${encodeURIComponent(part)}`,
      where: (part) => part.label,
    };
  }
  if (kind === "news") {
    const story = storyBySlug(str(id, 120));
    // Unpublished or deleted: storyBySlug only has what's live.
    if (!story) throw new HttpError(404, "Story not found.");
    // A section runs from one subheading to the next; "s0" is the opening, before the first.
    let section = "s0";
    const parts = story.body.map((b, i) => {
      if (b.type === "h2") section = `s${i}`;
      const words = storyWords(b);
      return { id: `p${i}`, section, words, lead: b.type === "p" || b.type === "list" || b.type === "quote" ? sentences([words]) : "", label: "" };
    });
    return {
      kind,
      id: story.slug,
      version: story.updated ?? story.date,
      title: story.title,
      parts,
      href: () => `/news/${story.slug}`,
      where: (part) => `#hl-${part.id}`,
    };
  }
  // One Resources entry is one source: its own date says when it changed.
  const r = resources.find((x) => x.id === str(id, 120));
  if (!r) throw new HttpError(404, "Resource not found.");
  return {
    kind,
    id: r.id,
    version: r.updated,
    title: r.title,
    parts: [
      { id: r.id, section: r.id, words: [r.kind, r.title, r.description, ...r.points].join(" "), lead: sentences([r.description, ...r.points]), label: "" },
    ],
    href: () => "/resources",
    where: () => `#${r.id}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Where a passage stands against its source, now
// ---------------------------------------------------------------------------------------------

export type PassageState = "current" | "moved" | "superseded" | "unavailable";
type Standing = {
  state: PassageState;
  /** The source has been published again since the passage was saved. */
  changed: boolean;
  current: string;
  href: string;
  sourceTitle: string;
  where: string;
  /** Where the words are now (the page, and the block or part), when they're there. */
  at: { page: string; block: string } | null;
};

function findInGuide(doc: GuideDoc, p: Pick<PassageRow, "page_id" | "block_id" | "quote">) {
  const want = normText(p.quote);
  const at = (b: Block) => ` ${normText(blockWords(b))} `.includes(` ${want} `);
  const page = doc.pages.find((x) => x.id === p.page_id);
  const same = page && pageBlocks(page).find((b) => b.id === p.block_id);
  if (page && same && at(same)) return { page, block: same, moved: false };
  for (const pg of doc.pages) for (const b of pageBlocks(pg)) if (at(b)) return { page: pg, block: b, moved: true };
  return null;
}
const aidWords = (r: Extract<ReturnType<typeof resolveSnippet>, { permitted: true }>) =>
  [r.title, r.trigger, r.purpose, r.release?.quick ?? "", ...(r.release?.steps ?? []).flatMap((st) => [st.text, st.why]), r.release?.example ?? ""].join(" ");

function standing(db: Db, user: User, p: PassageRow, now: Date): Standing {
  const gone: Standing = { state: "unavailable", changed: false, current: "", href: "", sourceTitle: "", where: "", at: null };
  if (p.source_kind === "aid") {
    const r = resolveSnippet(db, user, p.source_id, now);
    // Withdrawn, fallen back or no longer shared with their role: the old words are not shown.
    if (!r.permitted || !r.release || r.readiness === "fallback") return r.permitted ? { ...gone, href: `/tools/${p.source_id}`, sourceTitle: r.title } : gone;
    const current = String(r.release.number);
    const found = ` ${normText(aidWords(r))} `.includes(` ${normText(p.quote)} `);
    return {
      state: found ? "current" : "superseded",
      changed: current !== p.version,
      current,
      href: `/tools/${p.source_id}`,
      sourceTitle: r.title,
      where: `Release ${r.release.number}`,
      at: found ? { page: "", block: "aid" } : null,
    };
  }
  if (p.source_kind !== "guide") {
    let src: Flat;
    try {
      src = flatSource(db, user, p.source_kind, p.source_id, now);
    } catch {
      // Unpublished, deleted, or not open to them now: the same as not being there.
      return gone;
    }
    const want = ` ${normText(p.quote)} `;
    const has = (x: Part) => ` ${normText(x.words)} `.includes(want);
    const same = src.parts.find((x) => x.id === p.block_id);
    // Where it was saved first; then anywhere else in the same source (a safe re-anchor, word for word).
    const hit = same && has(same) ? same : src.parts.find(has);
    const place = hit ?? same ?? src.parts[0];
    return {
      state: hit ? (hit === same ? "current" : "moved") : "superseded",
      changed: src.version !== p.version,
      current: src.version,
      href: src.href(place?.id ?? p.block_id),
      sourceTitle: src.title,
      where: place ? src.where(place) : "",
      at: hit ? { page: "", block: hit.id } : null,
    };
  }
  let g: ReturnType<typeof readGuide>;
  try {
    g = readGuide(db, user, p.source_id);
  } catch {
    // Archived, unpublished, or closed to their audience: the same as not being there.
    return gone;
  }
  const hit = findInGuide(g.doc, p);
  const page = hit?.page ?? g.doc.pages.find((x) => x.id === p.page_id) ?? g.doc.pages[0];
  const many = g.doc.pages.length > 1;
  return {
    state: hit ? (hit.moved ? "moved" : "current") : "superseded",
    changed: g.revisionId !== p.version,
    current: g.revisionId,
    href: `/magazine/${g.slug}${many ? `/${page.id}` : ""}`,
    sourceTitle: g.title,
    where: hit ? `${many ? `${pageTitle(g.doc, hit.page, g.title)} · ` : ""}#block-${hit.block.id}` : many ? pageTitle(g.doc, page, g.title) : "",
    at: hit ? { page: hit.page.id, block: hit.block.id } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------------------------

export type FavouriteItem = {
  id: string;
  kind: "job_aid" | "passage" | "tool";
  title: string;
  /** "Use when…" for an aid; where it came from for a passage. */
  detail: string;
  label: string;
  /** The highlighted words. Empty when they may not be shown. */
  quote: string;
  state: "current" | "updated" | "moved" | "changed" | "superseded" | "unavailable";
  note: string;
  href: string;
  pinned: boolean;
  savedAt: string;
  lastOpenedAt: string | null;
};

function itemOf(db: Db, user: User, f: FavRow, now: Date): FavouriteItem {
  const base = { id: f.id, kind: f.kind, pinned: Boolean(f.pinned), savedAt: f.saved_at, lastOpenedAt: f.last_opened_at };
  // A Live Call Pocket Playbook tool (docs/pocket-playbook.md): its standing, never its content.
  if (f.kind === "tool" && isPocketTool(f.target_id)) return { ...base, ...pocketFavourite(db, user, f.target_id, f.seen, now), quote: "" };
  // A Local Referral Studio pitch card (docs/local-referral-studio.md): its standing now, and only within its business.
  if (f.kind === "tool" && f.target_id.startsWith(CARD_PREFIX)) return { ...base, ...referralCardFavourite(db, user, f.target_id, now), quote: "" };
  // A Myth vs Reality entry (docs/myth-vs-reality.md): its approved version's standing now, never a draft's words.
  if (f.kind === "tool" && isMythTarget(f.target_id)) return { ...base, ...mythStanding(db, f.target_id, f.seen, now), quote: "" };
  if (f.kind === "tool") {
    // A whole Work Tool (the Caseload-to-Margin calculator): it holds no content of its own, so it's current or unavailable.
    const open = f.target_id === TOOL_ID && plannerEligible(db, user);
    return {
      ...base,
      title: open ? TOOL_TITLE : "A tool you can no longer open",
      detail: open ? "Use when: deciding when to plan recruitment, and whether the business can afford it." : "",
      label: "Business planning tool",
      quote: "",
      state: open ? "current" : "unavailable",
      note: open ? "Private to your business. Nothing is saved until you save a plan." : "It isn’t available to you any more.",
      href: open ? `${TOOL_HREF}?from=favourites` : "/tools",
    };
  }
  if (f.kind === "job_aid") {
    const r = resolveSnippet(db, user, f.target_id, now);
    // A role change, or an aid that has gone: nothing of it is shown, not even its name.
    if (!r.permitted)
      return {
        ...base,
        title: "A Job Aid you can no longer open",
        detail: "",
        label: "Job Aid",
        quote: "",
        state: "unavailable",
        note: "It isn’t shared with your role any more. Look in Work Tools for what applies to you now.",
        href: "/tools",
      };
    const href = `/tools/${r.id}?from=favourites`;
    if (r.readiness === "fallback" || !r.release)
      return {
        ...base,
        title: f.title || r.title,
        detail: "",
        label: AID_TEMPLATES[r.template].label,
        quote: "",
        state: "unavailable",
        note: "Temporarily unavailable. Open it for the approved route to use meanwhile.",
        href,
      };
    const updated = Number(f.seen || 0) < r.release.number;
    return {
      ...base,
      title: f.title || r.title,
      detail: r.trigger ? `Use when: ${r.trigger}` : r.purpose,
      label: AID_TEMPLATES[r.template].label,
      quote: "",
      state: updated ? "updated" : "current",
      note: updated ? `Updated: release ${r.release.number} is the current one.` : `Release ${r.release.number} · ${r.ownerTeam}`,
      href,
    };
  }
  const p = db.prepare("SELECT * FROM saved_passages WHERE id = ? AND user_id = ?").get(f.target_id, user.id) as PassageRow | undefined;
  if (!p)
    return {
      ...base,
      title: f.title || "A saved passage",
      detail: "",
      label: "Highlight",
      quote: "",
      state: "unavailable",
      note: "This highlight can’t be found.",
      href: "/favourites",
    };
  const s = standing(db, user, p, now);
  const title = f.title || clipSentence(p.quote, 70);
  if (s.state === "unavailable")
    return {
      ...base,
      title: f.title || "A saved passage",
      detail: "",
      label: "Highlight",
      quote: "",
      state: "unavailable",
      note: s.href
        ? "Its source is temporarily unavailable. Open it for the approved route to use meanwhile."
        : "Its source isn’t available to you any more, so the passage isn’t shown.",
      href: s.href || "/tools",
    };
  const href = `${s.href}${s.href.includes("?") ? "&" : "?"}fav=${f.id}${s.where.includes("#") ? s.where.slice(s.where.indexOf("#")) : ""}`;
  const detail = `From ${s.sourceTitle}${s.where && !s.where.startsWith("#") ? ` · ${s.where.split(" · #")[0]}` : ""}`;
  if (s.state === "superseded")
    return {
      ...base,
      title,
      detail,
      label: "Highlight",
      quote: p.quote,
      state: "superseded",
      note: "This wording is no longer in the current guidance. Open the current version before you rely on it.",
      href,
    };
  // Published again since it was saved, and not yet checked by the person against what's there now.
  const unchecked = s.changed && f.seen !== s.current;
  return {
    ...base,
    title,
    detail,
    label: "Highlight",
    quote: p.quote,
    state: unchecked ? "changed" : s.state === "moved" ? "moved" : "current",
    note: unchecked
      ? "Guidance changed since you saved this. The passage is still there: check it in the current version."
      : s.state === "moved"
        ? "This passage has moved within the source."
        : "",
    href,
  };
}

/** A person's Favourites: pinned first, then most recently opened, then most recently saved. Only ever their own. */
export function favouritesList(db: Db, user: User, input: { q?: unknown; kind?: unknown; limit?: unknown }, now: Date) {
  ensurePlaybooks(db, now);
  const rows = db.prepare("SELECT * FROM favourites WHERE user_id = ?").all(user.id) as FavRow[];
  const q = normText(str(input.q, 80));
  const kind = input.kind === "job_aid" || input.kind === "passage" ? input.kind : "";
  const all = rows.map((f) => itemOf(db, user, f, now));
  const items = all
    .filter((i) => (!kind || i.kind === kind) && (!q || normText(`${i.title} ${i.detail} ${i.quote} ${i.label}`).includes(q)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastOpenedAt ?? b.savedAt).localeCompare(a.lastOpenedAt ?? a.savedAt));
  const limit = Number(input.limit) > 0 ? Math.min(50, Number(input.limit)) : 200;
  return {
    items: items.slice(0, limit),
    counts: { all: all.length, job_aid: all.filter((i) => i.kind === "job_aid").length, passage: all.filter((i) => i.kind === "passage").length },
  };
}

/** One saved passage, for the page it opens on: the words if they may be shown, and where it stands. */
export function favouriteFor(db: Db, user: User, id: unknown, now: Date) {
  ensurePlaybooks(db, now);
  const f = db.prepare("SELECT * FROM favourites WHERE id = ? AND user_id = ?").get(str(id, 40), user.id) as FavRow | undefined;
  // Someone else's favourite looks the same as none.
  if (!f) throw new HttpError(404, "That favourite isn’t here.");
  return itemOf(db, user, f, now);
}

/** A passage this person saved that is on the page they have open, for the subtle marker there. */
export type PageMark = { id: string; blockId: string; quote: string };

/**
  This person's own saved passages that are on the page they're reading, for the marker. Only words that are there
  now exactly as they were saved: a passage whose wording has changed or gone, or whose source has been published
  again and not yet checked by them, isn't marked. Favourites says why. Nothing of anyone else's is ever here.
  `page` narrows a guide to one page, and a Topic to one card.
*/
export function pageMarks(db: Db, user: User, input: { source?: unknown; id?: unknown; page?: unknown }, now: Date): { marks: PageMark[] } {
  ensurePlaybooks(db, now);
  const kind = PASSAGE_KINDS.find((k) => k === input.source);
  if (!kind) throw new HttpError(400, "Unknown source.");
  // The source as this person reads it now. One they can't open has no marks.
  let sourceId = "";
  try {
    if (kind === "guide") sourceId = readGuide(db, user, str(input.id, 120)).id;
    else if (kind === "aid") {
      const r = resolveSnippet(db, user, input.id, now);
      if (!r.permitted) return { marks: [] };
      sourceId = r.id;
    } else if (kind !== "resource") sourceId = flatSource(db, user, kind, input.id, now).id;
  } catch {
    return { marks: [] };
  }
  // The Resources page shows every entry, and each entry is its own source: all of this person's are wanted.
  const rows = db
    .prepare(
      `SELECT p.*, f.id AS fav_id, f.seen AS fav_seen FROM saved_passages p JOIN favourites f ON f.user_id = p.user_id AND f.kind = 'passage' AND f.target_id = p.id
       WHERE p.user_id = ? AND p.source_kind = ? AND (? = '' OR p.source_id = ?)`,
    )
    .all(user.id, kind, sourceId, sourceId) as (PassageRow & { fav_id: string; fav_seen: string })[];
  const page = str(input.page, 120);
  const marks = rows.flatMap((p) => {
    const s = standing(db, user, p, now);
    if (!s.at || (s.state !== "current" && s.state !== "moved")) return [];
    if (s.changed && p.fav_seen !== s.current) return [];
    if (page && (kind === "guide" ? s.at.page : kind === "topic" ? s.at.block : page) !== page) return [];
    return [{ id: p.fav_id, blockId: s.at.block, quote: p.quote }];
  });
  return { marks };
}

// ---------------------------------------------------------------------------------------------
// Saving a passage
// ---------------------------------------------------------------------------------------------

function addFavourite(db: Db, user: User, passageId: string, seen: string, now: Date) {
  const had = db.prepare("SELECT id FROM favourites WHERE user_id = ? AND kind = 'passage' AND target_id = ?").get(user.id, passageId) as
    { id: string } | undefined;
  if (had) return { id: had.id, fresh: false };
  const id = `fav-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  db.prepare("INSERT INTO favourites (id, user_id, kind, target_id, seen, saved_at) VALUES (?, ?, 'passage', ?, ?, ?)").run(
    id,
    user.id,
    passageId,
    seen,
    now.toISOString(),
  );
  return { id, fresh: true };
}

/**
  Saves a highlighted passage, or a whole section (`sectionId`, for people who can't make a precise selection).
  The words have to be in the published source as this person reads it. Saving the same words twice is one save.
*/
export function savePassage(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePlaybooks(db, now);
  let source: { kind: PassageKind; id: string; version: string; title: string; page: string; section: string; block: string; text: string };
  let quote = typeof input.quote === "string" ? input.quote.replace(/\s+/g, " ").trim() : "";
  const whole = typeof input.sectionId === "string" && !quote;
  // Only the kinds of source listed: anything else is refused, not read as a guide.
  const kind = input.source === undefined ? "guide" : PASSAGE_KINDS.find((k) => k === input.source);
  if (!kind) throw new HttpError(400, "That can’t be highlighted.");
  if (kind === "topic" || kind === "news" || kind === "resource") {
    // A Resources entry is its own source, so the part (or the section) names it.
    const src = flatSource(db, user, kind, kind === "resource" ? (whole ? input.sectionId : input.blockId) : input.id, now);
    if (typeof input.revisionId === "string" && input.revisionId && input.revisionId !== src.version)
      throw new HttpError(409, "This has been updated since you opened it. Reload the page to read the latest version.");
    let part: Part | undefined;
    if (whole) {
      part = src.parts.find((x) => x.section === input.sectionId && x.lead.length >= PASSAGE_MIN);
      if (!part) throw new HttpError(400, "There’s no text in this section to save.");
      quote = clipSentence(part.lead, PASSAGE_MAX - 100);
    } else {
      part = src.parts.find((x) => x.id === input.blockId);
      if (!part) throw new HttpError(400, "Select text within one part of the page.");
    }
    source = {
      kind,
      id: src.id,
      version: src.version,
      title: src.title,
      page: "",
      section: part.section,
      block: part.id,
      text: whole ? part.lead : part.words,
    };
  } else if (kind === "aid") {
    const r = resolveSnippet(db, user, input.id, now);
    if (!r.permitted) throw new HttpError(403, "This Job Aid isn’t shared with your role.");
    if (!r.release || r.readiness === "fallback") throw new HttpError(400, "There’s no current release to save from.");
    source = { kind: "aid", id: r.id, version: String(r.release.number), title: r.title, page: "", section: "", block: "", text: aidWords(r) };
    if (whole) quote = clipSentence(r.release.quick || r.release.steps.map((st) => st.text).join(" "), PASSAGE_MAX);
  } else {
    const g = readGuide(db, user, str(input.id, 120));
    if (typeof input.revisionId === "string" && input.revisionId !== g.revisionId)
      throw new HttpError(409, "This guide has been updated. Reload the page to read the latest version.");
    const page = g.doc.pages.find((p) => p.id === input.pageId) ?? (g.doc.pages.length === 1 ? g.doc.pages[0] : undefined);
    if (!page) throw new HttpError(400, "That page isn’t in this course.");
    let block: Block | undefined;
    let sectionId = "";
    if (whole) {
      const section = page.sections.find((s) => s.id === input.sectionId);
      if (!section) throw new HttpError(400, "That section isn’t on this page.");
      sectionId = section.id;
      block = section.blocks.find((b) => blockWords(b).length >= PASSAGE_MIN);
      if (!block) throw new HttpError(400, "There’s no text in this section to save.");
      quote = clipSentence(blockWords(block), PASSAGE_MAX - 100);
    } else {
      block = pageBlocks(page).find((b) => b.id === input.blockId);
      if (!block) throw new HttpError(400, "Select text within one part of the page.");
      sectionId = page.sections.find((s) => s.blocks.some((b) => b.id === block!.id))?.id ?? "";
    }
    source = { kind: "guide", id: g.id, version: g.revisionId, title: g.title, page: page.id, section: sectionId, block: block.id, text: blockWords(block) };
  }
  if (quote.length < PASSAGE_MIN) throw new HttpError(400, "Select a little more: a phrase or a sentence.");
  if (quote.length > PASSAGE_MAX) throw new HttpError(400, `That’s a long passage. Select up to ${PASSAGE_MAX} characters, or save the section.`);
  // Only what is published there can be saved. This is also what keeps a typed note or a client's details out.
  if (!` ${normText(source.text)} `.includes(` ${normText(quote)} `))
    throw new HttpError(400, "Select text within one part of the page, so it can be found again.");
  const hash = checksum(`${source.block}|${normText(quote)}`);
  const had = db
    .prepare("SELECT id FROM saved_passages WHERE user_id = ? AND source_kind = ? AND source_id = ? AND hash = ?")
    .get(user.id, source.kind, source.id, hash) as { id: string } | undefined;
  const passageId = had?.id ?? `sp-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  if (!had)
    db.prepare(
      "INSERT INTO saved_passages (id, user_id, source_kind, source_id, version, page_id, section_id, block_id, source_title, quote, hash, whole_section, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      passageId,
      user.id,
      source.kind,
      source.id,
      source.version,
      source.page,
      source.section,
      source.block,
      source.title,
      quote,
      hash,
      whole ? 1 : 0,
      now.toISOString(),
    );
  const before = (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE user_id = ?").get(user.id) as { n: number }).n;
  const fav = addFavourite(db, user, passageId, source.version, now);
  if (fav.fresh)
    recordAidEvent(
      db,
      user,
      {
        event: "passage_selection_saved",
        snippetId: source.kind === "aid" ? source.id : "",
        sourceKind: source.kind,
        sourceId: source.id,
        place: source.page,
        key: `sp:${passageId}`,
      },
      now,
    );
  return { id: fav.id, saved: true, already: !fav.fresh, first: fav.fresh && before === 0, quote, sourceTitle: source.title };
}

/**
  Pin a favourite to the top of the person's quick access (the Hub home, the Companion Drawer and Favourites), or
  unpin it (docs/pocket-playbook.md). A pin is a preference on the saved Favourite, never a second collection:
  unpinning keeps the Favourite. `pinned` holds the order (1 is first; 0 is not pinned), so a new pin goes last.
  Pinning what's already pinned changes nothing and records nothing, so a double tap or a retry counts once.
*/
export function setFavouritePinned(db: Db, user: User, f: Pick<FavRow, "id" | "kind" | "target_id" | "pinned">, on: boolean, now: Date) {
  const was = Number(f.pinned) > 0;
  if (was === on) return { changed: false };
  const next = on ? ((db.prepare("SELECT MAX(pinned) AS n FROM favourites WHERE user_id = ?").get(user.id) as { n: number | null }).n ?? 0) + 1 : 0;
  db.prepare("UPDATE favourites SET pinned = ? WHERE id = ? AND user_id = ?").run(next, f.id, user.id);
  if (f.kind !== "passage")
    recordAidEvent(
      db,
      user,
      {
        event: on ? "tool_pinned" : "tool_unpinned",
        snippetId: f.kind === "job_aid" ? f.target_id : "",
        sourceKind: f.kind === "job_aid" ? "aid" : "tool",
        sourceId: f.target_id,
      },
      now,
    );
  return { changed: true };
}

/** Rename, pin, remove, or note that it was opened or checked. Only ever the person's own favourite. */
export function favouriteAction(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePlaybooks(db, now);
  const f = db.prepare("SELECT * FROM favourites WHERE id = ? AND user_id = ?").get(str(input.id, 40), user.id) as FavRow | undefined;
  if (!f) throw new HttpError(404, "That favourite isn’t here.");
  const at = now.toISOString();
  switch (input.action) {
    case "rename": {
      const title = str(input.title, 80);
      // A label is for finding it again. It is not somewhere to keep a client's details.
      const found = identifierWarnings(title);
      if (found.length) throw new HttpError(400, `That looks like it includes ${found.join(" and ")}. Use a general label.`);
      db.prepare("UPDATE favourites SET title = ? WHERE id = ?").run(title, f.id);
      return { ok: true };
    }
    case "pin":
      setFavouritePinned(db, user, f, input.on !== false, now);
      return { ok: true };
    case "remove": {
      db.prepare("DELETE FROM favourites WHERE id = ?").run(f.id);
      if (f.kind === "passage") db.prepare("DELETE FROM saved_passages WHERE id = ? AND user_id = ?").run(f.target_id, user.id);
      else if (f.kind === "job_aid") recordAidEvent(db, user, { event: "job_aid_unfavourited", snippetId: f.target_id }, now);
      return { ok: true };
    }
    case "opened": {
      db.prepare("UPDATE favourites SET last_opened_at = ? WHERE id = ?").run(at, f.id);
      // A tool isn't a Job Aid or a passage: its use is counted by the tool itself (server/caseloadPlanner).
      if (f.kind === "tool") return { ok: true };
      const p =
        f.kind === "passage"
          ? (db.prepare("SELECT source_kind, source_id FROM saved_passages WHERE id = ?").get(f.target_id) as
              { source_kind: string; source_id: string } | undefined)
          : undefined;
      recordAidEvent(
        db,
        user,
        {
          event: "saved_item_opened",
          snippetId: f.kind === "job_aid" ? f.target_id : p?.source_kind === "aid" ? p.source_id : "",
          sourceKind: p?.source_kind ?? "aid",
          sourceId: p?.source_id ?? f.target_id,
          key: typeof input.key === "string" ? input.key : null,
        },
        now,
      );
      return { ok: true };
    }
    case "checked": {
      // "I've checked the current passage": the change notice goes until the source is published again.
      const p = db.prepare("SELECT * FROM saved_passages WHERE id = ? AND user_id = ?").get(f.target_id, user.id) as PassageRow | undefined;
      if (!p) throw new HttpError(400, "Only a highlight can be checked against its source.");
      const s = standing(db, user, p, now);
      if (s.current) db.prepare("UPDATE favourites SET seen = ? WHERE id = ?").run(s.current, f.id);
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
}

// ---------------------------------------------------------------------------------------------
// Opening an aid, and events a page sends
// ---------------------------------------------------------------------------------------------

/**
  An aid was opened in full. Counted as a view; and if the person has it in Favourites and this release is newer
  than the one they last saw, that they have now seen the update.
*/
export function aidViewed(db: Db, user: User, id: string, input: { from?: unknown; key?: unknown }, now: Date) {
  const r = resolveSnippet(db, user, id, now);
  if (!r.permitted) return { ok: true };
  markViewed(db, user, id, now);
  const release = r.release?.number ?? 0;
  const key = typeof input.key === "string" ? input.key : null;
  recordAidEvent(db, user, { event: "job_aid_viewed", snippetId: r.id, release, place: str(input.from, 40), key: key && `v:${key}` }, now);
  const f = db.prepare("SELECT id, seen FROM favourites WHERE user_id = ? AND kind = 'job_aid' AND target_id = ?").get(user.id, r.id) as
    { id: string; seen: string } | undefined;
  if (f && release && Number(f.seen || 0) < release) {
    db.prepare("UPDATE favourites SET seen = ? WHERE id = ?").run(String(release), f.id);
    recordAidEvent(db, user, { event: "job_aid_update_seen", snippetId: r.id, release, key: `u:${f.id}:${release}` }, now);
  }
  return { ok: true };
}

/** An event from a page: an aid opened from where it's placed, Favourites opened, the current source opened. */
export function clientAidEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  ensurePlaybooks(db, now);
  const event = AID_CLIENT_EVENTS.find((e) => e === input.event) as AidEvent | undefined;
  if (!event) throw new HttpError(400, "Unknown event.");
  let snippetId = "";
  let release = 0;
  if (typeof input.snippetId === "string" && input.snippetId) {
    const r = resolveSnippet(db, user, input.snippetId, now);
    if (!r.permitted) throw new HttpError(403, "This Job Aid isn’t shared with your role.");
    snippetId = r.id;
    release = r.release?.number ?? 0;
  }
  const recorded = recordAidEvent(
    db,
    user,
    {
      event,
      snippetId,
      release,
      sourceKind: str(input.sourceKind, 10),
      sourceId: str(input.sourceId, 80),
      place: str(input.place, 120),
      key: typeof input.key === "string" ? input.key : null,
    },
    now,
  );
  return { ok: true, recorded: recorded > 0 };
}

// ---------------------------------------------------------------------------------------------
// Topics: a Job Aid on a card
// ---------------------------------------------------------------------------------------------

type PlacementRow = { id: string; snippet_id: string; slug: string; card: string; why: string; placed_by: string; placed_at: string };

/** The Job Aids placed on a Topic's cards that this person's role may see. One they can't see isn't there at all. */
export function aidsForTopic(db: Db, user: User, slug: unknown, now: Date) {
  ensurePlaybooks(db, now);
  const rows = db.prepare("SELECT * FROM aid_placements WHERE slug = ? ORDER BY placed_at").all(str(slug, 120)) as PlacementRow[];
  return {
    aids: rows
      .filter((p) => resolveSnippet(db, user, p.snippet_id, now).permitted)
      .map((p) => ({ placementId: p.id, snippetId: p.snippet_id, card: p.card, why: p.why })),
  };
}

/** Owners: place an aid on a Topic card or take it off, or record the review decision. */
export function aidAdminAction(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensurePlaybooks(db, now);
  const snippetId = str(input.id, 80);
  if (!db.prepare("SELECT 1 FROM playbook_snippets WHERE id = ?").get(snippetId)) throw new HttpError(404, "That Job Aid isn’t in the library.");
  switch (input.action) {
    case "place-topic": {
      const lesson = lessonBySlug(str(input.slug, 120));
      const card = str(input.card, 80);
      if (!lesson || !lesson.nodes[card]) throw new HttpError(400, "Choose a card in a Topic.");
      const type = lesson.nodes[card].type;
      if (type === "listen" || type === "presenter") throw new HttpError(400, "That card has no room beside it. Choose the card before or after.");
      const id = `ap-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const done = db
        .prepare("INSERT OR IGNORE INTO aid_placements (id, snippet_id, slug, card, why, placed_by, placed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(id, snippetId, lesson.slug, card, str(input.why, 300), actor.id, now.toISOString());
      if (!done.changes)
        db.prepare("UPDATE aid_placements SET why = ? WHERE snippet_id = ? AND slug = ? AND card = ?").run(str(input.why, 300), snippetId, lesson.slug, card);
      audit(db, { actor: actor.id, event: "job_aid.placed", entity: `playbook:${snippetId}`, next: { topic: lesson.slug, card }, at: now });
      return { ok: true };
    }
    case "unplace-topic": {
      db.prepare("DELETE FROM aid_placements WHERE id = ? AND snippet_id = ?").run(str(input.placementId, 40), snippetId);
      audit(db, { actor: actor.id, event: "job_aid.unplaced", entity: `playbook:${snippetId}`, at: now });
      return { ok: true };
    }
    case "review": {
      const decision = (Object.keys(REVIEW_DECISIONS) as ReviewDecision[]).find((d) => d === input.decision);
      if (!decision) throw new HttpError(400, "Choose keep, revise, retarget, withdraw or close.");
      const note = str(input.note, 500);
      if (note.length < 3) throw new HttpError(400, "Say briefly what the decision rests on.");
      const release =
        (db.prepare("SELECT MAX(number) AS n FROM playbook_releases WHERE snippet_id = ? AND status = 'approved'").get(snippetId) as { n: number | null }).n ??
        0;
      db.prepare("INSERT INTO aid_reviews (snippet_id, release, decision, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)").run(
        snippetId,
        release,
        decision,
        note,
        actor.id,
        now.toISOString(),
      );
      audit(db, { actor: actor.id, event: "job_aid.reviewed", entity: `playbook:${snippetId}`, next: { decision, release }, reason: note, at: now });
      return { ok: true };
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
}

// ---------------------------------------------------------------------------------------------
// Search and reporting
// ---------------------------------------------------------------------------------------------

/** Job Aids as site search sees them: only ones this person's role may open, and never a withdrawn one's steps. */
export function aidDocs(db: Db, user: User, now = new Date()) {
  return playbookList(db, user, now).playbooks.flatMap((p) => {
    if (!p) return [];
    const r = resolveSnippet(db, user, p.id, now);
    if (!r.permitted) return [];
    const live = r.release && r.readiness !== "fallback";
    return [
      {
        id: `aid:${p.id}`,
        href: `/tools/${p.id}`,
        title: p.title,
        meta: `Work tool · ${AID_TEMPLATES[p.template].label}`,
        head: `${p.title} ${p.tag}`,
        summary: `${p.trigger} ${p.purpose} ${p.roleLabel}`,
        body: live ? [r.release!.quick, ...r.release!.steps.map((st) => st.text)].join(" · ") : "",
      },
    ];
  });
}

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
/** Fewer people than this and a figure is too thin to read anything from. */
export const AID_THIN = 10;

/**
  Use of each Job Aid, by release, in a date range: adoption evidence, with its denominator. Counts of people and
  events. No one's highlights, labels or list.
*/
export function aidReport(db: Db, actor: User, input: { from?: unknown; to?: unknown }, now: Date) {
  requireAuthor(actor);
  ensurePlaybooks(db, now);
  const to = day(input.to) || now.toISOString().slice(0, 10);
  const from = day(input.from) || new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const lo = `${from}T00:00:00.000Z`;
  const hi = `${to}T23:59:59.999Z`;
  type Ev = { user_id: string; audience: string; event: string; snippet_id: string; release: number };
  const events = db.prepare("SELECT user_id, audience, event, snippet_id, release FROM aid_events WHERE at BETWEEN ? AND ?").all(lo, hi) as Ev[];
  const audiences = db.prepare("SELECT audience, COUNT(*) AS n FROM users GROUP BY audience").all() as { audience: string; n: number }[];
  const snippets = db.prepare("SELECT id, data, withdrawn FROM playbook_snippets ORDER BY id").all() as { id: string; data: string; withdrawn: number }[];
  const guides = db
    .prepare(
      "SELECT g.id, g.title, g.status, g.draft, r.doc FROM magazine_guides g LEFT JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status != 'archived'",
    )
    .all() as { id: string; title: string; status: string; draft: string; doc: string | null }[];
  const people = (rows: Ev[]) => new Set(rows.map((e) => e.user_id)).size;
  const aids = snippets.map((s) => {
    const d = JSON.parse(s.data) as { title?: string; audiences?: string[]; ownerTeam?: string; themeId?: string; template?: string };
    const mine = events.filter((e) => e.snippet_id === s.id);
    const of = (...names: string[]) => mine.filter((e) => names.includes(e.event));
    const current = db
      .prepare("SELECT number, approved_at, data FROM playbook_releases WHERE snippet_id = ? AND status = 'approved' ORDER BY number DESC LIMIT 1")
      .get(s.id) as { number: number; approved_at: string; data: string } | undefined;
    const needle = `"snippetId":"${s.id}"`;
    const eligible = audiences.filter((a) => (d.audiences ?? []).includes(a.audience)).reduce((n, a) => n + a.n, 0);
    const viewers = people(of("job_aid_viewed", "job_aid_opened_from_placement"));
    const review = db.prepare("SELECT decision, note, at FROM aid_reviews WHERE snippet_id = ? ORDER BY id DESC LIMIT 1").get(s.id) as
      { decision: ReviewDecision; note: string; at: string } | undefined;
    const rel = current ? (JSON.parse(current.data) as { effectiveOn?: string; reviewBy?: string }) : {};
    return {
      id: s.id,
      title: d.title ?? s.id,
      template: AID_TEMPLATES[(d.template as keyof typeof AID_TEMPLATES) ?? "checklist"]?.label ?? "Checklist",
      owner: d.ownerTeam ?? "",
      audiences: d.audiences ?? [],
      themeId: d.themeId ?? "",
      withdrawn: Boolean(s.withdrawn),
      release: current?.number ?? 0,
      releasedOn: current?.approved_at?.slice(0, 10) ?? "",
      effectiveOn: rel.effectiveOn ?? "",
      reviewBy: rel.reviewBy ?? "",
      eligible,
      viewers,
      thin: viewers > 0 && viewers < AID_THIN,
      views: of("job_aid_viewed").length,
      fromPlacement: of("job_aid_opened_from_placement").length,
      saves: of("job_aid_favourited").length,
      unsaves: of("job_aid_unfavourited").length,
      savedNow: (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE kind = 'job_aid' AND target_id = ?").get(s.id) as { n: number }).n,
      returns: of("saved_item_opened").length,
      returners: people(of("saved_item_opened")),
      sourceClicks: of("current_source_opened").length,
      updatesSeen: of("job_aid_update_seen").length,
      issues: (db.prepare("SELECT COUNT(*) AS n FROM playbook_gaps WHERE snippet_id = ? AND created_at BETWEEN ? AND ?").get(s.id, lo, hi) as { n: number }).n,
      byRole: Object.fromEntries(
        ["partner", "coordinator", "staff"].map((a) => [a, people(mine.filter((e) => e.audience === a && e.event === "job_aid_viewed"))]),
      ) as Record<string, number>,
      byRelease: [...new Set(mine.map((e) => e.release))]
        .filter(Boolean)
        .sort((a, b) => b - a)
        .map((n) => ({ release: n, views: mine.filter((e) => e.release === n && e.event === "job_aid_viewed").length })),
      placements: [
        ...guides
          .filter((g) => (g.doc ?? "").includes(needle) || g.draft.includes(needle))
          .map((g) => ({ kind: "Magazine", title: g.title, live: (g.doc ?? "").includes(needle) })),
        ...(db.prepare("SELECT slug, card FROM aid_placements WHERE snippet_id = ?").all(s.id) as { slug: string; card: string }[]).map((p) => ({
          kind: "Topic",
          title: lessonBySlug(p.slug)?.title ?? p.slug,
          live: Boolean(lessonBySlug(p.slug)?.nodes[p.card]),
        })),
      ],
      review: review ? { decision: REVIEW_DECISIONS[review.decision], note: review.note, at: review.at } : null,
    };
  });
  return {
    range: { from, to },
    thin: AID_THIN,
    totals: {
      favouritesOpened: events.filter((e) => e.event === "favourites_opened").length,
      peopleWithFavourites: (db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM favourites").get() as { n: number }).n,
      // How many highlights exist, and nothing else about them: they are private.
      passagesSaved: events.filter((e) => e.event === "passage_selection_saved").length,
    },
    aids,
  };
}
export type AidReport = ReturnType<typeof aidReport>;
