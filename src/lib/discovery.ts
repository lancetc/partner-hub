import { keywords } from "./keywords";

/*
  Discovery Paths (docs/discovery-paths.md): a learner's own route through published Topics and Magazine
  content, built around a goal of theirs. This file is the part shared by the server and the pages: what
  an item in the catalogue looks like, how a goal is matched to items, and the wording of progress.

  A Discovery Path is personal. It never awards a completion, a quiz pass or a certificate: each step
  shows the Topic's or course's own record, and the learner's "Reviewed for now" sits beside it.
*/

export type ItemKind = "topic" | "course" | "page";
export const ITEM_KINDS: ItemKind[] = ["topic", "page", "course"];
export const KIND_LABELS: Record<ItemKind, string> = { topic: "Topic", course: "Course", page: "Magazine page" };

/** Where the learner is in the content itself, from its own records. */
export type NativeState = "new" | "started" | "completed";

export type CatalogueItem = {
  /** `topic:<slug>`, `course:<course id>` or `page:<course id>:<page id>`. */
  key: string;
  kind: ItemKind;
  /** The Topic's slug or the course's id. */
  ref: string;
  /** The page, for a Magazine page; otherwise empty. */
  pageId: string;
  title: string;
  summary: string;
  minutes: number;
  href: string;
  /** The course a Magazine page is part of. */
  parent: { key: string; title: string; href: string } | null;
  /** Changes when the content does: a Topic's version, a course's edition, a page's own content. */
  version: string;
  /** Practice already attached to it ("Quick review", "A decision to practise"), if any. */
  practice: string | null;
  /** Who's accountable for it and when it was last reviewed or published, where the Hub knows. */
  owner: string;
  reviewed: string | null;
  state: NativeState;
};
/** With the words used for matching. These stay on the server. */
export type IndexedItem = CatalogueItem & { text: string };

export const itemKey = (kind: ItemKind, ref: string, pageId = "") => (kind === "page" ? `page:${ref}:${pageId}` : `${kind}:${ref}`);

export function parseKey(key: unknown): { kind: ItemKind; ref: string; pageId: string } | null {
  if (typeof key !== "string" || key.length > 200) return null;
  const [kind, ref, pageId = "", ...rest] = key.split(":");
  if (rest.length || !ref || !/^[\w-]+$/.test(ref)) return null;
  if (kind === "page") return /^[\w-]+$/.test(pageId) ? { kind, ref, pageId } : null;
  if ((kind === "topic" || kind === "course") && !pageId) return { kind, ref, pageId: "" };
  return null;
}

export const EXPERIENCE = { new: "New to this", some: "Some experience", refresh: "Refreshing" } as const;
export type Experience = keyof typeof EXPERIENCE;
export const TIMES = [10, 20, 40] as const;

export const PATH_STATES = { draft: "Draft", active: "In progress", paused: "Paused", archived: "Archived" } as const;
export type PathState = keyof typeof PATH_STATES;

/** Optional labels a learner can group steps under. They guide; they don't gate anything. */
export const PHASES = ["Understand", "Practise", "Use at work"] as const;

export const STARTERS = [
  "I want to feel more confident checking supplier invoices",
  "I need to handle a complaint more confidently",
  "I want to understand what Support at Home funding covers",
  "I’d like to get better at noticing when a client’s needs change",
];

export const MAX_GOAL = 300;
export const MAX_STEPS = 30;
export const MAX_NOTE = 500;
/** How many steps a suggestion offers at most; it offers fewer rather than pad the route. */
export const SUGGEST_MAX = 7;

export const PRIVACY_REMINDER = "Please don’t include a client’s name or health details.";
export const PERSONAL_NOTE = "A flexible collection you chose for yourself";

// ---------------------------------------------------------------------------------------------
// Matching a goal to the catalogue (the rule-based route: always available, and what AI is checked against)
// ---------------------------------------------------------------------------------------------

/** Words people use to phrase a goal that say nothing about its subject. */
const GOAL_NOISE = new Set(
  "want feel more confident confidently confidence learn learning understand understanding know better like would able good improve really help something thing work properly correctly handle handling deal dealing use using make making sure start started new".split(
    " ",
  ),
);

export const goalWords = (goal: string) => {
  const all = keywords(goal);
  const kept = all.filter((w) => !GOAL_NOISE.has(w));
  // "I want to learn" has no subject at all; "handle work" keeps what little there is.
  return (kept.length ? kept : all).slice(0, 10);
};

export type Scored = { item: IndexedItem; score: number; title: string[]; summary: string[]; body: string[] };

/** Every item that's about the goal, best first. An item only counts when the goal's own words are in it. */
export function scoreItems(items: IndexedItem[], goal: string): Scored[] {
  const words = goalWords(goal);
  if (!words.length) return [];
  const out: Scored[] = [];
  for (const item of items) {
    const head = item.title.toLowerCase();
    const sum = item.summary.toLowerCase();
    const rest = item.text.toLowerCase();
    const title = words.filter((w) => head.includes(w));
    const summary = words.filter((w) => !title.includes(w) && sum.includes(w));
    const body = words.filter((w) => !title.includes(w) && !summary.includes(w) && rest.includes(w));
    const hits = title.length + summary.length + body.length;
    // In the title or summary, or most of the goal's words on the page: one passing mention isn't a match.
    if (!title.length && !summary.length && body.length < Math.min(2, words.length)) continue;
    // And at least half of what the goal is about: one common word ("client") out of four isn't a match either.
    if (hits * 2 < words.length) continue;
    const score = (title.length * 5 + summary.length * 2 + body.length) * (0.5 + (0.5 * hits) / words.length);
    out.push({ item, score, title, summary, body });
  }
  return out.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
}

const quoted = (words: string[]) =>
  words
    .slice(0, 3)
    .map((w) => `“${w}”`)
    .join(words.length === 2 ? " and " : ", ");

/** Why an item was suggested, from what matched: plain enough for a learner, checkable by an author. */
export function reasonFor(s: Scored): string {
  const first = s.title.length
    ? `Its title matches ${quoted(s.title)}.`
    : s.summary.length
      ? `Its summary mentions ${quoted(s.summary)}.`
      : `It covers ${quoted(s.body)}.`;
  const more = [
    s.item.practice ? `Includes ${s.item.practice.toLowerCase()}.` : "",
    s.item.state === "started" ? "You’ve already started it." : s.item.state === "completed" ? "You’ve finished it before." : "",
  ].filter(Boolean);
  return [first, ...more].join(" ");
}

/**
  One entry per piece of learning: a course and its own pages don't both appear. A page stands in for its
  course when only one or two of its pages are relevant; three or more, and the whole course is the step.
*/
export function withoutOverlap(scored: Scored[]): Scored[] {
  const pagesOf = new Map<string, Scored[]>();
  for (const s of scored) if (s.item.kind === "page") pagesOf.set(s.item.ref, [...(pagesOf.get(s.item.ref) ?? []), s]);
  const courses = new Set(scored.filter((s) => s.item.kind === "course").map((s) => s.item.ref));
  const out: Scored[] = [];
  for (const s of scored) {
    const pages = pagesOf.get(s.item.ref) ?? [];
    if (s.item.kind === "topic") out.push(s);
    else if (s.item.kind === "course") {
      if (!pages.length || pages.length >= 3) out.push({ ...s, score: Math.max(s.score, ...pages.map((p) => p.score)) });
    } else if (pages.length < 3 || (!courses.has(s.item.ref) && pages.indexOf(s) < 2)) out.push(s);
  }
  return out.sort((a, b) => b.score - a.score);
}

const tidy = (goal: string) =>
  goal
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "");
/** What a suggested route is for, in the learner's own words: it says what they asked, not what the Hub claims to cover. */
export const routePurpose = (goal: string) => `Published Hub learning for your goal: ${tidy(goal)}.`;

export type RouteStep = { key: string; reason: string };
export type Route = { title: string; purpose: string; steps: RouteStep[]; minutes: number };

/** A short title for a path, from the goal as typed: "I want to feel more confident checking invoices" → "Checking invoices". */
export function titleFromGoal(goal: string): string {
  let t = goal
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.?!]+$/, "");
  t = t.replace(
    /^(i\s+(want|need|would like|wish)\s+to|i['’]d like to|i['’]m trying to|how (do|can|should) i|help me( to)?|teach me( how)? to|show me how to)\s+/i,
    "",
  );
  t = t.replace(/^(feel|be|become|get)\s+(more\s+)?(confident|comfortable|better)\s*(at|in|with|about)?\s*/i, "");
  t = t.replace(/\s+more confidently$/i, "");
  if (!t) t = goal.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 70 ? `${t.slice(0, 67).replace(/\s+\S*$/, "")}…` : t;
}

/**
  The rule-based route for a goal: the best matches, without overlap, that fit the time they have. It
  offers fewer steps rather than fill the route with loosely related ones, and none when nothing fits.
*/
export function buildRoute(
  items: IndexedItem[],
  goal: string,
  opts: { experience?: Experience | null; minutes?: number | null; exclude?: string[] } = {},
): Route & { considered: Scored[] } {
  const skip = new Set(opts.exclude ?? []);
  const weigh = (s: Scored): Scored => {
    let f = 1;
    // New to it: a Topic or whole course gives the grounding. Refreshing: a focused page, and what they've done before.
    if (opts.experience === "new") f *= s.item.kind === "page" ? 0.9 : 1.15;
    if (opts.experience === "refresh") f *= s.item.kind === "page" ? 1.2 : s.item.kind === "course" ? 0.85 : 1;
    if (s.item.state === "completed") f *= opts.experience === "refresh" ? 1.05 : 0.7;
    if (s.item.state === "started") f *= 1.1;
    return { ...s, score: s.score * f };
  };
  const considered = withoutOverlap(scoreItems(items, goal).map(weigh)).filter((s) => !skip.has(s.item.key));
  const top = considered[0]?.score ?? 0;
  // Well below the best match is filler.
  const strong = considered.filter((s) => s.score >= top * 0.35);
  const budget = opts.minutes ? opts.minutes * 1.25 : Infinity;
  const limit = opts.minutes ? SUGGEST_MAX : 5;
  const chosen: Scored[] = [];
  let minutes = 0;
  for (const s of strong) {
    if (chosen.length >= limit) break;
    // The first step is offered even when it's longer than the time they have: it's the best there is.
    if (chosen.length && minutes + s.item.minutes > budget) continue;
    chosen.push(s);
    minutes += s.item.minutes;
  }
  // A short Topic to begin, a worked page next, a whole course last.
  const order: Record<ItemKind, number> = { topic: 0, page: 1, course: 2 };
  chosen.sort((a, b) => order[a.item.kind] - order[b.item.kind] || b.score - a.score);
  const title = titleFromGoal(goal);
  return {
    title,
    purpose: chosen.length ? routePurpose(goal) : "",
    steps: chosen.map((s) => ({ key: s.item.key, reason: reasonFor(s) })),
    minutes,
    considered,
  };
}

/** Plain words from a piece of content (a Magazine page's blocks), for matching: ids, addresses and settings left out. */
export function wordsIn(value: unknown, out: string[] = []): string[] {
  const SKIP = new Set([
    "id",
    "type",
    "src",
    "href",
    "poster",
    "captions",
    "kind",
    "status",
    "mode",
    "template",
    "frame",
    "position",
    "url",
    "embed",
    "hash",
    "voice",
  ]);
  if (typeof value === "string") {
    if (value.length > 2 && !/^(https?:|\/api\/|\/)\S*$/.test(value)) out.push(value);
  } else if (Array.isArray(value)) for (const v of value) wordsIn(v, out);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) if (!SKIP.has(k)) wordsIn(v, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Progress, in the path's own gentle terms
// ---------------------------------------------------------------------------------------------

/** Why a saved step can't be opened any more. */
export type Gone = "retired" | "restricted" | "page";
export const GONE_TEXT: Record<Gone, string> = {
  retired: "This has been retired, so it can’t be opened any more.",
  restricted: "You no longer have access to this.",
  page: "This page isn’t offered by itself any more.",
};

export type StepView = {
  id: string;
  key: string;
  kind: ItemKind;
  /** The title as it was when saved: kept for their history even if the content goes. */
  title: string;
  parentTitle: string | null;
  phase: string | null;
  reason: string | null;
  note: string;
  revisit: boolean;
  reviewedAt: string | null;
  openedAt: string | null;
  addedAt: string;
  /** The content as it is now, or null when they can't open it any more. */
  item: CatalogueItem | null;
  gone: { why: Gone; replacement: { key: string; kind: ItemKind; title: string } | null } | null;
  /** The content has changed since they saved or last opened it. */
  updated: boolean;
  /** Reviewed for now, or finished in the content's own record. */
  explored: boolean;
};

/** The content's own record, in words: the authoritative one. */
export function nativeLabel(kind: ItemKind, state: NativeState): string | null {
  if (state === "completed") return kind === "course" ? "Course completed" : kind === "page" ? "Page finished" : "Topic completed";
  if (state === "started") return kind === "page" ? null : "In progress";
  return null;
}

export function pathProgress(steps: StepView[]) {
  const open = steps.filter((s) => s.item);
  const explored = open.filter((s) => s.explored).length;
  const next = open.find((s) => !s.explored) ?? null;
  return {
    total: open.length,
    explored,
    next,
    /** Every step they can still open has been explored. Personal: nothing official follows from it. */
    done: open.length > 0 && explored === open.length,
    minutesLeft: open.filter((s) => !s.explored).reduce((n, s) => n + (s.item?.minutes ?? 0), 0),
    label: open.length ? `You’ve explored ${explored} of ${open.length} step${open.length === 1 ? "" : "s"}` : "No steps yet",
  };
}

/** Request states for a missing-topic request, as the learner and the content owner see them. */
export const REQUEST_STATES = {
  new: { label: "Sent", owner: "New" },
  reviewing: { label: "Being looked at", owner: "Reviewing" },
  planned: { label: "Planned", owner: "Planned" },
  published: { label: "Published", owner: "Published" },
  declined: { label: "Not going ahead", owner: "Declined" },
} as const;
export type RequestState = keyof typeof REQUEST_STATES;
