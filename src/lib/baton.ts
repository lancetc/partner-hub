/*
  "Pass the Baton" role-handoff relay (docs/pass-the-baton.md). A fictional participant's journey across a
  timeline. At each role's handoff point, the learner sorts what to send, verify or keep, chooses who receives
  it, how urgently, through which channel, who owns the next step and how receipt is confirmed. A short preview
  shows what the next role can do with it; an unacknowledged handoff stays open until followed up.

  - It's a simulation with fictional data. Nothing sends a message, assigns work or changes a record.
  - Marking is deterministic: authored rules, never speed, length or how many teams were tagged.
  - Results are On track, Needs follow-up or Critical gap. A critical gap needs a replay of that stage.
  - The preview never claims a clinical outcome: it shows the next role's ability to act.
  - Every role plays from a clean, authored state. Nobody is marked down for an earlier role's scripted handoff.
  Everything here is pure, so the server, the learner's page and the editor's preview run the same rules.
*/

export const ROLE_IDS = ["coordinator", "clinical", "partner", "finance"] as const;
export type RoleId = (typeof ROLE_IDS)[number];
export const PARTICIPANT = "participant";

export const STATUSES = { confirmed: "Confirmed", reported: "Reported", pending: "Pending", unknown: "Unknown" } as const;
export type FactStatus = keyof typeof STATUSES;
export const PRIVACY = { general: "General", "care-team": "Care team", clinical: "Clinical", financial: "Financial" } as const;
export type Privacy = keyof typeof PRIVACY;
export const PLACEMENTS = { send: "Send", verify: "Verify first", keep: "Keep in record" } as const;
export type Placement = keyof typeof PLACEMENTS;

export const VERDICTS = { good: "On track", ok: "On track (another safe way)", poor: "Needs follow-up", critical: "Critical gap" } as const;
export type Verdict = keyof typeof VERDICTS;
export const RESULTS = { ontrack: "On track", followup: "Needs follow-up", critical: "Critical gap" } as const;
export type Result = keyof typeof RESULTS;

export const DIMS = {
  fidelity: "Critical fact fidelity",
  scope: "Recipient and scope",
  timeliness: "Timeliness and escalation",
  ownership: "Ownership and closure",
  participant: "Participant-centred planning",
  budget: "Budget communication",
} as const;
export type Dim = keyof typeof DIMS;

/** A choice in the builder. `line` is what the next role sees because of it; `missing` is the gap when a needed action isn't chosen. */
export type Option = { id: string; text: string; verdict: Verdict; dim: Dim; feedback: string; line: string; missing: string };
export type SourceItem = { id: string; title: string; kind: string; time: string; status: FactStatus; body: string; visibleTo: RoleId[] };
export type Fact = { id: string; text: string; sourceId: string; status: FactStatus; privacy: Privacy; visibleTo: RoleId[] };
export type FactRule = { factId: string; accept: Placement[]; critical: boolean; dim: Dim; feedback: string; line: string };

export type Stage = {
  id: string;
  label: string;
  time: string;
  kind: "event" | "handoff";
  /** What happens (an event), or the situation the role is in (a handoff). */
  narrative: string;
  role: RoleId | "";
  /** What arrived from the previous role, in the authored story. The same for everyone who plays this role. */
  incoming: string;
  decision: string;
  unknowns: string[];
  factIds: string[];
  factRules: FactRule[];
  recipients: Option[];
  urgency: Option[];
  channels: Option[];
  owners: Option[];
  acks: Option[];
  /** Other things the learner might do or say; several can be chosen. */
  actions: Option[];
  /** In the story, does the recipient acknowledge when asked? If not, the handoff stays open. */
  responds: boolean;
  followUps: Option[];
  /** An urgent concern that interrupts the stage before the handoff. */
  redFlag: { text: string; options: Option[] } | null;
  participant: { good: string; poor: string };
  goodPath: string;
  /** What this role handed on in the authored story, shown when someone plays a later role. */
  scripted: string;
};

export type BatonBlockData = {
  title: string;
  intro: string;
  person: { name: string; about: string };
  roles: Record<RoleId, { label: string; remit: string }>;
  /** A role the author assigns; empty lets the learner choose. */
  assignedRole: RoleId | "";
  /** How many roles to play (without a critical gap) to finish. */
  rolesToComplete: number;
  sources: SourceItem[];
  facts: Fact[];
  stages: Stage[];
  policyIds: string[];
  reviewDue: string;
  approval: { owner: string; clinical: string; operations: string; finance: string; quality: string; privacy: string; approvedOn: string };
};

export const BATON_NOTICE = "A simulation with fictional people and records. Nothing here sends a message, assigns work, books a service or changes a record.";

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
const manyOf = <T extends string>(v: unknown, all: readonly T[]): T[] => [...new Set((Array.isArray(v) ? v : []).filter((x): x is T => all.includes(x as T)))];
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const VERDICT_IDS = Object.keys(VERDICTS) as Verdict[];
const DIM_IDS = Object.keys(DIMS) as Dim[];
const STATUS_IDS = Object.keys(STATUSES) as FactStatus[];
const PLACEMENT_IDS = Object.keys(PLACEMENTS) as Placement[];

/**
  The block's fields, checked. Each handoff stage needs its role, a good recipient and owner, and rules for the
  facts it shows; every option group needs a safe choice; facts must be ones that role can see; and the
  scenario needs Clinical, Care Operations, Finance, Quality and Privacy sign-off with a review date.
*/
export function parseBaton(o: Raw, where: string, h: ParseHelpers): BatonBlockData {
  const { str, idOf, list, unfinished } = h;
  const texts = (v: unknown, what: string, max: number, n: number) =>
    (Array.isArray(v) ? v : [])
      .slice(0, n)
      .map((x, i) => str(x, `${where} ${what} ${i + 1}`, { max }) ?? "")
      .filter(Boolean);
  const rs = obj(o.roles);
  const roles = Object.fromEntries(
    ROLE_IDS.map((r) => {
      const x = obj(rs[r]);
      return [
        r,
        { label: str(x.label, `${where} role ${r}`, { required: true, max: 60 }) ?? "", remit: str(x.remit, `${where} role ${r} remit`, { max: 300 }) ?? "" },
      ];
    }),
  ) as BatonBlockData["roles"];

  const sources = list(o.sources, where, "source items", 10).map((s, i): SourceItem => ({
    id: idOf(s.id, `${where} source ${i + 1}`),
    title: str(s.title, `${where} source ${i + 1} title`, { required: true, max: 120 }) ?? "",
    kind: str(s.kind, `${where} source ${i + 1} kind`, { max: 120 }) ?? "",
    time: str(s.time, `${where} source ${i + 1} time`, { max: 40 }) ?? "",
    status: oneOf(s.status, STATUS_IDS, "confirmed"),
    body: str(s.body, `${where} source ${i + 1}`, { required: true, max: 800 }) ?? "",
    visibleTo: manyOf(s.visibleTo, ROLE_IDS),
  }));
  const facts = list(o.facts, where, "facts", 20).map((f, i): Fact => ({
    id: idOf(f.id, `${where} fact ${i + 1}`),
    text: str(f.text, `${where} fact ${i + 1}`, { required: true, max: 240 }) ?? "",
    sourceId: typeof f.sourceId === "string" ? f.sourceId.slice(0, 80) : "",
    status: oneOf(f.status, STATUS_IDS, "unknown"),
    privacy: oneOf(f.privacy, Object.keys(PRIVACY) as Privacy[], "care-team"),
    visibleTo: manyOf(f.visibleTo, ROLE_IDS),
  }));
  const factById = new Map(facts.map((f) => [f.id, f]));

  const options = (v: unknown, at: string, what: string, max: number): Option[] =>
    list(v, at, what, max).map((x, k) => ({
      id: idOf(x.id, `${at} ${what} ${k + 1}`),
      text: str(x.text, `${at} ${what} ${k + 1}`, { required: true, max: 240 }) ?? "",
      verdict: oneOf(x.verdict, VERDICT_IDS, "poor"),
      dim: oneOf(x.dim, DIM_IDS, "ownership"),
      feedback: str(x.feedback, `${at} ${what} ${k + 1} feedback`, { required: true, max: 400 }) ?? "",
      line: str(x.line, `${at} ${what} ${k + 1}: what the next role sees`, { max: 300 }) ?? "",
      missing: str(x.missing, `${at} ${what} ${k + 1}: the gap if it isn't chosen`, { max: 300 }) ?? "",
    }));
  const safe = (opts: Option[], at: string, what: string) => {
    if (opts.length && !opts.some((x) => x.verdict === "good" || x.verdict === "ok")) unfinished(`${at} needs a safe choice for ${what}.`);
  };

  const stages = list(o.stages, where, "stages", 8).map((s, i): Stage => {
    const at = `${where} stage ${i + 1}`;
    const kind = s.kind === "handoff" ? "handoff" : "event";
    const role = kind === "handoff" ? oneOf(s.role, ROLE_IDS, "coordinator") : "";
    const factIds = (Array.isArray(s.factIds) ? s.factIds : []).filter((x): x is string => typeof x === "string" && factById.has(x)).slice(0, 10);
    const factRules = list(s.factRules, at, "fact rules", 10).map((r, k) => ({
      factId: typeof r.factId === "string" && factIds.includes(r.factId) ? r.factId : "",
      accept: manyOf(r.accept, PLACEMENT_IDS),
      critical: r.critical === true,
      dim: oneOf(r.dim, DIM_IDS, "fidelity"),
      // Feedback is needed only where a placement can be wrong.
      feedback: str(r.feedback, `${at} fact rule ${k + 1} feedback`, { required: manyOf(r.accept, PLACEMENT_IDS).length < 3, max: 400 }) ?? "",
      line: str(r.line, `${at} fact rule ${k + 1}: what the next role sees`, { max: 300 }) ?? "",
    }));
    const rf = obj(s.redFlag);
    const redFlag = rf.text ? { text: str(rf.text, `${at} red flag`, { max: 400 }) ?? "", options: options(rf.options, at, "red-flag routes", 4) } : null;
    const stage: Stage = {
      id: idOf(s.id, at),
      label: str(s.label, `${at} label`, { required: true, max: 100 }) ?? "",
      time: str(s.time, `${at} time`, { max: 40 }) ?? "",
      kind,
      narrative: str(s.narrative, `${at} narrative`, { required: true, max: 600 }) ?? "",
      role,
      incoming: str(s.incoming, `${at}: what arrived`, { max: 600 }) ?? "",
      decision: str(s.decision, `${at}: the decision`, { max: 300 }) ?? "",
      unknowns: texts(s.unknowns, `stage ${i + 1} unknown`, 240, 6),
      factIds,
      factRules,
      recipients: options(s.recipients, at, "recipients", 5),
      urgency: options(s.urgency, at, "urgency choices", 4),
      channels: options(s.channels, at, "channels", 5),
      owners: options(s.owners, at, "owners", 5),
      acks: options(s.acks, at, "acknowledgement choices", 4),
      actions: options(s.actions, at, "actions", 6),
      responds: s.responds !== false,
      followUps: options(s.followUps, at, "follow-ups", 4),
      redFlag,
      participant: {
        good: str(obj(s.participant).good, `${at}: how ${"the person"} experiences a good handoff`, { max: 300 }) ?? "",
        poor: str(obj(s.participant).poor, `${at}: how a gap feels to them`, { max: 300 }) ?? "",
      },
      goodPath: str(s.goodPath, `${at}: one good way`, { max: 600 }) ?? "",
      scripted: str(s.scripted, `${at}: what this role handed on in the story`, { max: 600 }) ?? "",
    };
    if (kind === "handoff") {
      if (!factIds.length) unfinished(`${at} needs facts to sort.`);
      for (const id of factIds)
        if (!factById.get(id)!.visibleTo.includes(role as RoleId))
          unfinished(`${at}: the ${roles[role as RoleId].label} can’t see “${factById.get(id)!.text}”.`);
      for (const id of factIds) if (!factRules.some((r) => r.factId === id)) unfinished(`${at}: add a rule for “${factById.get(id)!.text}”.`);
      for (const [g, what] of [
        [stage.recipients, "the recipient"],
        [stage.urgency, "urgency"],
        [stage.channels, "the channel"],
        [stage.owners, "the owner of the next step"],
        [stage.acks, "acknowledgement"],
      ] as const) {
        if (!g.length) unfinished(`${at} needs choices for ${what}.`);
        safe(g, at, what);
      }
      safe(stage.followUps, at, "the follow-up");
      if (redFlag) safe(redFlag.options, at, "the urgent concern");
      if (!stage.goodPath) unfinished(`${at} needs one good way to do it, for the debrief.`);
    }
    return stage;
  });
  const handoffs = stages.filter((s) => s.kind === "handoff");
  if (!handoffs.length) unfinished(`${where} needs at least one handoff stage.`);
  for (const r of ROLE_IDS) if (handoffs.filter((s) => s.role === r).length > 1) unfinished(`${where}: the ${roles[r].label} has more than one handoff stage.`);

  const a = obj(o.approval);
  const approval = {
    owner: str(a.owner, `${where} content owner`, { max: 120 }) ?? "",
    clinical: str(a.clinical, `${where} Clinical reviewer`, { max: 120 }) ?? "",
    operations: str(a.operations, `${where} Care Operations reviewer`, { max: 120 }) ?? "",
    finance: str(a.finance, `${where} Finance reviewer`, { max: 120 }) ?? "",
    quality: str(a.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    privacy: str(a.privacy, `${where} Privacy reviewer`, { max: 120 }) ?? "",
    approvedOn: date(a.approvedOn),
  };
  const policyIds = texts(o.policyIds, "policy ID", 80, 6);
  const reviewDue = date(o.reviewDue);
  if (!batonApproved({ approval, policyIds, reviewDue }))
    unfinished(
      `${where}: sign-off is required. Record the content owner, the Clinical, Care Operations, Finance, Quality and Privacy reviewers, the date, the policy or SOP IDs, and the review date.`,
    );
  const playable = handoffs.map((s) => s.role as RoleId);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    person: {
      name: str(obj(o.person).name, `${where} participant’s name`, { required: true, max: 60 }) ?? "",
      about: str(obj(o.person).about, `${where} about them`, { max: 400 }) ?? "",
    },
    roles,
    assignedRole: playable.includes(o.assignedRole as RoleId) ? (o.assignedRole as RoleId) : "",
    rolesToComplete: Number.isInteger(o.rolesToComplete) ? Math.min(Math.max(1, o.rolesToComplete as number), Math.max(1, playable.length)) : 1,
    sources,
    facts,
    stages,
    policyIds,
    reviewDue,
    approval,
  };
}

export const batonApproved = (b: { approval: BatonBlockData["approval"]; policyIds: string[]; reviewDue: string }) =>
  Boolean(
    b.approval.owner &&
    b.approval.clinical &&
    b.approval.operations &&
    b.approval.finance &&
    b.approval.quality &&
    b.approval.privacy &&
    b.approval.approvedOn &&
    b.policyIds.length &&
    b.reviewDue,
  );
export const batonStale = (b: Pick<BatonBlockData, "reviewDue">, today: string) => Boolean(b.reviewDue && today && b.reviewDue < today);

const neutral = (x: Option): Option => ({ ...x, verdict: "ok", dim: "ownership", feedback: "", line: "", missing: "" });
/** The reader's copy: the story, sources, facts and choices, without the rules, what each choice leads to, or the debrief. */
export function batonForReaders<T extends BatonBlockData>(b: T): T {
  return {
    ...b,
    stages: b.stages.map((s) => ({
      ...s,
      factRules: [],
      recipients: s.recipients.map(neutral),
      urgency: s.urgency.map(neutral),
      channels: s.channels.map(neutral),
      owners: s.owners.map(neutral),
      acks: s.acks.map(neutral),
      actions: s.actions.map(neutral),
      responds: true,
      followUps: s.followUps.map(neutral),
      redFlag: s.redFlag ? { text: s.redFlag.text, options: s.redFlag.options.map(neutral) } : null,
      participant: { good: "", poor: "" },
      goodPath: "",
    })),
  };
}

export function freshBaton(data: BatonBlockData, tag = Math.random().toString(36).slice(2, 7)): BatonBlockData {
  const re = (id: string) => (id ? `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}` : "");
  const c = structuredClone(data);
  const opts = (xs: Option[]) => xs.map((x) => ({ ...x, id: re(x.id) }));
  return {
    ...c,
    sources: c.sources.map((s) => ({ ...s, id: re(s.id) })),
    facts: c.facts.map((f) => ({ ...f, id: re(f.id), sourceId: re(f.sourceId) })),
    stages: c.stages.map((s) => ({
      ...s,
      id: re(s.id),
      factIds: s.factIds.map(re),
      factRules: s.factRules.map((r) => ({ ...r, factId: re(r.factId) })),
      recipients: opts(s.recipients),
      urgency: opts(s.urgency),
      channels: opts(s.channels),
      owners: opts(s.owners),
      acks: opts(s.acks),
      actions: opts(s.actions),
      followUps: opts(s.followUps),
      redFlag: s.redFlag ? { ...s.redFlag, options: opts(s.redFlag.options) } : null,
    })),
  };
}

/** Problems an author should see while building, beyond what blocks publishing. */
export function batonWarnings(b: BatonBlockData): string[] {
  const out: string[] = [];
  for (const s of b.stages.filter((x) => x.kind === "handoff")) {
    const name = `“${s.label}”`;
    if (!s.owners.some((x) => x.verdict === "good")) out.push(`${name} has no owner marked as good.`);
    if (!s.factRules.some((r) => r.critical)) out.push(`${name} has no critical fact: is there nothing that must be passed on or held back?`);
    if (!s.responds && !s.followUps.length) out.push(`${name}: the recipient doesn’t acknowledge, but there’s no follow-up to choose.`);
    if (s.acks.every((x) => x.verdict !== "poor" && x.verdict !== "critical") && !s.followUps.length) out.push(`${name} never reaches a follow-up.`);
  }
  for (const r of ROLE_IDS)
    if (!b.stages.some((s) => s.kind === "handoff" && s.role === r)) out.push(`The ${b.roles[r].label} has no handoff stage, so it can’t be played.`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// What the learner does
// ---------------------------------------------------------------------------------------------

export type Decision = {
  placements: Record<string, Placement>;
  recipient: string;
  urgency: string;
  channel: string;
  owner: string;
  ack: string;
  actions: string[];
  redFlag: string;
  followUp: string;
};
export const blankDecision = (): Decision => ({
  placements: {},
  recipient: "",
  urgency: "",
  channel: "",
  owner: "",
  ack: "",
  actions: [],
  redFlag: "",
  followUp: "",
});

export function cleanDecision(s: Stage, raw: unknown): Decision {
  const r = obj(raw);
  const pick = (v: unknown, opts: Option[]) => (typeof v === "string" && opts.some((x) => x.id === v) ? v : "");
  const placements: Record<string, Placement> = {};
  for (const [k, v] of Object.entries(obj(r.placements))) if (s.factIds.includes(k) && PLACEMENT_IDS.includes(v as Placement)) placements[k] = v as Placement;
  return {
    placements,
    recipient: pick(r.recipient, s.recipients),
    urgency: pick(r.urgency, s.urgency),
    channel: pick(r.channel, s.channels),
    owner: pick(r.owner, s.owners),
    ack: pick(r.ack, s.acks),
    actions: [...new Set((Array.isArray(r.actions) ? r.actions : []).filter((x): x is string => typeof x === "string" && s.actions.some((a) => a.id === x)))],
    redFlag: s.redFlag ? pick(r.redFlag, s.redFlag.options) : "",
    followUp: pick(r.followUp, s.followUps),
  };
}

/** What's still to choose before the handoff can be sent. */
export function sendProblems(s: Stage, d: Decision): string[] {
  const out: string[] = [];
  if (s.redFlag && !d.redFlag) out.push("Deal with the urgent concern first.");
  if (s.factIds.some((f) => !d.placements[f])) out.push("Sort every fact: send, verify first, or keep in the record.");
  if (!d.recipient) out.push("Choose who receives it.");
  if (!d.urgency) out.push("Choose how urgent it is.");
  if (!d.channel) out.push("Choose the channel.");
  if (!d.owner) out.push("Name who owns the next step.");
  if (!d.ack) out.push("Choose how receipt is confirmed.");
  return out;
}

/** In the story, is the handoff acknowledged? Only if receipt was asked for properly and the recipient responds. */
export function acknowledged(s: Stage, d: Decision) {
  const a = s.acks.find((x) => x.id === d.ack);
  return Boolean(a && (a.verdict === "good" || a.verdict === "ok") && s.responds);
}

const RANK: Record<Verdict, number> = { good: 0, ok: 0, poor: 1, critical: 2 };
const toResult = (v: number): Result => (v >= 2 ? "critical" : v === 1 ? "followup" : "ontrack");

export type Frame = { title: string; lines: string[] };
export type Preview = { frames: Frame[]; open: boolean };

/** The ten-second preview: what arrived, what the next role can do with it, and who has the baton. Never a clinical outcome. */
export function preview(b: BatonBlockData, s: Stage, d: Decision): Preview {
  const factById = new Map(b.facts.map((f) => [f.id, f]));
  const who = (id: string) => (id === PARTICIPANT ? b.person.name : (s.recipients.find((x) => x.id === id)?.text ?? ""));
  const opt = (g: Option[], id: string) => g.find((x) => x.id === id);
  const sent = s.factIds.filter((f) => d.placements[f] === "send").map((f) => factById.get(f)!);
  const verify = s.factIds.filter((f) => d.placements[f] === "verify").map((f) => factById.get(f)!);
  const lines = [
    opt(s.recipients, d.recipient)?.line,
    ...s.factRules.filter((r) => !r.accept.includes(d.placements[r.factId] ?? "keep")).map((r) => r.line),
    opt(s.channels, d.channel)?.line,
    opt(s.urgency, d.urgency)?.line,
    opt(s.owners, d.owner)?.line,
    ...d.actions.map((a) => opt(s.actions, a)?.line),
    s.redFlag ? opt(s.redFlag.options, d.redFlag)?.line : "",
  ].filter((x): x is string => Boolean(x));
  const open = !acknowledged(s, d);
  return {
    open,
    frames: [
      {
        title: `Arrives: ${who(d.recipient)}`,
        lines: [
          `${opt(s.channels, d.channel)?.text ?? ""} · ${opt(s.urgency, d.urgency)?.text ?? ""}`,
          ...(sent.length ? sent.map((f) => `${f.text} (${STATUSES[f.status].toLowerCase()})`) : ["Nothing was sent."]),
          ...(verify.length ? [`Flagged to verify: ${verify.map((f) => f.text).join("; ")}`] : []),
        ],
      },
      { title: "What they can do with it", lines: lines.length ? lines : ["They can act on it."] },
      {
        title: "Who has the baton",
        lines: [
          `Next step: ${opt(s.owners, d.owner)?.text ?? "no one named"}.`,
          open ? "Not acknowledged: the handoff is still open." : "Acknowledged: they’ve confirmed they have it.",
        ],
      },
    ],
  };
}

export type StageFeedback = {
  stageId: string;
  result: Result;
  dims: { dim: Dim; label: string; result: Result }[];
  items: { label: string; verdict: Verdict; feedback: string }[];
  reached: string[];
  missing: string[];
  baton: string;
  participant: string;
  goodPath: string;
  preview: Preview;
  /** Still waiting on a follow-up choice. */
  needsFollowUp: boolean;
};

/** Reads one try at a handoff against the authored rules. */
export function readHandoff(b: BatonBlockData, s: Stage, d: Decision): StageFeedback {
  const factById = new Map(b.facts.map((f) => [f.id, f]));
  const items: { label: string; verdict: Verdict; dim: Dim; feedback: string }[] = [];
  const missing: string[] = [];
  for (const r of s.factRules) {
    const placed = d.placements[r.factId] ?? "keep";
    const fact = factById.get(r.factId);
    if (r.accept.includes(placed)) continue;
    items.push({ label: `“${fact?.text}”: ${PLACEMENTS[placed].toLowerCase()}`, verdict: r.critical ? "critical" : "poor", dim: r.dim, feedback: r.feedback });
    if (placed === "keep" && (r.accept.includes("send") || r.accept.includes("verify"))) missing.push(fact?.text ?? "");
  }
  const single = (g: Option[], id: string, what: string) => {
    const x = g.find((y) => y.id === id);
    if (x) items.push({ label: `${what}: ${x.text}`, verdict: x.verdict, dim: x.dim, feedback: x.feedback });
  };
  if (s.redFlag) single(s.redFlag.options, d.redFlag, "The urgent concern");
  single(s.recipients, d.recipient, "Recipient");
  single(s.urgency, d.urgency, "Urgency");
  single(s.channels, d.channel, "Channel");
  single(s.owners, d.owner, "Owner");
  single(s.acks, d.ack, "Receipt");
  for (const a of s.actions) {
    const chosen = d.actions.includes(a.id);
    if (chosen) items.push({ label: a.text, verdict: a.verdict, dim: a.dim, feedback: a.feedback });
    else if (a.verdict === "good") {
      items.push({ label: `Not done: ${a.text}`, verdict: "poor", dim: a.dim, feedback: a.missing || a.feedback });
      if (a.missing) missing.push(a.missing);
    }
  }
  const pv = preview(b, s, d);
  const needsFollowUp = pv.open && !d.followUp && s.followUps.length > 0;
  if (pv.open && d.followUp) single(s.followUps, d.followUp, "Follow-up");
  if (pv.open && !s.followUps.length)
    items.push({ label: "Receipt", verdict: "poor", dim: "ownership", feedback: "It was never acknowledged, so the handoff is still open." });
  const worst = items.reduce((n, x) => Math.max(n, RANK[x.verdict]), 0);
  const result = toResult(worst);
  const owner = s.owners.find((x) => x.id === d.owner);
  const follow = s.followUps.find((x) => x.id === d.followUp);
  return {
    stageId: s.id,
    result,
    dims: DIM_IDS.filter((dim) => items.some((x) => x.dim === dim)).map((dim) => ({
      dim,
      label: DIMS[dim],
      result: toResult(items.filter((x) => x.dim === dim).reduce((n, x) => Math.max(n, RANK[x.verdict]), 0)),
    })),
    items: items.filter((x) => x.feedback).map(({ label, verdict, feedback }) => ({ label, verdict, feedback })),
    reached: s.factIds.filter((f) => d.placements[f] === "send").map((f) => factById.get(f)?.text ?? ""),
    missing: missing.filter(Boolean),
    baton: [
      owner ? `${owner.text}.` : "No one was named to own the next step.",
      pv.open
        ? follow
          ? `It wasn’t acknowledged, so you followed up: ${follow.text}.`
          : "It hasn’t been acknowledged yet."
        : "The recipient acknowledged it.",
    ].join(" "),
    participant: result === "ontrack" ? s.participant.good : s.participant.poor,
    goodPath: s.goodPath,
    preview: pv,
    needsFollowUp,
  };
}

/** Where the learner is: their role, an unsent draft per stage, every send, and which roles they've passed. */
export type BatonState = {
  role: RoleId | "";
  drafts: Record<string, Decision>;
  tries: Record<string, Decision[]>;
  /** Stages whose last try finished with no critical gap. */
  passed: string[];
  finished: boolean;
};
export const emptyBaton = (): BatonState => ({ role: "", drafts: {}, tries: {}, passed: [], finished: false });

export function cleanBatonState(b: BatonBlockData, raw: unknown): BatonState {
  const r = obj(raw);
  const handoffs = b.stages.filter((s) => s.kind === "handoff");
  const drafts: Record<string, Decision> = {};
  const tries: Record<string, Decision[]> = {};
  for (const s of handoffs) {
    if (obj(r.drafts)[s.id]) drafts[s.id] = cleanDecision(s, obj(r.drafts)[s.id]);
    const t = obj(r.tries)[s.id];
    if (Array.isArray(t)) tries[s.id] = t.slice(-20).map((x) => cleanDecision(s, x));
  }
  return {
    role: handoffs.some((s) => s.role === r.role) ? (r.role as RoleId) : "",
    drafts,
    tries,
    passed: (Array.isArray(r.passed) ? r.passed : []).filter((x): x is string => typeof x === "string" && handoffs.some((s) => s.id === x)),
    finished: r.finished === true,
  };
}

export const stageFor = (b: BatonBlockData, role: RoleId | "") => b.stages.find((s) => s.kind === "handoff" && s.role === role);

/**
  Sends a handoff (or completes it with a follow-up). Every send is kept. A try that's still open waits for its
  follow-up; one with a critical gap needs a replay; anything else passes the role.
*/
export function sendHandoff(b: BatonBlockData, st: BatonState, d: Decision): { state: BatonState; feedback: StageFeedback } | { problem: string } {
  const s = stageFor(b, st.role);
  if (!s) return { problem: "Choose a role first." };
  const problems = sendProblems(s, d);
  if (problems.length) return { problem: problems.join(" ") };
  const feedback = readHandoff(b, s, d);
  const prior = st.tries[s.id] ?? [];
  // A follow-up completes the latest send rather than adding another.
  const last = prior[prior.length - 1];
  const completing = Boolean(d.followUp && last && !last.followUp && JSON.stringify({ ...last, followUp: "" }) === JSON.stringify({ ...d, followUp: "" }));
  const tries = { ...st.tries, [s.id]: completing ? [...prior.slice(0, -1), d] : [...prior, d].slice(-20) };
  const done = !feedback.needsFollowUp;
  const passed =
    done && feedback.result !== "critical"
      ? [...new Set([...st.passed, s.id])]
      : done && feedback.result === "critical"
        ? st.passed.filter((x) => x !== s.id)
        : st.passed;
  const drafts = { ...st.drafts };
  if (done) delete drafts[s.id];
  return { state: { ...st, tries, passed, drafts }, feedback };
}

/** Choosing a role starts it from the clean authored state. The learner's other roles are untouched. */
export function chooseRole(b: BatonBlockData, st: BatonState, role: unknown): BatonState | { problem: string } {
  const s = stageFor(b, role as RoleId);
  if (!s) return { problem: "That role isn’t in this relay." };
  if (b.assignedRole && role !== b.assignedRole && !st.passed.includes(stageFor(b, b.assignedRole)?.id ?? ""))
    return { problem: "Play your assigned role first." };
  return { ...st, role: role as RoleId };
}

export const finishBatonProblems = (b: BatonBlockData, st: BatonState) => {
  const need = b.rolesToComplete;
  const have = st.passed.length;
  return have >= need ? [] : [`Play ${need - have} more ${need - have === 1 ? "role" : "roles"} without a critical gap.`];
};

/** The relay map: each stage, and who had the baton. Played roles show the learner's latest handoff; others the authored story. */
export function relayMap(b: BatonBlockData, st: BatonState) {
  return b.stages.map((s) => {
    if (s.kind === "event")
      return { id: s.id, label: s.label, time: s.time, kind: s.kind, role: "", text: s.narrative, result: null as Result | null, played: false };
    const tries = st.tries[s.id] ?? [];
    const last = tries[tries.length - 1];
    const f = last ? readHandoff(b, s, last) : null;
    return {
      id: s.id,
      label: s.label,
      time: s.time,
      kind: s.kind,
      role: b.roles[s.role as RoleId]?.label ?? "",
      text: f ? f.baton : s.scripted,
      result: f && !f.needsFollowUp ? f.result : null,
      played: Boolean(f),
    };
  });
}
export type RelayStop = ReturnType<typeof relayMap>[number];
