/*
  "Notes to a Younger Me" (docs/notes-to-a-younger-me.md). Oversized playing cards: the front is a moment a new
  colleague will recognise; the back is a candid note from someone further along, with a phrase to adapt. Cards
  come from one reviewed library; a Magazine deck deals three to five of them, learners keep favourites in Pocket
  Deck, and colleagues can leave a note for the next person, which is published only after review and their
  approval of any edits.

  - Peer wisdom inside a governed experience. A note never replaces the approved policy, and a helpful vote,
    rank or tenure never certifies it.
  - Rank and badge are editorial motifs, never a competency score. K and Q aren't gender labels.
  - A card a policy owner flags for review stays readable with copying off; a withdrawn card disappears from every
    deck and Pocket Deck shows why.
  Everything here is pure, so the server, the pages and the editor share it.
*/

import { identifierWarnings } from "./redpen";

export const BADGES = { CP: "Care Partner", CC: "Care Coordinator", CLIN: "Clinical", FIN: "Finance" } as const;
export type Badge = keyof typeof BADGES;
export const RANKS = { A: "Lead mentor", K: "Senior mentor", Q: "Senior mentor", "10": "Field note" } as const;
export type Rank = keyof typeof RANKS;
export const NOTE_AUDIENCES = { partner: "Care Partners", coordinator: "Care coordinators", staff: "Trilogy Care staff" } as const;
export type NoteAudience = keyof typeof NOTE_AUDIENCES;
export const TOPICS = {
  boundaries: "Setting boundaries",
  calls: "Difficult calls",
  ownership: "Taking ownership",
  "asking-for-help": "Asking for help",
  other: "Other",
} as const;
export type Topic = keyof typeof TOPICS;

/**
  draft (the contributor is writing) → submitted (with the editors) → changes (an editor edited it; the author
  approves the wording) → reviewed / endorsed (published). Then possibly needs_review (a policy changed: readable,
  copying off, not dealt into new decks) or withdrawn (gone). declined: the editors won't publish it.
*/
export const STATES = {
  draft: "Draft",
  submitted: "Waiting for review",
  changes: "Edited: waiting for the author’s OK",
  reviewed: "Editor-reviewed for learning",
  endorsed: "Policy-owner endorsed",
  needs_review: "Being re-reviewed",
  withdrawn: "Withdrawn",
  declined: "Not published",
} as const;
export type NoteState = keyof typeof STATES;
export const PUBLISHED: NoteState[] = ["reviewed", "endorsed", "needs_review"];
/** Dealt into a new deck: published and current. */
export const DEALABLE: NoteState[] = ["reviewed", "endorsed"];

export type MentorNoteData = {
  badge: Badge;
  rank: Rank;
  /** The moment, in the first person: “I thought saying yes to everything made me a good Care Partner.” */
  hook: string;
  /** One to three sentences, fictionalised. */
  scenario: string;
  /** The candid note to a younger self. */
  note: string;
  /** One phrase or action to adapt. */
  phrase: string;
  authorName: string;
  authorRole: string;
  /** Opt-in broad context, such as “five years in community care”. */
  experience: string;
  topics: Topic[];
  audiences: NoteAudience[];
  policyIds: string[];
  /** What approved source supports a rule it mentions, in a line. */
  policyNote: string;
  communityPostId: string;
  /** A fictional seed or illustrative card, labelled as such. */
  illustrative: boolean;
  consent: { audience: boolean; attribution: boolean };
};

export type MentorNote = {
  id: string;
  version: number;
  state: NoteState;
  data: MentorNoteData;
  /** The contributor's Hub user, or empty for an editor-written seed. */
  authorUser: string;
  /** Why it was flagged, withdrawn or declined. */
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
  updatedAt: string;
};

export const NOTE_NOTICE = "Peer wisdom, not policy. Adapt it to the person, and check the current approved guidance.";
export const PHRASE_NOTE = "Adapt this to the person and check the current policy.";
export const FICTIONALISE =
  "Fictionalise any client details: leave out names, dates, addresses, incident details and anything that identifies a supplier. If it’s an active client concern or incident, use the operational channel instead.";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const many = <T extends string>(v: unknown, all: readonly T[]) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is T => all.includes(x as T)))];

/** A note's fields, cleaned from stored or posted JSON. Never throws: what's missing shows up in noteProblems. */
export function cleanNote(raw: unknown): MentorNoteData {
  const o = obj(raw);
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const c = obj(o.consent);
  return {
    badge: (Object.keys(BADGES) as Badge[]).includes(o.badge as Badge) ? (o.badge as Badge) : "CP",
    rank: (Object.keys(RANKS) as Rank[]).includes(o.rank as Rank) ? (o.rank as Rank) : "10",
    hook: s(o.hook, 160),
    scenario: s(o.scenario, 500),
    note: s(o.note, 900),
    phrase: s(o.phrase, 400),
    authorName: s(o.authorName, 60),
    authorRole: s(o.authorRole, 80),
    experience: s(o.experience, 80),
    topics: many(o.topics, Object.keys(TOPICS) as Topic[]),
    audiences: many(o.audiences, Object.keys(NOTE_AUDIENCES) as NoteAudience[]),
    policyIds: (Array.isArray(o.policyIds) ? o.policyIds : [])
      .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
      .slice(0, 4)
      .map((x) => x.slice(0, 80)),
    policyNote: s(o.policyNote, 300),
    communityPostId: s(o.communityPostId, 80),
    illustrative: o.illustrative === true,
    consent: { audience: c.audience === true, attribution: c.attribution === true },
  };
}

/** What stops a note from being submitted (or published): the four parts, who it's for, consent, and no identifiers. */
export function noteProblems(d: MentorNoteData): string[] {
  const out: string[] = [];
  if (d.hook.trim().length < 10) out.push("Write the moment, in your own words.");
  if (d.scenario.trim().length < 20) out.push("Describe the situation in a sentence or two (fictionalised).");
  if (d.note.trim().length < 40) out.push("Write your note to your younger self.");
  if (!d.topics.length) out.push("Choose a topic.");
  if (!d.audiences.length) out.push("Choose who may see it.");
  if (!d.authorName.trim()) out.push("Choose how your name appears.");
  if (!d.consent.audience) out.push("Agree to the audience you’ve chosen.");
  if (!d.consent.attribution) out.push("Agree to how it’s attributed.");
  const ids = identifierWarnings([d.hook, d.scenario, d.note, d.phrase].join("\n"));
  if (ids.length) out.push(`It looks like it contains ${ids.join(" and ")}. Take those out.`);
  return out;
}

export const isPublished = (n: Pick<MentorNote, "state">) => PUBLISHED.includes(n.state);
/** Copying the phrase is off while a note is being re-reviewed, and of course once it's withdrawn. */
export const canCopyPhrase = (n: Pick<MentorNote, "state" | "data">) => DEALABLE.includes(n.state) && Boolean(n.data.phrase.trim());
export const reviewLabel = (n: Pick<MentorNote, "state">) =>
  n.state === "endorsed" ? "Policy-owner endorsed" : n.state === "reviewed" ? "Editor-reviewed for learning" : "Peer note";

// ---------------------------------------------------------------------------------------------
// The Magazine block
// ---------------------------------------------------------------------------------------------

export const SELECTION = { curated: "Curated only", pool: "Reviewed pool", hybrid: "Hybrid: pinned cards, then the pool" } as const;
export type Selection = keyof typeof SELECTION;
export const NOTE_MODES = { read: "Read and reflect", think: "Think, then flip" } as const;
export type NoteMode = keyof typeof NOTE_MODES;

export type NotesDeckData = {
  title: string;
  intro: string;
  topics: Topic[];
  audiences: NoteAudience[];
  selection: Selection;
  /** Curated cards, or pinned anchors in hybrid mode, in order. */
  noteIds: string[];
  count: number;
  deal: boolean;
  contribute: boolean;
  mode: NoteMode;
  /** Optional: asked once, after the cards. */
  reflection: string;
};

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};

export function parseNotesDeck(o: Raw, where: string, h: ParseHelpers): NotesDeckData {
  const selection: Selection = o.selection === "curated" || o.selection === "pool" ? o.selection : "hybrid";
  const noteIds = [
    ...new Set((Array.isArray(o.noteIds) ? o.noteIds : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x))),
  ].slice(0, 5);
  const topics = many(o.topics, Object.keys(TOPICS) as Topic[]);
  if (selection === "curated" && !noteIds.length) h.unfinished(`${where} needs the cards to show.`);
  if (selection !== "curated" && !topics.length) h.unfinished(`${where} needs a topic to draw cards from.`);
  return {
    title: h.str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: h.str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    topics,
    audiences: many(o.audiences, Object.keys(NOTE_AUDIENCES) as NoteAudience[]),
    selection,
    noteIds,
    count: Number.isInteger(o.count) ? Math.min(5, Math.max(3, o.count as number)) : 3,
    deal: o.deal !== false,
    contribute: o.contribute === true,
    mode: o.mode === "think" ? "think" : "read",
    reflection: h.str(o.reflection, `${where} reflection prompt`, { max: 200 }) ?? "",
  };
}

/** Can this reader see this note? Its audience must include their role, and it must be published. */
export const visibleTo = (n: Pick<MentorNote, "state" | "data">, audience: string) => isPublished(n) && n.data.audiences.includes(audience as NoteAudience);

export type Candidate = { note: MentorNote; helpful: number };

/** A stable pseudo-random number from a string, so a learner's deck never reorders mid-lesson. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h / 4294967296;
};

/**
  The pool, best first: on topic, for this reader, dealable. Ranked by a blend of helpfulness (dampened, so a few
  votes don't dominate), freshness and a stable per-learner shuffle; then spread so no author or badge repeats
  while another is available.
*/
export function rankPool(cands: Candidate[], b: Pick<NotesDeckData, "topics" | "audiences">, audience: string, seed: string, today: string): MentorNote[] {
  const eligible = cands.filter(
    (c) =>
      DEALABLE.includes(c.note.state) &&
      c.note.data.audiences.includes(audience as NoteAudience) &&
      (!b.audiences.length || b.audiences.includes(audience as NoteAudience)) &&
      c.note.data.topics.some((t) => b.topics.includes(t)) &&
      c.note.data.consent.audience,
  );
  const score = (c: Candidate) => {
    const days = c.note.reviewedAt && today ? Math.max(0, (Date.parse(today) - Date.parse(c.note.reviewedAt.slice(0, 10))) / 86_400_000) : 365;
    return Math.log2(1 + c.helpful) * 0.5 + Math.max(0, 1 - days / 365) * 0.3 + hash(`${seed}:${c.note.id}`) * 0.6;
  };
  const sorted = eligible.sort((x, y) => score(y) - score(x)).map((c) => c.note);
  const out: MentorNote[] = [];
  const rest = [...sorted];
  while (rest.length) {
    const authors = new Set(out.map((n) => n.data.authorName));
    const badges = new Set(out.slice(-1).map((n) => n.data.badge));
    const i = rest.findIndex((n) => !authors.has(n.data.authorName) && !badges.has(n.data.badge));
    const j = i >= 0 ? i : rest.findIndex((n) => !authors.has(n.data.authorName));
    out.push(...rest.splice(j >= 0 ? j : 0, 1));
  }
  return out;
}

/** The first deal for a learner: pinned or curated cards that are dealable and for them, then the ranked pool. */
export function dealDeck(cands: Candidate[], b: NotesDeckData, audience: string, seed: string, today: string): string[] {
  const byId = new Map(cands.map((c) => [c.note.id, c.note]));
  const pinned = b.noteIds.filter((id) => {
    const n = byId.get(id);
    return n && DEALABLE.includes(n.state) && visibleTo(n, audience);
  });
  if (b.selection === "curated") return pinned.slice(0, b.count);
  const pool = rankPool(cands, b, audience, seed, today).filter((n) => !pinned.includes(n.id));
  const fill = b.selection === "pool" ? pool : pool;
  const start = b.selection === "pool" ? [] : pinned;
  return [...start, ...fill.map((n) => n.id)].slice(0, b.count);
}

/** "Deal another note": the next ranked card not already seen; null when the pool is exhausted. */
export function dealAnother(cands: Candidate[], b: NotesDeckData, audience: string, seed: string, today: string, seen: string[]): string | null {
  if (b.selection === "curated") return null;
  return rankPool(cands, b, audience, seed, today).find((n) => !seen.includes(n.id))?.id ?? null;
}

/** The learner's place in a deck: dealt cards (stable), what they turned over, their private first instincts, and a reflection. */
export type DeckState = {
  dealt: string[];
  flipped: string[];
  instincts: Record<string, string>;
  reflection: string;
  completed: boolean;
  versions: Record<string, number>;
};
export const emptyDeck = (): DeckState => ({ dealt: [], flipped: [], instincts: {}, reflection: "", completed: false, versions: {} });

/** Done when the backs of the first dealt cards have been read and, if there's a reflection prompt, it's answered once. */
export function deckComplete(b: Pick<NotesDeckData, "reflection" | "count">, s: DeckState) {
  const first = s.dealt.slice(0, b.count);
  return first.length > 0 && first.every((id) => s.flipped.includes(id)) && (!b.reflection || Boolean(s.reflection.trim()));
}
