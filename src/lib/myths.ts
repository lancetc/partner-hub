/*
  Myth vs Reality tiles (docs/myth-vs-reality.md). Recurring participant and family questions, each answered in
  about 30 seconds, with the exception that matters, what to check for this person, the exact source, and an
  approved email reply staff can copy (never send) after reviewing it.

  Tiles live in one canonical, versioned library. A course block and the Resources page both show a tile's
  current approved version, so copies never drift apart. An approved version is never edited: a change is a new
  draft that needs sign-off again. Everything here is pure, so the server, the pages and the editor share it.
*/

export const CATEGORIES = { budget: "Budget", "self-management": "Self-management", services: "Services", "care-plan": "Care plan", other: "Other" } as const;
export type Category = keyof typeof CATEGORIES;

export const TILE_AUDIENCES = { partner: "Care Partners", coordinator: "Care coordinators", staff: "Trilogy Care staff" } as const;
export type TileAudience = keyof typeof TILE_AUDIENCES;

export const APPLICABILITY = {
  sah_ongoing: "Support at Home, ongoing services",
  sah_transitioned: "Transitioned from a Home Care Package",
  sah_short_term: "Support at Home, short-term pathways",
  chsp: "Commonwealth Home Support Programme",
} as const;
export type Applicability = keyof typeof APPLICABILITY;

export const SOURCE_TYPES = { legislation: "Legislation", guidance: "Official program guidance", internal: "Internal policy" } as const;
export type SourceType = keyof typeof SOURCE_TYPES;

export type Anchor = {
  type: SourceType;
  document: string;
  /** The exact section or clause, such as "Managing unspent funds > Unspent quarterly budget". */
  section: string;
  publisher: string;
  url: string;
  /** For internal policy: its ID in the policy repository. */
  internalId: string;
  effective: string;
  verifiedOn: string;
};

export type MythTileData = {
  /** In the speaker's own words: a fictional composite, never a real client. */
  quote: string;
  category: Category;
  audiences: TileAudience[];
  applicability: Applicability[];
  /** About 30 seconds to say: 60 to 85 words. */
  answer: string;
  /** The exception that changes the answer, when there is one. Shown with the answer, never behind another click. */
  exception: string;
  /** One to three checks before giving anyone a personal answer. */
  checks: string[];
  /** If a family member asks instead. */
  familyWording: string;
  anchors: Anchor[];
  message: { subject: string; body: string };
  /** The placeholders the message may contain, such as "[Name]". Staff replace them before using the text. */
  placeholders: string[];
  /** When copying is allowed, in a line. */
  copyNote: string;
  /** Funding or fees: Finance signs off. Clinical claims: Clinical signs off. */
  funding: boolean;
  clinical: boolean;
  /** Drafted with AI help: stays unpublishable until a person confirms they've checked it. */
  aiDraft: boolean;
  reviewDue: string;
  approval: { owner: string; quality: string; operations: string; finance: string; clinical: string; communications: string; approvedOn: string };
};

export type TileStatus = "draft" | "approved" | "retired";
export type Tile = {
  id: string;
  version: number;
  status: TileStatus;
  /** Paused by an author (a policy change, say): shown as under review, with copying off. */
  paused: boolean;
  data: MythTileData;
  approvedBy: string;
  approvedAt: string;
  updatedAt: string;
};

export const NOT_SENT = "Copied, not sent";
export const TILE_NOTICE = "General rules, not anyone’s own entitlements. Check the person’s current documents before giving a personal answer.";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const wordCount = words;
/** Roughly how long it takes to say, at a calm pace. */
export const secondsToSay = (s: string) => Math.round(words(s) / 2.5);
export const PLACEHOLDER = /\[[^\]\n]{1,40}\]/g;
export const placeholdersIn = (s: string) => [...new Set(s.match(PLACEHOLDER) ?? [])];
const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
  What stops a draft from being approved: an exact source (document, section, and a link or internal ID, with
  when it was checked), applicability and audience, one to three checks, the message and its placeholders, a
  review date, a person's check of any AI draft, and the right reviewers.
*/
export function tileProblems(d: MythTileData): string[] {
  const out: string[] = [];
  if (!d.quote.trim()) out.push("Add the question, in the speaker’s words.");
  if (!d.answer.trim()) out.push("Add the 30-second answer.");
  if (!d.audiences.length) out.push("Choose who it’s for.");
  if (!d.applicability.length) out.push("Choose which programs it applies to.");
  const checks = d.checks.filter((c) => c.trim());
  if (checks.length < 1 || checks.length > 3) out.push("Add one to three checks for this person.");
  const exact = d.anchors.filter((a) => a.document.trim() && a.section.trim() && (/^https:\/\//.test(a.url) || a.internalId.trim()) && date(a.verifiedOn));
  if (!exact.length) out.push("Add at least one exact source: the document, the section or clause, a link or internal ID, and when it was checked.");
  if (d.anchors.some((a) => a.type === "legislation" && !a.section.trim())) out.push("Name the section of the legislation.");
  if (!d.message.subject.trim() || !d.message.body.trim()) out.push("Add the email subject and body.");
  const extra = placeholdersIn(`${d.message.subject}\n${d.message.body}`).filter((p) => !d.placeholders.includes(p));
  if (extra.length) out.push(`Approve or remove these placeholders: ${extra.join(", ")}.`);
  if (!date(d.reviewDue)) out.push("Set the next review date.");
  if (d.aiDraft) out.push("Confirm a person has checked the AI draft: its source section, exceptions, numbers and email.");
  const a = d.approval;
  const need: [string, string][] = [
    [a.owner, "the claim owner"],
    [a.quality, "Policy or Quality"],
    [a.operations, "Care Operations"],
    [a.communications, "Communications"],
  ];
  if (d.funding) need.push([a.finance, "Finance (it covers funding or fees)"]);
  if (d.clinical) need.push([a.clinical, "Clinical (it makes clinical claims)"]);
  const missing = need.filter(([v]) => !v.trim()).map(([, l]) => l);
  if (missing.length) out.push(`Record sign-off from ${missing.join(", ")}.`);
  if (!date(a.approvedOn)) out.push("Record the sign-off date.");
  return out;
}

export type TileState = "draft" | "approved" | "under-review";
/** An approved tile past its review date, or paused, is under review: it's still readable, but nothing can be copied. */
export function tileState(t: Pick<Tile, "status" | "paused" | "data">, today: string): TileState {
  if (t.status !== "approved") return "draft";
  if (t.paused || (today && t.data.reviewDue && t.data.reviewDue < today)) return "under-review";
  return "approved";
}
export const canCopy = (t: Pick<Tile, "status" | "paused" | "data">, today: string) => tileState(t, today) === "approved";

/** Search by a phrase someone used, by topic and by audience. */
export function matchTiles<T extends { data: MythTileData }>(tiles: T[], q: string, category: string, audience: string): T[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return tiles.filter((t) => {
    if (category && t.data.category !== category) return false;
    if (audience && !t.data.audiences.includes(audience as TileAudience)) return false;
    const hay = `${t.data.quote} ${t.data.answer} ${t.data.exception} ${CATEGORIES[t.data.category]}`.toLowerCase();
    return terms.every((x) => hay.includes(x));
  });
}

/** A tile's fields, cleaned from stored or posted JSON. Never throws: what's missing shows up in tileProblems. */
export function cleanTile(raw: unknown): MythTileData {
  const o = obj(raw);
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const list = <T extends string>(v: unknown, all: readonly T[]) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is T => all.includes(x as T)))];
  const m = obj(o.message);
  const a = obj(o.approval);
  return {
    quote: s(o.quote, 200),
    category: (Object.keys(CATEGORIES) as Category[]).includes(o.category as Category) ? (o.category as Category) : "other",
    audiences: list(o.audiences, Object.keys(TILE_AUDIENCES) as TileAudience[]),
    applicability: list(o.applicability, Object.keys(APPLICABILITY) as Applicability[]),
    answer: s(o.answer, 900),
    exception: s(o.exception, 300),
    checks: (Array.isArray(o.checks) ? o.checks : []).slice(0, 3).map((x) => s(x, 200)),
    familyWording: s(o.familyWording, 600),
    anchors: (Array.isArray(o.anchors) ? o.anchors : []).slice(0, 4).map((x) => {
      const y = obj(x);
      return {
        type: (Object.keys(SOURCE_TYPES) as SourceType[]).includes(y.type as SourceType) ? (y.type as SourceType) : "guidance",
        document: s(y.document, 200),
        section: s(y.section, 200),
        publisher: s(y.publisher, 160),
        url: typeof y.url === "string" && /^https:\/\//.test(y.url) ? y.url.slice(0, 400) : "",
        internalId: s(y.internalId, 80),
        effective: typeof y.effective === "string" && date(y.effective) ? y.effective : "",
        verifiedOn: typeof y.verifiedOn === "string" && date(y.verifiedOn) ? y.verifiedOn : "",
      };
    }),
    message: { subject: s(m.subject, 160), body: s(m.body, 2000) },
    placeholders: (Array.isArray(o.placeholders) ? o.placeholders : [])
      .filter((x): x is string => typeof x === "string" && /^\[[^\]\n]{1,40}\]$/.test(x))
      .slice(0, 6),
    copyNote: s(o.copyNote, 300),
    funding: o.funding === true,
    clinical: o.clinical === true,
    aiDraft: o.aiDraft === true,
    reviewDue: typeof o.reviewDue === "string" && date(o.reviewDue) ? o.reviewDue : "",
    approval: {
      owner: s(a.owner, 120),
      quality: s(a.quality, 120),
      operations: s(a.operations, 120),
      finance: s(a.finance, 120),
      clinical: s(a.clinical, 120),
      communications: s(a.communications, 120),
      approvedOn: typeof a.approvedOn === "string" && date(a.approvedOn) ? a.approvedOn : "",
    },
  };
}
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// ---------------------------------------------------------------------------------------------
// The Magazine block: which library tiles to show, and how
// ---------------------------------------------------------------------------------------------

export const MODES = { learning: "Learning: practise saying it before the approved reply", quick: "Quick reference: everything at once" } as const;
export type Mode = keyof typeof MODES;

export type MythBlockData = {
  title: string;
  intro: string;
  /** Library tile IDs, in order. The current approved version of each is shown. */
  tileIds: string[];
  mode: Mode;
  /** Offer "How would you say it?" before the approved reply (learning mode only). */
  practice: boolean;
  /** Offer "Send to Client" (copy only). */
  showCopy: boolean;
  /** How many tiles to open for the block to count as done. */
  toOpen: number;
};

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  unfinished: (problem: string) => void;
};

export function parseMythBlock(o: Raw, where: string, h: ParseHelpers): MythBlockData {
  const tileIds = [
    ...new Set((Array.isArray(o.tileIds) ? o.tileIds : []).filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,80}$/.test(x))),
  ].slice(0, 8);
  if (!tileIds.length) h.unfinished(`${where} needs at least one tile from the library.`);
  const mode: Mode = o.mode === "quick" ? "quick" : "learning";
  const toOpen = Number.isInteger(o.toOpen) ? Math.min(Math.max(1, o.toOpen as number), Math.max(1, tileIds.length)) : Math.min(3, Math.max(1, tileIds.length));
  return {
    title: h.str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: h.str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    tileIds,
    mode,
    practice: mode === "learning" && o.practice !== false,
    showCopy: o.showCopy !== false,
    toOpen,
  };
}

export const EVENTS = ["opened", "source", "practice", "copied", "copy-failed"] as const;
export type MythEvent = (typeof EVENTS)[number];
