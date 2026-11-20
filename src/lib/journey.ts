/*
  The SaH Journey (docs/sah-journey.md): an illustrative Support at Home journey seen from four points of view
  (the older person, a family member, the Trilogy Care Coordinator and an independent provider), with decision
  points where a change affects each of them differently. Everything here is pure, so the server, the learner's
  page and the editor's preview run the same rules.

  - Story times are positions in a fictional case, never wait estimates.
  - Approval, a Notice of Decision, the Priority System, funding allocation and starting services stay distinct.
  - The family and provider tracks are perspectives, not decision-makers. What a person can see depends on consent
    and role.
  - A decision changes trust, clarity or readiness in the story. It never moves the government allocation date.
*/

export const PERSONA_IDS = ["person", "family", "coordinator", "provider"] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];
export const PERSONA_ROLES: Record<PersonaId, string> = {
  person: "The older person",
  family: "Family member",
  coordinator: "Trilogy Care Coordinator",
  provider: "Independent provider",
};

export type PersonaCard = {
  knows: string;
  matters: string;
  canDo: string;
  waiting: string;
  quote: string;
  /** Who can see this, and why: the access boundary for this perspective at this point. */
  visibility: string;
};

export type Milestone = {
  id: string;
  label: string;
  /** Fictional story time, such as "Month 3". */
  time: string;
  status: string;
  /** What the milestone means, in a sentence. */
  meaning: string;
  confirmed: string[];
  unknown: string[];
  /** A common misconception to prevent. */
  misconception: string;
  /** Who's responsible for what at this point. */
  responsible: string;
  source: { title: string; url: string };
  /** Inspecting all four lenses here counts towards finishing. */
  core: boolean;
  cards: Record<PersonaId, PersonaCard>;
};

export const DIMENSIONS = {
  safety: "Safety response",
  choice: "Arthur’s choice and privacy",
  status: "Status accuracy",
  family: "Family understanding",
  provider: "Provider readiness",
  followup: "Follow-up ownership",
} as const;
export type Dim = keyof typeof DIMENSIONS;

export const ROLES = { essential: "Needed here", helpful: "Helpful", insufficient: "Not enough on its own", unsafe: "A path to debrief" } as const;
export type OptionRole = keyof typeof ROLES;

export type TensionOption = {
  id: string;
  text: string;
  /** Who would do it. */
  owner: string;
  role: OptionRole;
  dim: Dim;
  feedback: string;
  /** What happens in the story if it's chosen. */
  consequence: string;
};
export type TensionArea = { id: string; label: string; options: TensionOption[]; gap: string };
export type Tension = {
  id: string;
  milestoneId: string;
  title: string;
  known: string[];
  check: string[];
  areas: TensionArea[];
  /** A sentence to say to the person or family member. */
  sayings: { id: string; text: string; to: string; good: boolean; feedback: string }[];
  /** The reviewed response, shown after. */
  reviewed: string;
};

export type JourneyBlockData = {
  title: string;
  intro: string;
  timeNote: string;
  personas: Record<PersonaId, { name: string; about: string }>;
  /** What the family member may be told, by the person's consent or authority. */
  consent: string;
  milestones: Milestone[];
  tensions: Tension[];
  source: { title: string; version: string; verifiedOn: string };
  approval: { owner: string; operations: string; clinical: string; quality: string; privacy: string; communications: string; approvedOn: string };
};

export const JOURNEY_NOTICE = "A fictional case. The people are made up, and nothing here contacts anyone, books anything or refers anyone.";
export const TIME_NOTE = "Fictional case timeline — not an estimate of your wait";

// ---------------------------------------------------------------------------------------------
// Reading a block from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type ParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/**
  The block's fields, checked. Every milestone needs all four perspectives (even "not told yet"), each decision
  point needs a safe option in every area and a path to debrief, and the journey needs sign-off from Care
  Operations, Clinical, Quality, Privacy and Communications.
*/
export function parseJourney(o: Raw, where: string, h: ParseHelpers): JourneyBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const ps = obj(o.personas);
  const personas = Object.fromEntries(
    PERSONA_IDS.map((p) => {
      const x = obj(ps[p]);
      return [
        p,
        {
          name: str(x.name, `${where}: ${PERSONA_ROLES[p].toLowerCase()}’s name`, { required: true, max: 60 }) ?? "",
          about: str(x.about, `${where}: about ${PERSONA_ROLES[p].toLowerCase()}`, { max: 400 }) ?? "",
        },
      ];
    }),
  ) as JourneyBlockData["personas"];

  const milestones = list(o.milestones, where, "milestones", 10).map((m, i): Milestone => {
    const at = `${where} milestone ${i + 1}`;
    const cs = obj(m.cards);
    const s = obj(m.source);
    return {
      id: idOf(m.id, at),
      label: str(m.label, `${at} label`, { required: true, max: 100 }) ?? "",
      time: str(m.time, `${at} story time`, { required: true, max: 40 }) ?? "",
      status: str(m.status, `${at} status`, { required: true, max: 80 }) ?? "",
      meaning: str(m.meaning, `${at}: what it means`, { required: true, max: 400 }) ?? "",
      confirmed: texts(m.confirmed, `milestone ${i + 1} confirmed`, 240, 6),
      unknown: texts(m.unknown, `milestone ${i + 1} unknown`, 240, 6),
      misconception: str(m.misconception, `${at} misconception`, { max: 300 }) ?? "",
      responsible: str(m.responsible, `${at}: who’s responsible`, { max: 300 }) ?? "",
      source: {
        title: str(s.title, `${at} source`, { max: 200 }) ?? "",
        url: typeof s.url === "string" && /^https:\/\//.test(s.url) ? s.url.slice(0, 400) : "",
      },
      core: m.core !== false,
      cards: Object.fromEntries(
        PERSONA_IDS.map((p) => {
          const c = obj(cs[p]);
          const pat = `${at}, ${PERSONA_ROLES[p].toLowerCase()}`;
          return [
            p,
            {
              knows: str(c.knows, `${pat}: what they know`, { required: true, max: 400 }) ?? "",
              matters: str(c.matters, `${pat}: what matters to them`, { required: true, max: 400 }) ?? "",
              canDo: str(c.canDo, `${pat}: what they can do now`, { required: true, max: 400 }) ?? "",
              waiting: str(c.waiting, `${pat}: what they’re waiting for`, { required: true, max: 400 }) ?? "",
              quote: str(c.quote, `${pat}: in their words`, { max: 300 }) ?? "",
              visibility: str(c.visibility, `${pat}: who can see this`, { max: 300 }) ?? "",
            },
          ];
        }),
      ) as Record<PersonaId, PersonaCard>,
    };
  });
  if (milestones.length < 3) unfinished(`${where} needs at least three milestones.`);
  const milestoneIds = new Set(milestones.map((m) => m.id));

  const tensions = list(o.tensions, where, "decision points", 4).map((t, i): Tension => {
    const at = `${where} decision point ${i + 1}`;
    const areas = list(t.areas, at, "areas", 5).map((a, j): TensionArea => {
      const aat = `${at} area ${j + 1}`;
      const options = list(a.options, aat, "options", 6).map((x, k): TensionOption => ({
        id: idOf(x.id, `${aat} option ${k + 1}`),
        text: str(x.text, `${aat} option ${k + 1}`, { required: true, max: 240 }) ?? "",
        owner: str(x.owner, `${aat} option ${k + 1} owner`, { max: 80 }) ?? "",
        role: oneOf(x.role, Object.keys(ROLES) as OptionRole[], "helpful"),
        dim: oneOf(x.dim, Object.keys(DIMENSIONS) as Dim[], "status"),
        feedback: str(x.feedback, `${aat} option ${k + 1} feedback`, { required: true, max: 500 }) ?? "",
        consequence: str(x.consequence, `${aat} option ${k + 1}: what happens in the story`, { max: 300 }) ?? "",
      }));
      if (!options.some((x) => x.role === "essential")) unfinished(`${aat} needs at least one option that’s needed here.`);
      return {
        id: idOf(a.id, aat),
        label: str(a.label, `${aat} label`, { required: true, max: 80 }) ?? "",
        options,
        gap: str(a.gap, `${aat}: what’s missing if nothing needed is chosen`, { required: true, max: 300 }) ?? "",
      };
    });
    if (!areas.length) unfinished(`${at} needs at least one area to plan in.`);
    if (!areas.some((a) => a.options.some((x) => x.role === "unsafe"))) unfinished(`${at} needs at least one path to debrief.`);
    const sayings = list(t.sayings, at, "responses", 5).map((s, k) => ({
      id: idOf(s.id, `${at} response ${k + 1}`),
      text: str(s.text, `${at} response ${k + 1}`, { required: true, max: 600 }) ?? "",
      to: str(s.to, `${at} response ${k + 1}: to whom`, { max: 60 }) ?? "",
      good: s.good === true,
      feedback: str(s.feedback, `${at} response ${k + 1} feedback`, { required: true, max: 400 }) ?? "",
    }));
    if (!sayings.some((s) => s.good)) unfinished(`${at} needs a good response to choose.`);
    const milestoneId = typeof t.milestoneId === "string" && milestoneIds.has(t.milestoneId) ? t.milestoneId : "";
    if (!milestoneId) unfinished(`${at} needs the milestone it happens at.`);
    return {
      id: idOf(t.id, at),
      milestoneId,
      title: str(t.title, `${at} title`, { required: true, max: 120 }) ?? "",
      known: texts(t.known, `decision point ${i + 1} known`, 300, 6),
      check: texts(t.check, `decision point ${i + 1} to check`, 300, 6),
      areas,
      sayings,
      reviewed: str(t.reviewed, `${at}: the reviewed response`, { required: true, max: 1500 }) ?? "",
    };
  });
  const s = obj(o.source);
  const a = obj(o.approval);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    operations: str(a.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    clinical: str(a.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(a.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    communications: str(a.communications, `${where} Communications reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const source = {
    title: str(s.title, `${where} source`, { max: 200 }) ?? "",
    version: str(s.version, `${where} source version`, { max: 80 }) ?? "",
    verifiedOn: date(s.verifiedOn),
  };
  if (!journeyApproved({ approval, source }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Care Operations, Clinical, Quality, Privacy and Communications reviewers, the date, and the source and its version.`,
    );
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    timeNote: str(o.timeNote, `${where} time note`, { max: 120 }) || TIME_NOTE,
    personas,
    consent: str(o.consent, `${where}: what the family member may be told`, { required: true, max: 400 }) ?? "",
    milestones,
    tensions,
    source,
    approval,
  };
}

export const journeyApproved = (b: { approval: JourneyBlockData["approval"]; source: { title: string; version: string } }) =>
  Boolean(
    b.approval.owner &&
    b.approval.operations &&
    b.approval.clinical &&
    b.approval.quality &&
    b.approval.privacy &&
    b.approval.communications &&
    b.approval.approvedOn &&
    b.source.title &&
    b.source.version,
  );

/** The reader's copy: the story, without what marks a decision right, its consequences or the reviewed responses. */
export function journeyForReaders<T extends JourneyBlockData>(b: T): T {
  return {
    ...b,
    tensions: b.tensions.map((t) => ({
      ...t,
      areas: t.areas.map((a) => ({
        ...a,
        gap: "",
        options: a.options.map((x) => ({ ...x, role: "helpful" as const, dim: "status" as const, feedback: "", consequence: "" })),
      })),
      sayings: t.sayings.map((s) => ({ ...s, good: false, feedback: "" })),
      reviewed: "",
    })),
  };
}

export function freshJourney(data: JourneyBlockData, tag = Math.random().toString(36).slice(2, 7)): JourneyBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  return {
    ...c,
    milestones: c.milestones.map((m) => ({ ...m, id: re(m.id) })),
    tensions: c.tensions.map((t) => ({
      ...t,
      id: re(t.id),
      milestoneId: re(t.milestoneId),
      areas: t.areas.map((a) => ({ ...a, id: re(a.id), options: a.options.map((x) => ({ ...x, id: re(x.id) })) })),
      sayings: t.sayings.map((s) => ({ ...s, id: re(s.id) })),
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Attempt = { options: string[]; saying: string };
export type JourneyState = {
  at: number;
  /** Milestones visited, and which lenses were opened at each. */
  lenses: Record<string, PersonaId[]>;
  /** Every try at each decision point, in order. The first is never erased. */
  tries: Record<string, Attempt[]>;
  /** Decision points whose last try stood. */
  settled: string[];
  finished: boolean;
};
export const emptyState = (): JourneyState => ({ at: 0, lenses: {}, tries: {}, settled: [], finished: false });

export function cleanState(b: JourneyBlockData, raw: unknown): JourneyState {
  const r = obj(raw);
  const mIds = new Set(b.milestones.map((m) => m.id));
  const lenses: Record<string, PersonaId[]> = {};
  for (const [k, v] of Object.entries(obj(r.lenses)))
    if (mIds.has(k) && Array.isArray(v)) lenses[k] = [...new Set(v.filter((x): x is PersonaId => (PERSONA_IDS as readonly string[]).includes(x as string)))];
  const tries: Record<string, Attempt[]> = {};
  for (const t of b.tensions) {
    const list = obj(r.tries)[t.id];
    if (!Array.isArray(list)) continue;
    const valid = new Set(t.areas.flatMap((a) => a.options.map((x) => x.id)));
    tries[t.id] = list.slice(0, 20).map((x) => {
      const o = obj(x);
      return {
        options: [...new Set((Array.isArray(o.options) ? o.options : []).filter((y): y is string => typeof y === "string" && valid.has(y)))],
        saying: typeof o.saying === "string" && t.sayings.some((s) => s.id === o.saying) ? o.saying : "",
      };
    });
  }
  const tIds = new Set(b.tensions.map((t) => t.id));
  return {
    at: Number.isInteger(r.at) ? Math.min(b.milestones.length - 1, Math.max(0, r.at as number)) : 0,
    lenses,
    tries,
    settled: (Array.isArray(r.settled) ? r.settled : []).filter((x): x is string => typeof x === "string" && tIds.has(x)),
    finished: r.finished === true,
  };
}

export type TensionFeedback = {
  tensionId: string;
  /** Paths to debrief that were chosen: the try doesn't stand, and the learner looks again. */
  critical: { text: string; feedback: string }[];
  chosen: { id: string; text: string; owner: string; role: OptionRole; feedback: string; consequence: string; area: string }[];
  /** Areas with nothing needed chosen, with what's missing. */
  gaps: { area: string; gap: string }[];
  saying: { text: string; good: boolean; feedback: string } | null;
  /** The effect on each part of the story, in words. */
  effects: { dim: Dim; label: string; text: string }[];
  reviewed: string;
  stands: boolean;
};

/** Reads one try at a decision point against the reviewed key. Paths to debrief mean it doesn't stand. */
export function readTry(t: Tension, a: Attempt): TensionFeedback {
  const all = t.areas.flatMap((ar) => ar.options.map((x) => ({ ...x, area: ar.label })));
  const chosen = all.filter((x) => a.options.includes(x.id));
  const critical = chosen.filter((x) => x.role === "unsafe").map((x) => ({ text: x.text, feedback: x.feedback }));
  const gaps = t.areas
    .filter((ar) => !ar.options.some((x) => x.role === "essential" && a.options.includes(x.id)))
    .map((ar) => ({ area: ar.label, gap: ar.gap }));
  const s = t.sayings.find((x) => x.id === a.saying);
  const effects = (Object.keys(DIMENSIONS) as Dim[])
    .map((d) => {
      const mine = chosen.filter((x) => x.dim === d);
      const needed = all.filter((x) => x.dim === d && x.role === "essential");
      if (!mine.length && !needed.length) return null;
      const bad = mine.some((x) => x.role === "unsafe");
      const missing = needed.filter((x) => !a.options.includes(x.id)).length;
      return {
        dim: d,
        label: DIMENSIONS[d] as string,
        text: bad ? "Put at risk by a choice that needs a debrief." : missing ? "Partly covered: something needed here wasn’t chosen." : "Covered.",
      };
    })
    .filter((x): x is { dim: Dim; label: string; text: string } => Boolean(x));
  // A response that promises what nobody can (a date, a confirmed start) is a path to debrief too.
  if (s && !s.good) critical.push({ text: s.text, feedback: s.feedback });
  const stands = critical.length === 0 && Boolean(s);
  return {
    tensionId: t.id,
    critical,
    chosen: chosen.map(({ id, text, owner, role, feedback, consequence, area }) => ({ id, text, owner, role, feedback, consequence, area })),
    gaps,
    saying: s ? { text: s.text, good: s.good, feedback: s.feedback } : null,
    effects,
    reviewed: stands ? t.reviewed : "",
    stands,
  };
}

/** Submits a try at a decision point. Every try is kept; the decision settles once a try has no path to debrief. */
export function tryTension(
  b: JourneyBlockData,
  s: JourneyState,
  tensionId: unknown,
  a: Attempt,
): { state: JourneyState; feedback: TensionFeedback } | { problem: string } {
  const t = b.tensions.find((x) => x.id === tensionId);
  if (!t) return { problem: "That decision isn’t in this journey." };
  const m = b.milestones.findIndex((x) => x.id === t.milestoneId);
  if (m > s.at) return { problem: "You haven’t reached that point in the journey yet." };
  if (!a.options.length) return { problem: "Choose at least one action." };
  if (!a.saying) return { problem: "Choose what you’d say." };
  const feedback = readTry(t, a);
  const tries = { ...s.tries, [t.id]: [...(s.tries[t.id] ?? []), a].slice(-20) };
  const settled = feedback.stands && !s.settled.includes(t.id) ? [...s.settled, t.id] : s.settled;
  return { state: { ...s, tries, settled }, feedback };
}

/** What's still to do before finishing: every lens at each core milestone, and every decision point settled. */
export function finishProblems(b: JourneyBlockData, s: JourneyState): string[] {
  const out: string[] = [];
  for (const m of b.milestones.filter((x) => x.core)) {
    const seen = s.lenses[m.id] ?? [];
    const missing = PERSONA_IDS.filter((p) => !seen.includes(p));
    if (missing.length) out.push(`${m.label}: open ${missing.map((p) => b.personas[p].name || PERSONA_ROLES[p]).join(", ")}’s view.`);
  }
  for (const t of b.tensions) if (!s.settled.includes(t.id)) out.push(`Decide at “${t.title}”.`);
  return out;
}

export const RATING = ["Worth another look", "Partly there", "Strong"] as const;
export type JourneyResult = {
  dims: Record<Dim, { rating: (typeof RATING)[number]; notes: string[] }>;
  flags: { criticalFirstTry: number; retries: number; lensesOpened: number };
};

/** Reads the settled decisions, dimension by dimension; a first try that needed a debrief is noted, not hidden. */
export function scoreJourney(b: JourneyBlockData, s: JourneyState): JourneyResult {
  const dims = Object.fromEntries((Object.keys(DIMENSIONS) as Dim[]).map((d) => [d, { score: 1, need: 0, got: 0, notes: [] as string[] }])) as Record<
    Dim,
    { score: number; need: number; got: number; notes: string[] }
  >;
  let criticalFirstTry = 0;
  let retries = 0;
  for (const t of b.tensions) {
    const tries = s.tries[t.id] ?? [];
    if (!tries.length) continue;
    retries += tries.length - 1;
    const last = tries[tries.length - 1];
    const first = tries[0];
    const all = t.areas.flatMap((a) => a.options);
    for (const x of all.filter((o) => o.role === "essential")) {
      dims[x.dim].need += 1;
      if (last.options.includes(x.id)) dims[x.dim].got += 1;
      else dims[x.dim].notes.push(`${t.title}: not chosen: ${x.text}.`);
    }
    const firstBad = all.filter((o) => o.role === "unsafe" && first.options.includes(o.id));
    if (firstBad.length) criticalFirstTry += 1;
    for (const x of firstBad) {
      dims[x.dim].score -= 0.3;
      dims[x.dim].notes.push(`${t.title}: the first try had “${x.text}”, then changed.`);
    }
    const say = t.sayings.find((x) => x.id === first.saying);
    if (say && !say.good) {
      dims.family.score -= 0.2;
      dims.family.notes.push(`${t.title}: what you first chose to say needed changing.`);
    }
  }
  const out = {} as JourneyResult["dims"];
  for (const d of Object.keys(DIMENSIONS) as Dim[]) {
    const x = dims[d];
    const v = (x.need ? x.got / x.need : 1) + (x.score - 1);
    out[d] = { rating: RATING[v >= 0.8 ? 2 : v >= 0.45 ? 1 : 0], notes: x.notes };
  }
  return { dims: out, flags: { criticalFirstTry, retries, lensesOpened: Object.values(s.lenses).reduce((n, l) => n + l.length, 0) } };
}

/** The final map: what each person knew and needed at each milestone, and how each decision read. */
export function buildDebrief(b: JourneyBlockData, s: JourneyState, r: JourneyResult) {
  return {
    dims: (Object.keys(DIMENSIONS) as Dim[]).map((d) => ({ id: d, label: DIMENSIONS[d], ...r.dims[d] })),
    map: b.milestones.map((m) => ({
      id: m.id,
      label: m.label,
      time: m.time,
      people: PERSONA_IDS.map((p) => ({ id: p, name: b.personas[p].name, knows: m.cards[p].knows, waiting: m.cards[p].waiting })),
    })),
    decisions: b.tensions.map((t) => {
      const tries = s.tries[t.id] ?? [];
      return {
        id: t.id,
        title: t.title,
        tries: tries.length,
        first: tries[0] ? readTry(t, tries[0]) : null,
        last: tries.length ? readTry(t, tries[tries.length - 1]) : null,
      };
    }),
    flags: r.flags,
    source: b.source,
  };
}
export type JourneyDebrief = ReturnType<typeof buildDebrief>;
