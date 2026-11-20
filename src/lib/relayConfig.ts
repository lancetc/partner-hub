/*
  Ava Relay settings (docs/ava-relay.md), kept in a Magazine course's document so each published edition keeps
  the context it was published with. No imports from lib/magazine: that file reads these when it reads a course.

  Course level: whether the relay is on, whether Work guidance is offered, which approved collections it may
  search, and the approved routes shown when a question is a real concern. Page level: why Ava is on this page,
  where the page sits in the story, who she may talk about, her opening line and suggested questions, and what
  she holds back.
*/

/** The approved collections Work guidance may search. Stories and news are never among them. */
export const RELAY_SOURCES = {
  playbooks: "Live SOP playbooks",
  topics: "Published Topics",
  resources: "Resources library",
  webinars: "Webinars",
} as const;
export type RelaySource = keyof typeof RELAY_SOURCES;
export const RELAY_SOURCE_HINTS: Record<RelaySource, string> = {
  playbooks: "Approved releases with an owner, an effective date and a review date. The strongest source.",
  topics: "Topics learners can already open.",
  resources: "The Resources library’s documents and checklists.",
  webinars: "Published webinars and their transcripts.",
};

export type RelayRoute = { label: string; href: string };
export type RelayCourse = {
  enabled: boolean;
  /** The Work guidance tab. Off, Ava only talks about the story. */
  work: boolean;
  sources: RelaySource[];
  /** Approved places to take a real concern, shown with a route answer. */
  routes: RelayRoute[];
};
export const emptyRelayCourse = (): RelayCourse => ({ enabled: false, work: true, sources: ["playbooks", "topics", "resources"], routes: [] });

/** A character Ava may talk about here, at the approved profile version chosen. */
export type RelayPick = { id: string; revision: number };
/** Who looked through the test answers, when, and the settings as they were (a change clears it). */
export type RelayReview = { by: string; at: string; hash: string };
export type RelayPage = {
  /** On or off for this page. Not set: on when the page has a purpose and isn't an assessment. */
  mode?: "on" | "off";
  /** Which behaviour, question or decision Ava helps the learner think through here: the reason she's on the page. */
  purpose: string;
  /** The Story Plan beat this page tells, in the author's words. */
  beat: string;
  /** The approved episode this page sits at: nothing later in the story is given to Ava. */
  episode: string;
  /** The activity (a block on this page) the hints are for. */
  activity: string;
  characters: RelayPick[];
  opening: string;
  prompts: string[];
  /** Blocks on this page Ava isn't told about until the activity has been attempted. */
  hold: string[];
  /** Topics to steer away from on this page, in the author's words. */
  redirect: string;
  /** For reviewers only. Never sent to learners or to the model. */
  notes: string;
  reviewed?: RelayReview;
};
export const emptyRelayPage = (): RelayPage => ({
  purpose: "",
  beat: "",
  episode: "",
  activity: "",
  characters: [],
  opening: "",
  prompts: [],
  hold: [],
  redirect: "",
  notes: "",
});

export const RELAY_LIMITS = { purpose: 400, beat: 200, opening: 320, prompt: 60, prompts: 3, redirect: 400, notes: 600, routes: 4, characters: 4 } as const;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const ID = /^[\w-]{1,80}$/;
/** A page on the Hub, a web address, a phone number or an email: nothing else can be a route. */
export const safeRoute = (href: string) => /^(\/(?!\/)|https:\/\/|mailto:|tel:)/.test(href);

/** The course's relay settings, tidied. Nothing kept when the relay was never set up. */
export function cleanRelayCourse(raw: unknown): RelayCourse | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const keys = Object.keys(RELAY_SOURCES) as RelaySource[];
  return {
    enabled: o.enabled === true,
    work: o.work !== false,
    sources: [...new Set(list(o.sources, 8).filter((x): x is RelaySource => keys.includes(x as RelaySource)))],
    routes: list(o.routes, RELAY_LIMITS.routes)
      .map((r) => ({ label: str(obj(r)?.label, 80), href: str(obj(r)?.href, 300) }))
      .filter((r) => r.label && safeRoute(r.href)),
  };
}

/** A page's relay settings, tidied. Nothing kept when there is nothing set. */
export function cleanRelayPage(raw: unknown): RelayPage | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const rv = obj(o.reviewed);
  const page: RelayPage = {
    ...(o.mode === "on" || o.mode === "off" ? { mode: o.mode } : {}),
    purpose: str(o.purpose, RELAY_LIMITS.purpose),
    beat: str(o.beat, RELAY_LIMITS.beat),
    episode: ID.test(String(o.episode ?? "")) ? String(o.episode) : "",
    activity: ID.test(String(o.activity ?? "")) ? String(o.activity) : "",
    characters: list(o.characters, RELAY_LIMITS.characters)
      .map((c) => ({ id: String(obj(c)?.id ?? ""), revision: Math.max(0, Math.floor(Number(obj(c)?.revision) || 0)) }))
      .filter((c, i, all) => ID.test(c.id) && all.findIndex((x) => x.id === c.id) === i),
    opening: str(o.opening, RELAY_LIMITS.opening),
    prompts: [
      ...new Set(
        list(o.prompts, 8)
          .map((p) => str(p, RELAY_LIMITS.prompt))
          .filter(Boolean),
      ),
    ].slice(0, RELAY_LIMITS.prompts),
    hold: [...new Set(list(o.hold, 40).filter((x): x is string => typeof x === "string" && ID.test(x)))],
    redirect: str(o.redirect, RELAY_LIMITS.redirect),
    notes: str(o.notes, RELAY_LIMITS.notes),
  };
  if (rv && typeof rv.by === "string" && typeof rv.hash === "string" && typeof rv.at === "string" && !Number.isNaN(Date.parse(rv.at)))
    page.reviewed = { by: rv.by.slice(0, 80), at: new Date(rv.at).toISOString(), hash: rv.hash.slice(0, 24) };
  const empty =
    !page.mode && !page.purpose && !page.beat && !page.episode && !page.activity && !page.characters.length && !page.opening && !page.prompts.length;
  return empty && !page.hold.length && !page.redirect && !page.notes ? undefined : page;
}

type PageLike = { kind: "content" | "assessment"; relay?: RelayPage };

/**
  Whether learners get the dial bar on a page. The course has to have the relay on, and the page a purpose (the
  reason Ava is there). An assessment page has it only when an author turns it on there; any page can turn it off.
*/
export function relayOn(course: RelayCourse | undefined, page: PageLike): boolean {
  const r = page.relay;
  if (!course?.enabled || !r || r.mode === "off" || !r.purpose) return false;
  return page.kind === "assessment" ? r.mode === "on" : true;
}

/** A short, stable fingerprint of text: enough to notice that settings changed since they were reviewed. */
export function relayHash(text: string) {
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = (a * 33) ^ c;
    b = (b * 33) ^ c;
  }
  return ((a >>> 0) * 4096 + (b >>> 0)).toString(36);
}

/** What a review covers: everything Ava is given or told for this page, and the course's source scope. Reviewer notes aren't part of it. */
export function reviewHash(course: RelayCourse | undefined, page: RelayPage) {
  // Tidied first, as a save tidies them, so a review made in the editor still matches once the draft is saved.
  const { notes: _notes, reviewed: _reviewed, ...rest } = cleanRelayPage(page) ?? emptyRelayPage();
  void _notes;
  void _reviewed;
  return relayHash(JSON.stringify([cleanRelayCourse(course) ?? null, rest]));
}
export const relayReviewed = (course: RelayCourse | undefined, page: RelayPage) => Boolean(page.reviewed && page.reviewed.hash === reviewHash(course, page));

/**
  What stops a course with the relay on being published, and suggestions that don't. A page Ava is switched on for
  needs its reason, and its test answers looked through since the settings last changed.
*/
export function relayChecks(course: RelayCourse | undefined, pages: (PageLike & { id: string; title: string; relay?: RelayPage })[]) {
  const blocking: string[] = [];
  const suggestions: string[] = [];
  if (!course?.enabled) return { blocking, suggestions };
  const name = (p: { title: string }, i: number) => p.title || `Page ${i + 1}`;
  pages.forEach((p, i) => {
    const r = p.relay;
    if (r?.mode === "on" && !r.purpose)
      blocking.push(`Ava Relay on “${name(p, i)}”: say what Ava helps the learner think through there, or turn it off for the page.`);
    if (!relayOn(course, p) || !r) return;
    if (!relayReviewed(course, r)) blocking.push(`Ava Relay on “${name(p, i)}”: run the test questions and mark the answers reviewed.`);
    if (!r.opening) suggestions.push(`Ava Relay on “${name(p, i)}” has no opening line, so Ava uses a general one.`);
    if (!r.characters.length && !r.episode) suggestions.push(`Ava Relay on “${name(p, i)}” has no character or episode chosen, so Ava only knows the page.`);
    if (p.kind === "assessment") suggestions.push(`Ava Relay is on for the assessment page “${name(p, i)}”. Check that is intended.`);
  });
  if (course.work && !course.sources.length) blocking.push("Ava Relay: choose at least one approved collection for Work guidance, or turn Work guidance off.");
  if (course.work && !course.routes.length) suggestions.push("Ava Relay has no approved route for real concerns, so Ava gives the general one.");
  return { blocking, suggestions };
}

/** What a reader's copy of the course carries: that the relay is on for a page, and nothing an author wrote about it. */
export function relayForReaders<D extends { relay?: RelayCourse; pages: (PageLike & { relay?: RelayPage })[] }>(doc: D): D {
  const pages = doc.pages.map((p) => {
    const { relay, ...rest } = p;
    void relay;
    return relayOn(doc.relay, p) ? { ...rest, relay: { ...emptyRelayPage(), mode: "on" as const, purpose: "-" } } : rest;
  });
  const { relay, ...rest } = doc;
  return { ...rest, ...(relay?.enabled && { relay: { enabled: true, work: relay.work, sources: [], routes: [] } }), pages } as D;
}
