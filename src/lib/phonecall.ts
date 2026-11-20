import type { Roleplay } from "./roleplay";

/*
  Tough Phone Call (docs/tough-phone-call.md): a telephone preset of the conversational roleplay engine
  (lib/roleplay). The learner takes a difficult call from a fictional client or family member. On top of the
  shared scene (states, good and unsafe moves, safety rules) a phone case adds:

  - who the caller says they are, and what they may actually be told (found by checking, not assumed);
  - information actions: simulated lookups that reveal authored case facts, never anything a model makes up;
  - a deterministic privacy gate: restricted details said to a caller who isn't cleared for them;
  - an authored urgent cue that, once heard, has to be acted on before anything routine;
  - a policy pack with dated sources, and Finance, Care Operations, Quality and Privacy sign-off;
  - a debrief rated 0 to 3 on six dimensions, with "Insufficient evidence" when a call didn't test something.

  The caller calming down is never the goal, and nothing here touches a real invoice, roster or complaint.
*/

export const PHONE_DIMENSIONS = {
  deescalation: "De-escalation and listening",
  empathy: "Empathy and dignity",
  facts: "Fact-finding and policy accuracy",
  safety: "Safety and urgency",
  privacy: "Privacy and agency",
  ownership: "Ownership and follow-up",
} as const;
export type PhoneDim = keyof typeof PHONE_DIMENSIONS;
export const PHONE_DIM_ORDER = Object.keys(PHONE_DIMENSIONS) as PhoneDim[];
export const SCORE_LABELS = ["Not demonstrated", "Emerging", "Effective", "Strong"] as const;
export const INSUFFICIENT = "Insufficient evidence";

export const PERMISSIONS = {
  authorised: "Authorised to discuss the client’s services and account",
  limited: "General updates only: not account or financial details",
  none: "Not authorised: take the concern, share nothing about the client",
} as const;
export type Permission = keyof typeof PERMISSIONS;

export const ACTION_KINDS = {
  permission: "Check caller and permissions",
  record: "Case record",
  wellbeing: "Ask about immediate effects",
  escalate: "Urgent escalation",
  complaint: "Record a complaint",
} as const;
export type ActionKind = keyof typeof ACTION_KINDS;

export const PHONE_KINDS = { billing: "Billing or invoice", service: "Missed or changed service", other: "Something else" } as const;
export type PhoneKind = keyof typeof PHONE_KINDS;

/** A simulated lookup: an authored set of facts, revealed only when the learner chooses it. */
export type InfoAction = { id: string; kind: ActionKind; label: string; facts: string[] };
export type PhoneSource = { id: string; title: string; excerpt: string; url: string; version: string; effectiveFrom: string; reviewBy: string };

export type PhoneCase = {
  kind: PhoneKind;
  /** The older person the call is about. */
  client: string;
  /** Who the caller says they are, as the learner hears it. */
  claims: string;
  /** What they may actually be told. Hidden until the learner checks. */
  permission: { state: Permission; detail: string };
  /** The rough length, for the learner: "4–7 minutes". */
  minutes: string;
  actions: InfoAction[];
  /** Words that would share a restricted detail. Said before checking, or to a caller who isn't authorised, they're a privacy breach. */
  restricted: string[];
  /** Which dimension each authored good or unsafe move counts towards. */
  dims: Record<string, PhoneDim>;
  /** The policy source behind a move or caution. */
  cite: Record<string, string>;
  /** A better way to say it, for an unsafe move. */
  alternatives: Record<string, string>;
  /** Something the caller says that changes everything: after this turn, the escalation action appears and must be used. */
  urgent: { cue: string; afterTurn: number; actionId: string; moveIds: string[] } | null;
  sources: PhoneSource[];
  approval: { owner: string; finance: string; operations: string; quality: string; privacy: string; approvedOn: string };
};

export const PHONE_NOTICE = "Practice call with a fictional AI character. Nothing here changes a real invoice, roster, complaint or client record.";
export const SIMULATED = "In this simulated call";
export const URGENT_TEXT =
  "Something the caller said means the client may be without help they need now. Check on them and use the escalation action before anything routine.";

// ---------------------------------------------------------------------------------------------
// Reading a phone case from stored JSON
// ---------------------------------------------------------------------------------------------

type Raw = Record<string, unknown>;
export type PhoneParseHelpers = {
  str: (v: unknown, where: string, opts?: { required?: boolean; max?: number }) => string | undefined;
  idOf: (v: unknown, where: string) => string;
  list: (v: unknown, where: string, what: string, max: number) => Raw[];
  unfinished: (problem: string) => void;
};
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const map = <T extends string>(v: unknown, ok: (x: unknown) => x is T, keys: Set<string>) =>
  Object.fromEntries(Object.entries(obj(v)).filter(([k, x]) => keys.has(k) && ok(x))) as Record<string, T>;

export const phoneApproved = (p: Pick<PhoneCase, "kind" | "approval">) =>
  Boolean(
    p.approval.owner &&
    p.approval.operations &&
    p.approval.quality &&
    p.approval.privacy &&
    p.approval.approvedOn &&
    (p.kind !== "billing" || p.approval.finance),
  );

/** Sources whose review date has passed. */
export const staleSources = (p: Pick<PhoneCase, "sources">, today: string) => p.sources.filter((s) => s.reviewBy && today && s.reviewBy < today);

/** What "Publish anyway" can't waive: the sign-off, and every source in date. */
export function phoneHardProblems(title: string, p: PhoneCase, today: string): string[] {
  const out: string[] = [];
  if (!phoneApproved(p))
    out.push(
      `“${title}”: record the content owner, the ${p.kind === "billing" ? "Finance, " : ""}Care Operations, Quality and Privacy reviewers, and the date.`,
    );
  for (const s of staleSources(p, today)) out.push(`“${title}”: the source “${s.title}” was due for review on ${s.reviewBy}. Confirm it’s current.`);
  return out;
}

/** The phone case, checked against the scene it belongs to. */
export function parsePhoneCase(o: Raw, where: string, scene: Roleplay | undefined, h: PhoneParseHelpers): PhoneCase {
  const { str, idOf, list, unfinished } = h;
  const at = `${where} phone case`;
  const actions = list(o.actions, at, "information actions", 8).map((a, i) => ({
    id: idOf(a.id, `${at} action ${i + 1}`),
    kind: oneOf(a.kind, Object.keys(ACTION_KINDS) as ActionKind[], "record"),
    label: str(a.label, `${at} action ${i + 1} label`, { required: true, max: 80 }) ?? "",
    facts: (Array.isArray(a.facts) ? a.facts : [])
      .slice(0, 6)
      .map((x, j) => str(x, `${at} action ${i + 1} fact ${j + 1}`, { max: 400 }) ?? "")
      .filter(Boolean),
  }));
  if (!actions.some((a) => a.kind === "permission")) unfinished(`${at} needs a “Check caller and permissions” action.`);
  for (const a of actions) if (!a.facts.length) unfinished(`${at}: “${a.label}” needs the facts it reveals.`);
  const ids = new Set([...(scene?.moves ?? []).map((m) => m.id), ...(scene?.risks ?? []).map((r) => r.id)]);
  const dims = map(o.dims, (x): x is PhoneDim => PHONE_DIM_ORDER.includes(x as PhoneDim), ids);
  for (const id of ids) if (!dims[id]) unfinished(`${at}: say which dimension “${id}” counts towards.`);
  const sources = list(o.sources, at, "sources", 8).map((s, i) => {
    const src = {
      id: idOf(s.id, `${at} source ${i + 1}`),
      title: str(s.title, `${at} source ${i + 1} title`, { required: true, max: 200 }) ?? "",
      excerpt: str(s.excerpt, `${at} source ${i + 1} excerpt`, { required: true, max: 800 }) ?? "",
      url: typeof s.url === "string" && /^https:\/\//.test(s.url) ? s.url.slice(0, 400) : "",
      version: str(s.version, `${at} source ${i + 1} version`, { max: 80 }) ?? "",
      effectiveFrom: date(s.effectiveFrom),
      reviewBy: date(s.reviewBy),
    };
    if (!src.effectiveFrom || !src.reviewBy) unfinished(`${at} source ${i + 1} needs its effective and review dates.`);
    return src;
  });
  if (!sources.length) unfinished(`${at} needs its policy pack: at least one dated source.`);
  const sourceIds = new Set(sources.map((s) => s.id));
  const u = o.urgent && typeof o.urgent === "object" ? obj(o.urgent) : null;
  const urgent =
    u && typeof u.cue === "string" && u.cue.trim()
      ? {
          cue: str(u.cue, `${at} urgent cue`, { required: true, max: 400 }) ?? "",
          afterTurn: Math.min(6, Math.max(0, Math.round(Number(u.afterTurn) || 0))),
          actionId: typeof u.actionId === "string" && actions.some((a) => a.id === u.actionId && a.kind === "escalate") ? u.actionId : "",
          moveIds: (Array.isArray(u.moveIds) ? u.moveIds : []).filter((x): x is string => typeof x === "string" && ids.has(x)).slice(0, 4),
        }
      : null;
  if (urgent && !urgent.actionId) unfinished(`${at}: the urgent cue needs an “Urgent escalation” action to point to.`);
  const ap = obj(o.approval);
  const pm = obj(o.permission);
  return {
    kind: oneOf(o.kind, Object.keys(PHONE_KINDS) as PhoneKind[], "other"),
    client: str(o.client, `${at}: the client`, { required: true, max: 80 }) ?? "",
    claims: str(o.claims, `${at}: who the caller says they are`, { required: true, max: 200 }) ?? "",
    permission: {
      state: oneOf(pm.state, Object.keys(PERMISSIONS) as Permission[], "none"),
      detail: str(pm.detail, `${at}: what the permission check shows`, { required: true, max: 400 }) ?? "",
    },
    minutes: str(o.minutes, `${at} length`, { max: 20 }) || "4–7",
    actions,
    restricted: (Array.isArray(o.restricted) ? o.restricted : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim().slice(0, 60))
      .filter((x) => x.length >= 2)
      .slice(0, 20),
    dims,
    cite: map(o.cite, (x): x is string => typeof x === "string" && sourceIds.has(x), ids),
    alternatives: Object.fromEntries(
      Object.entries(obj(o.alternatives))
        .filter(([k, x]) => ids.has(k) && typeof x === "string" && x.trim())
        .map(([k, x]) => [k, (x as string).slice(0, 400)]),
    ),
    urgent,
    sources,
    approval: {
      owner: str(ap.owner, `${at} content owner`, { max: 120 }) ?? "",
      finance: str(ap.finance, `${at} Finance reviewer`, { max: 120 }) ?? "",
      operations: str(ap.operations, `${at} Care Operations reviewer`, { max: 120 }) ?? "",
      quality: str(ap.quality, `${at} Quality reviewer`, { max: 120 }) ?? "",
      privacy: str(ap.privacy, `${at} Privacy reviewer`, { max: 120 }) ?? "",
      approvedOn: date(ap.approvedOn),
    },
  };
}

/**
  The phone case as a learner's browser gets it: the action labels and the policy pack, but not what a lookup
  reveals, what the caller may be told, the restricted words, the urgent cue, or how moves are rated.
*/
export function phoneForReaders(p: PhoneCase): PhoneCase {
  return {
    ...p,
    permission: { state: "none", detail: "" },
    actions: p.actions.map((a) => ({ ...a, facts: [] })),
    restricted: [],
    dims: {},
    cite: {},
    alternatives: {},
    urgent: p.urgent ? { cue: "", afterTurn: p.urgent.afterTurn, actionId: p.urgent.actionId, moveIds: [] } : null,
  };
}

// ---------------------------------------------------------------------------------------------
// The deterministic gates
// ---------------------------------------------------------------------------------------------

const plain = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;

/** A restricted word or phrase in what the learner said, if any: whole words, whatever the case or punctuation. */
export function restrictedSaid(text: string, phrases: string[]): string | null {
  const t = plain(text);
  for (const p of phrases) {
    const q = plain(p).trim();
    if (q.length >= 2 && t.includes(` ${q} `)) return p;
  }
  return null;
}

/** A restricted detail may be shared only once the learner has checked, and only with a caller authorised for it. */
export const mayShare = (p: Pick<PhoneCase, "permission">, checked: boolean) => checked && p.permission.state === "authorised";

export const DISCLOSURE_ID = "phone-disclosure";
export const DISCLOSURE = {
  text: "Shared a restricted detail before it was clear the caller could be told",
  caution:
    "The caller’s concern can always be heard and recorded, but the client’s details are shared only once you’ve checked what they’ve agreed, and only as far as that allows. Being family isn’t a blanket right to their information.",
  alternative:
    "“I can’t go into the details of his account with you yet, but I’ll look into it today and I can call your dad directly. What’s worrying you most?”",
};
export const URGENT_MISSED = {
  text: "Didn’t act on the sign that the client may be without help they need now",
  caution:
    "Once a caller says someone may be alone without essential support, checking on them and escalating comes before anything else, including explaining what went wrong or the complaints process.",
};

/** Whether the urgent cue has been heard by the time this many turns have been taken. */
export const urgentHeard = (p: Pick<PhoneCase, "urgent">, turns: number) => Boolean(p.urgent && turns >= p.urgent.afterTurn);

/** The actions a learner can see: the escalation action only once the urgent cue has been heard. */
export const visibleActions = (p: Pick<PhoneCase, "actions" | "urgent">, turns: number) =>
  p.actions.filter((a) => a.kind !== "escalate" || urgentHeard(p, turns));

// ---------------------------------------------------------------------------------------------
// The debrief: six dimensions, endings and a recommendation, from what was authored and what was said
// ---------------------------------------------------------------------------------------------

export type PhoneTurn = {
  n: number;
  text: string;
  moves: { id: string; quote: string }[];
  risks: { id: string; quote: string }[];
  unclear: boolean;
  stateAfter: number;
};
export type Lookup = { actionId: string; afterTurn: number };

export const ENDINGS = {
  clarified: "Clarified, and a next step agreed",
  escalated: "Escalated, with the client’s needs protected",
  complaint: "The caller is still concerned, and their complaint is recorded",
  unsafe: "Unsafe or unresolved",
} as const;
export type Ending = keyof typeof ENDINGS;

export type Evidence = { turn: number; quote: string; what: string; good: boolean; source: PhoneSource | null; alternative: string };
export type DimResult = {
  id: PhoneDim;
  label: string;
  score: number | null;
  rating: string;
  evidence: Evidence[];
  suggestion: string;
  critical: string | null;
};
export type PhoneResult = {
  dims: DimResult[];
  critical: { text: string; caution: string; turn: number | null; quote: string }[];
  ending: Ending;
  recommendation: "Practised" | "Needs another attempt";
  /** Every highlighted phrase, turn by turn, for the call timeline. */
  highlights: (Evidence & { dim: PhoneDim })[];
  lookups: { label: string; afterTurn: number }[];
};

export function phoneResult(scene: Roleplay, p: PhoneCase, turns: PhoneTurn[], lookups: Lookup[], ended: boolean): PhoneResult {
  const src = (id: string) => p.sources.find((s) => s.id === p.cite[id]) ?? null;
  const moveText = new Map(scene.moves.map((m) => [m.id, m]));
  const riskText = new Map(scene.risks.map((r) => [r.id, r]));
  const used = new Set(lookups.map((l) => l.actionId));
  const clear = turns.filter((t) => !t.unclear);

  // The deterministic failures first: a disclosure, and an urgent cue not acted on.
  const critical: PhoneResult["critical"] = [];
  for (const t of turns)
    for (const r of t.risks) if (r.id === DISCLOSURE_ID) critical.push({ text: DISCLOSURE.text, caution: DISCLOSURE.caution, turn: t.n, quote: r.quote });
  const shownMoves = new Set(turns.flatMap((t) => t.moves.map((m) => m.id)));
  const urgentMissed = Boolean(p.urgent && urgentHeard(p, turns.length) && !used.has(p.urgent.actionId) && !p.urgent.moveIds.some((m) => shownMoves.has(m)));
  if (urgentMissed) critical.push({ text: URGENT_MISSED.text, caution: URGENT_MISSED.caution, turn: null, quote: "" });

  const highlights: PhoneResult["highlights"] = [];
  for (const t of turns) {
    for (const m of t.moves) {
      const move = moveText.get(m.id);
      const dim = p.dims[m.id];
      if (move && dim) highlights.push({ turn: t.n, quote: m.quote, what: move.text, good: true, source: src(m.id), alternative: "", dim });
    }
    for (const r of t.risks) {
      if (r.id === DISCLOSURE_ID) {
        highlights.push({ turn: t.n, quote: r.quote, what: DISCLOSURE.text, good: false, source: null, alternative: DISCLOSURE.alternative, dim: "privacy" });
        continue;
      }
      const risk = riskText.get(r.id);
      const dim = p.dims[r.id];
      if (risk && dim)
        highlights.push({ turn: t.n, quote: r.quote, what: risk.text, good: false, source: src(r.id), alternative: p.alternatives[r.id] ?? "", dim });
    }
  }

  const dims = PHONE_DIM_ORDER.map((d): DimResult => {
    const movesHere = scene.moves.filter((m) => p.dims[m.id] === d);
    const shown = movesHere.filter((m) => shownMoves.has(m.id));
    const evidence = highlights.filter((h) => h.dim === d).map(({ dim: _d, ...e }) => e); // eslint-disable-line @typescript-eslint/no-unused-vars
    const risked = evidence.some((e) => !e.good);
    const crit =
      d === "privacy" && critical.some((c) => c.text === DISCLOSURE.text) ? DISCLOSURE.text : d === "safety" && urgentMissed ? URGENT_MISSED.text : null;
    // Whether this call tested it at all: an untested behaviour is "insufficient evidence", never a zero.
    const opportunity = d === "safety" ? Boolean(p.urgent) : d === "privacy" ? p.permission.state !== "authorised" : true;
    const tested = movesHere.length > 0 && clear.length >= 2 && (shown.length > 0 || risked || Boolean(crit) || opportunity);
    const next = movesHere.find((m) => !shownMoves.has(m.id));
    if (!tested) return { id: d, label: PHONE_DIMENSIONS[d], score: null, rating: INSUFFICIENT, evidence, suggestion: "", critical: null };
    let score = shown.length === 0 ? 0 : shown.length >= movesHere.length ? 3 : shown.length / movesHere.length >= 0.5 ? 2 : 1;
    if (risked) score = Math.min(score, 1);
    if (crit) score = 0;
    return {
      id: d,
      label: PHONE_DIMENSIONS[d],
      score,
      rating: crit ? "Critical issue" : SCORE_LABELS[score],
      evidence,
      suggestion: next ? `${next.text}.${next.example ? ` One way to say it: “${next.example}”` : ""}` : "",
      critical: crit,
    };
  });

  const ownership = scene.moves.some((m) => p.dims[m.id] === "ownership" && shownMoves.has(m.id));
  const anyRisk = highlights.some((h) => !h.good);
  const complaint = [...used].some((id) => p.actions.find((a) => a.id === id)?.kind === "complaint");
  const stillConcerned = (turns.at(-1)?.stateAfter ?? scene.start) > 0;
  const ending: Ending =
    critical.length || !ended
      ? "unsafe"
      : p.urgent && urgentHeard(p, turns.length) && used.has(p.urgent.actionId)
        ? "escalated"
        : complaint && stillConcerned
          ? "complaint"
          : ownership
            ? "clarified"
            : complaint
              ? "complaint"
              : "unsafe";
  const recommendation =
    ended && !critical.length && !anyRisk && ending !== "unsafe" && dims.every((x) => x.score === null || x.score >= 2) ? "Practised" : "Needs another attempt";
  return {
    dims,
    critical,
    ending,
    recommendation,
    highlights,
    lookups: lookups.map((l) => ({ label: p.actions.find((a) => a.id === l.actionId)?.label ?? l.actionId, afterTurn: l.afterTurn })),
  };
}

/** A Tough Phone Call block's own fields: a scene title, the caller, the shared roleplay scene and the phone case. */
export type PhoneCallData = { title: string; person: string; role: string; setting: string; roleplay: Roleplay; phone: PhoneCase };

/** What a phone call's case tools show now: the actions on offer, what each lookup revealed, and the permission once it's been checked. */
export function phoneToolsView(p: PhoneCase, turns: number, lookups: Lookup[]) {
  const used = new Set(lookups.map((l) => l.actionId));
  const check = p.actions.find((a) => a.kind === "permission" && used.has(a.id));
  return {
    urgent: urgentHeard(p, turns),
    actions: visibleActions(p, turns).map((a) => ({ id: a.id, kind: a.kind, label: a.label, done: used.has(a.id), facts: used.has(a.id) ? a.facts : [] })),
    permission: check ? { state: p.permission.state, label: PERMISSIONS[p.permission.state], detail: p.permission.detail } : null,
  };
}
export type PhoneToolsView = ReturnType<typeof phoneToolsView>;

/**
  A copy with ids of its own, so two phone calls in one course never share an id (every id in a course must be
  unique). The case's references to moves, risks, tools and sources follow.
*/
export function freshPhoneCall(data: PhoneCallData, tag = Math.random().toString(36).slice(2, 7)): PhoneCallData {
  const re = (id: string) => (id ? `${id.replace(/-p[a-z0-9]{5}$/, "")}-p${tag}` : "");
  const keys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [re(k), v]));
  const c = structuredClone(data);
  return {
    ...c,
    roleplay: {
      ...c.roleplay,
      moves: c.roleplay.moves.map((m) => ({ ...m, id: re(m.id) })),
      risks: c.roleplay.risks.map((r) => ({ ...r, id: re(r.id) })),
      safety: c.roleplay.safety.map((s) => ({ ...s, id: re(s.id) })),
    },
    phone: {
      ...c.phone,
      actions: c.phone.actions.map((a) => ({ ...a, id: re(a.id) })),
      sources: c.phone.sources.map((s) => ({ ...s, id: re(s.id) })),
      dims: keys(c.phone.dims),
      cite: Object.fromEntries(Object.entries(c.phone.cite).map(([k, v]) => [re(k), re(v)])),
      alternatives: keys(c.phone.alternatives),
      urgent: c.phone.urgent ? { ...c.phone.urgent, actionId: re(c.phone.urgent.actionId), moveIds: c.phone.urgent.moveIds.map(re) } : null,
    },
  };
}
