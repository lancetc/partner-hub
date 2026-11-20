/*
  Spot the Signal (docs/spot-the-signal.md): a Magazine block where a learner reads three ordinary
  updates about one fictional client (an invoice, a shift note, a voicemail), picks out what matters,
  says what kind of evidence each piece is, decides what to do first, and only then makes a provisional
  SIRS assessment and writes a handover. Shared by the parser, the server's scoring and the pages.

  The block teaches escalation, not classification. The learner never lodges anything, the reporting
  windows are shown as the provider's outer limits (never as time the learner has), and nothing is scored
  for speed. The answer key lives in the block and is removed before a course reaches a learner's browser.
*/

export type ClueKind = "observed" | "reported" | "hypothesis";
export const CLUE_KINDS: Record<ClueKind, { label: string; text: string }> = {
  observed: { label: "Observed fact", text: "Something a person saw or a document shows." },
  reported: { label: "Reported allegation", text: "Something someone says happened. It matters, and it isn’t proven." },
  hypothesis: { label: "Hypothesis to check", text: "A possible explanation. It needs someone to look into it." },
};
/** What a learner can say about a passage: a kind of evidence, or that it isn't a signal after all. */
export type ClueMark = ClueKind | "distractor";

export type SignalPassage = {
  id: string;
  text: string;
  /** For an invoice line: this invoice's figure and the earlier ones, as text. */
  amount: string;
  previous: string;
  /** Key: whether it matters, is a tempting distraction, or is neither. */
  signal: "material" | "distractor" | "none";
  /** Key: what kind of evidence it is. */
  kind: ClueKind;
  /** Key: why, for the debrief. */
  why: string;
};
export type ArtefactKind = "invoice" | "note" | "voicemail";
export const ARTEFACTS: Record<ArtefactKind, string> = { invoice: "Invoice", note: "Shift note", voicemail: "Voicemail" };
export type SignalArtefact = {
  id: string;
  kind: ArtefactKind;
  title: string;
  /** Who or what it came from. */
  source: string;
  /** When it happened, and when it was recorded or received. As written, for display. */
  eventAt: string;
  receivedAt: string;
  /** What goes with it: the service agreement excerpt for an invoice, who the caller is for a voicemail. */
  context: string;
  passages: SignalPassage[];
  /** A recording of the voicemail. The passages are its transcript, so it's never the only way in. */
  audio: string;
};

export type ActionRole = "essential" | "helpful" | "insufficient" | "unsafe";
export const ACTION_ROLES: Record<ActionRole, string> = {
  essential: "Needed in this case",
  helpful: "Reasonable, not enough by itself",
  insufficient: "Not enough by itself",
  unsafe: "Leaves the person unprotected",
};
export type SignalAction = {
  id: string;
  /** The route, in Trilogy Care's own words. Simulated: choosing it contacts no one. */
  label: string;
  guidance: string;
  /** Key. */
  role: ActionRole;
  feedback: string;
  /** Key: for a choice that delays, what the made-up timeline shows next. */
  consequence: string;
};

export type Connection = "yes" | "no" | "unclear";
export const CONNECTIONS: Record<Connection, string> = {
  yes: "Yes, on what’s reported",
  no: "No, not on these facts",
  unclear: "I can’t tell yet",
};
export type Priority = "p1" | "p2" | "unknown" | "none";
export const PRIORITIES: Record<Priority, { label: string; text: string }> = {
  p1: { label: "Priority 1", text: "I think the authorised reviewer would assess this as Priority 1." },
  p2: { label: "Priority 2", text: "I think the authorised reviewer would assess this as Priority 2." },
  unknown: { label: "Not established yet", text: "It needs urgent internal assessment. I can’t tell the priority from these facts." },
  none: { label: "Not SIRS reportable on current facts", text: "Other action is still required, and it’s reassessed if new facts come in." },
};

export type SignalKey = {
  connection: Connection;
  /** The reportable types offered, and which one the reviewed case supports ("" for none established). */
  types: { id: string; label: string }[];
  typeId: string;
  priority: Priority;
  /** Other answers that are defensible on the facts given. */
  alsoAccept: Priority[];
  /** The explanation of the reviewed classification, and where in the source it comes from. */
  why: string;
  anchor: string;
  /** The senior reviewer's example handover, and the facts still needed. */
  handover: string;
  needed: string[];
};

export type SignalBlockData = {
  title: string;
  client: string;
  /** Who the learner is in the case. */
  role: string;
  intro: string;
  artefacts: SignalArtefact[];
  /** When the provider became aware, as reviewed for this case (yyyy-mm-ddThh:mm), or empty when that can't be said confidently. */
  awareAt: string;
  awareNote: string;
  actions: SignalAction[];
  key: SignalKey;
  source: { title: string; version: string; reviewedOn: string };
  approval: { owner: string; clinical: string; quality: string; approvedOn: string; effectiveOn: string; reviewOn: string };
};

export const SIGNAL_NOTICE = "This is a training case. Nothing you enter sends a real alert, makes a record or contacts anyone.";
export const TIMER_LABEL = "Time since provider became aware";
export const WINDOW_NOTE =
  "These are the provider’s outer limits for notifying the Commission. They aren’t how long you have: you escalate straight away, and the person’s safety and care don’t wait for a classification.";
export const NOT_YOURS = "A Care Partner doesn’t decide the classification or lodge the report. The authorised team assesses it and records why.";
export const POTENTIAL_HARM =
  "Harm that could reasonably have been expected doesn’t, by itself, make an incident Priority 1 under the October 2026 guidelines.";
export const MAX_CLUES = 5;

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

const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (all.includes(v as T) ? (v as T) : d);
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});

/**
  The block's fields, checked. Publishing needs three artefacts with something material in them, a safe
  first action, a reviewed classification with its explanation, a source and version, and the names and
  date of Clinical and Quality approval.
*/
export function parseSignal(o: Raw, where: string, h: ParseHelpers): SignalBlockData {
  const { str, idOf, list, unfinished } = h;
  const artefacts = list(o.artefacts, where, "artefacts", 3).map((a, i): SignalArtefact => {
    const at = `${where} artefact ${i + 1}`;
    const passages = list(a.passages, at, "lines", 14).map((p, j): SignalPassage => ({
      id: idOf(p.id, `${at} line ${j + 1}`),
      text: str(p.text, `${at} line ${j + 1}`, { required: true, max: 500 }) ?? "",
      amount: str(p.amount, `${at} line ${j + 1} amount`, { max: 40 }) ?? "",
      previous: str(p.previous, `${at} line ${j + 1} earlier amounts`, { max: 80 }) ?? "",
      signal: oneOf(p.signal, ["material", "distractor", "none"] as const, "none"),
      kind: oneOf(p.kind, ["observed", "reported", "hypothesis"] as const, "observed"),
      why: str(p.why, `${at} line ${j + 1}: why it matters`, { max: 500 }) ?? "",
    }));
    if (passages.length < 2) unfinished(`${at} needs at least 2 lines to read.`);
    passages.forEach((p, j) => p.signal !== "none" && !p.why && unfinished(`${at} line ${j + 1}: say why it is or isn’t a signal, for the debrief.`));
    return {
      id: idOf(a.id, at),
      kind: oneOf(a.kind, ["invoice", "note", "voicemail"] as const, (["invoice", "note", "voicemail"] as const)[i] ?? "note"),
      title: str(a.title, `${at} title`, { required: true, max: 120 }) ?? "",
      source: str(a.source, `${at} source`, { required: true, max: 120 }) ?? "",
      eventAt: str(a.eventAt, `${at}: when it happened`, { max: 60 }) ?? "",
      receivedAt: str(a.receivedAt, `${at}: when it was received`, { required: true, max: 60 }) ?? "",
      context: str(a.context, `${at} context`, { max: 800 }) ?? "",
      passages,
      audio: typeof a.audio === "string" && /^\/api\/uploads\/[\w.-]+$/.test(a.audio) ? a.audio : "",
    };
  });
  if (artefacts.length !== 3) unfinished(`${where} needs three artefacts: an invoice, a shift note and a voicemail.`);
  for (const k of ["invoice", "note", "voicemail"] as const)
    if (artefacts.length === 3 && !artefacts.some((a) => a.kind === k))
      unfinished(`${where} needs ${k === "invoice" ? "an invoice" : k === "note" ? "a shift note" : "a voicemail"}.`);
  if (!artefacts.some((a) => a.passages.some((p) => p.signal === "material"))) unfinished(`${where} needs at least one line marked as a signal that matters.`);

  const actions = list(o.actions, where, "actions", 10).map((a, i): SignalAction => ({
    id: idOf(a.id, `${where} action ${i + 1}`),
    label: str(a.label, `${where} action ${i + 1}`, { required: true, max: 160 }) ?? "",
    guidance: str(a.guidance, `${where} action ${i + 1} guidance`, { max: 300 }) ?? "",
    role: oneOf(a.role, ["essential", "helpful", "insufficient", "unsafe"] as const, "helpful"),
    feedback: str(a.feedback, `${where} action ${i + 1} feedback`, { required: true, max: 600 }) ?? "",
    consequence: str(a.consequence, `${where} action ${i + 1}: what happens next`, { max: 400 }) ?? "",
  }));
  if (actions.length < 3) unfinished(`${where} needs at least 3 actions to choose from.`);
  if (!actions.some((a) => a.role === "essential")) unfinished(`${where} needs at least one action marked as needed in this case.`);

  const k = obj(o.key);
  const types = list(k.types, where, "reportable types", 8).map((t, i) => ({
    id: idOf(t.id, `${where} reportable type ${i + 1}`),
    label: str(t.label, `${where} reportable type ${i + 1}`, { required: true, max: 160 }) ?? "",
  }));
  if (!types.length) unfinished(`${where} needs the reportable types the learner chooses between.`);
  const typeId = typeof k.typeId === "string" && types.some((t) => t.id === k.typeId) ? k.typeId : "";
  const priority = oneOf(k.priority, ["p1", "p2", "unknown", "none"] as const, "unknown");
  // A priority only follows from a reportable type; without one the case is "not reportable on current facts" or "not established".
  if ((priority === "p1" || priority === "p2") && !typeId) unfinished(`${where}: a Priority 1 or 2 classification needs the reportable type it rests on.`);
  const s = obj(o.source);
  const ap = obj(o.approval);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const approval = {
    owner: str(ap.owner, `${where} content owner`, { max: 120 }) ?? "",
    clinical: str(ap.clinical, `${where} clinical reviewer`, { max: 120 }) ?? "",
    quality: str(ap.quality, `${where} Quality reviewer`, { max: 120 }) ?? "",
    approvedOn: day(ap.approvedOn),
    effectiveOn: day(ap.effectiveOn),
    reviewOn: day(ap.reviewOn),
  };
  // The answer key is a regulatory judgement: it isn't published on an author's say-so.
  if (!approval.owner || !approval.clinical || !approval.quality || !approval.approvedOn)
    unfinished(
      `${where}: Clinical and Quality approval is required. Record the content owner, the clinical reviewer, the Quality reviewer and the date they approved the case and its answers.`,
    );
  const source = {
    title: str(s.title, `${where} source`, { max: 200 }) ?? "",
    version: str(s.version, `${where} source version`, { max: 80 }) ?? "",
    reviewedOn: day(s.reviewedOn),
  };
  if (!source.title || !source.version) unfinished(`${where}: record the policy source and its version that the answers were checked against.`);
  return {
    title: str(o.title, `${where} title`, { required: true, max: 160 }) ?? "",
    client: str(o.client, `${where}: the fictional client`, { required: true, max: 80 }) ?? "",
    role: str(o.role, `${where}: the learner’s role`, { max: 160 }) ?? "",
    intro: str(o.intro, `${where} introduction`, { max: 600 }) ?? "",
    artefacts,
    awareAt: typeof o.awareAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.awareAt) ? o.awareAt : "",
    awareNote: str(o.awareNote, `${where}: about the awareness time`, { max: 400 }) ?? "",
    actions,
    key: {
      connection: oneOf(k.connection, ["yes", "no", "unclear"] as const, "unclear"),
      types,
      typeId,
      priority,
      alsoAccept: (Array.isArray(k.alsoAccept) ? k.alsoAccept : []).filter((x): x is Priority => ["p1", "p2", "unknown", "none"].includes(x as string)),
      why: str(k.why, `${where}: the explanation of the classification`, { required: true, max: 1500 }) ?? "",
      anchor: str(k.anchor, `${where}: where in the source`, { max: 200 }) ?? "",
      handover: str(k.handover, `${where}: the senior reviewer’s example handover`, { required: true, max: 2500 }) ?? "",
      needed: (Array.isArray(k.needed) ? k.needed : [])
        .slice(0, 8)
        .map((x, i) => str(x, `${where} missing fact ${i + 1}`, { max: 200 }) ?? "")
        .filter(Boolean),
    },
    source,
    approval,
  };
}

/** The block as a learner's browser gets it: the case, without what marks an answer right. */
export function signalForReaders<T extends SignalBlockData>(b: T): T {
  return {
    ...b,
    artefacts: b.artefacts.map((a) => ({ ...a, passages: a.passages.map((p) => ({ ...p, signal: "none" as const, kind: "observed" as const, why: "" })) })),
    actions: b.actions.map((a) => ({ ...a, role: "helpful" as const, feedback: "", consequence: "" })),
    key: { ...b.key, connection: "unclear" as const, typeId: "", priority: "unknown" as const, alsoAccept: [], why: "", anchor: "", handover: "", needed: [] },
    awareNote: "",
  };
}

// ---------------------------------------------------------------------------------------------
// What a learner does, and how it's read
// ---------------------------------------------------------------------------------------------

export const STAGES = ["Case arrives", "The three updates", "Connect the clues", "What do you do now?", "Provisional assessment", "Handover"] as const;
export const HANDOVER_FIELDS = {
  chronology: { label: "What happened, in order", hint: "With dates and times, and where each piece came from." },
  quotes: { label: "Exact words", hint: "Quote what was written or said, in quotation marks." },
  facts: { label: "What was observed, and what was reported", hint: "Keep them apart." },
  concern: { label: "Immediate safety concern", hint: "What worries you about the person right now, if anything." },
  taken: { label: "Action already taken", hint: "" },
  needed: { label: "What still needs finding out", hint: "" },
  who: { label: "Who you escalated to, and when", hint: "A role, not a real person’s name." },
} as const;
export type HandoverField = keyof typeof HANDOVER_FIELDS;

export type SignalState = {
  stage: number;
  /** Passages picked out, and what the learner says each is. */
  clues: Record<string, ClueMark>;
  /** Clues the learner has linked, with what the link is. */
  links: { a: string; b: string; kind: ClueKind }[];
  /** Actions chosen, in the order chosen. */
  actions: string[];
  connection: Connection | "";
  typeId: string | null;
  priority: Priority | "";
  rationale: string;
  /** The clue the rationale rests on. */
  rationaleClue: string;
  handover: Record<HandoverField, string>;
};
export const emptyState = (): SignalState => ({
  stage: 0,
  clues: {},
  links: [],
  actions: [],
  connection: "",
  typeId: null,
  priority: "",
  rationale: "",
  rationaleClue: "",
  handover: { chronology: "", quotes: "", facts: "", concern: "", taken: "", needed: "", who: "" },
});

/** A saved state made safe: only this block's ids, sensible lengths, nothing extra. */
export function cleanState(b: SignalBlockData, raw: unknown): SignalState {
  const r = obj(raw);
  const ids = new Set(b.artefacts.flatMap((a) => a.passages.map((p) => p.id)));
  const clues: Record<string, ClueMark> = {};
  for (const [id, mark] of Object.entries(obj(r.clues)).slice(0, 40))
    if (ids.has(id) && ["observed", "reported", "hypothesis", "distractor"].includes(mark as string)) clues[id] = mark as ClueMark;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const hand = obj(r.handover);
  return {
    stage: Math.min(STAGES.length - 1, Math.max(0, Math.round(Number(r.stage)) || 0)),
    clues,
    links: (Array.isArray(r.links) ? (r.links as Raw[]) : [])
      .filter((l) => typeof l?.a === "string" && typeof l?.b === "string" && clues[l.a as string] && clues[l.b as string] && l.a !== l.b)
      .slice(0, 10)
      .map((l) => ({ a: l.a as string, b: l.b as string, kind: oneOf(l.kind, ["observed", "reported", "hypothesis"] as const, "hypothesis") })),
    actions: [...new Set((Array.isArray(r.actions) ? r.actions : []).filter((x): x is string => typeof x === "string" && b.actions.some((a) => a.id === x)))],
    connection: oneOf(r.connection, ["yes", "no", "unclear", ""] as const, ""),
    typeId: r.typeId === "" ? "" : typeof r.typeId === "string" && b.key.types.some((t) => t.id === r.typeId) ? r.typeId : null,
    priority: oneOf(r.priority, ["p1", "p2", "unknown", "none", ""] as const, ""),
    rationale: text(r.rationale, 400),
    rationaleClue: typeof r.rationaleClue === "string" && ids.has(r.rationaleClue) ? r.rationaleClue : "",
    handover: Object.fromEntries((Object.keys(HANDOVER_FIELDS) as HandoverField[]).map((f) => [f, text(hand[f], 1200)])) as Record<HandoverField, string>,
  };
}

export type ActionFeedback = {
  chosen: { id: string; label: string; role: ActionRole; feedback: string; consequence: string }[];
  /** Why the learner must look at this again before going on. Empty: they can carry on. */
  critical: string[];
  /** Needed actions they didn't choose, named only once they're past this step. */
  missed: string[];
};

/**
  What the learner's first actions amount to. Leaving a real concern in routine notes, or waiting for
  proof before telling anyone, has to be looked at again before the case can be finished. Choosing more
  than is strictly needed is never a failure.
*/
export function actionFeedback(b: SignalBlockData, chosen: string[]): ActionFeedback {
  const picked = chosen.map((id) => b.actions.find((a) => a.id === id)).filter((a): a is SignalAction => Boolean(a));
  const essential = b.actions.filter((a) => a.role === "essential");
  const critical: string[] = [];
  const unsafe = picked.filter((a) => a.role === "unsafe");
  if (unsafe.length)
    critical.push(
      `“${unsafe[0].label}” leaves the concern with no one looking at it. An allegation or a worry about someone’s safety is passed on straight away; proving it is someone else’s job.`,
    );
  else if (picked.length && !picked.some((a) => a.role === "essential"))
    critical.push(
      "What you’ve chosen doesn’t get this in front of anyone who can act on it. Think about who needs to know now, and what the person needs first.",
    );
  return {
    chosen: picked.map(({ id, label, role, feedback, consequence }) => ({ id, label, role, feedback, consequence })),
    critical,
    missed: critical.length ? [] : essential.filter((a) => !chosen.includes(a.id)).map((a) => a.label),
  };
}

export const DIMENSIONS = {
  detect: { label: "Detect and connect clues", weight: 20 },
  evidence: { label: "Evidence quality", weight: 20 },
  protect: { label: "Protect and escalate", weight: 30 },
  sirs: { label: "SIRS reasoning", weight: 20 },
  handover: { label: "Handover", weight: 10 },
} as const;
export type Dim = keyof typeof DIMENSIONS;
export const RATING = ["Worth another look", "Partly there", "Strong"] as const;

/** Words that turn an allegation into a verdict. A handover reports; it doesn't conclude. */
const VERDICT =
  /\b(stole|stolen|thief|theft by|guilty|definitely|obviously|clearly (took|stole|abused)|is abusing|has dementia|lacks capacity|is a criminal)\b/i;

export type SignalResult = {
  dims: Record<Dim, { score: number; notes: string[] }>;
  /** Out of 100, by the weights. Kept with the attempt; the learner is shown the words, not the number. */
  total: number;
  flags: { missedSignals: boolean; unwarrantedCertainty: boolean; unsafeDelay: boolean; careConnection: boolean; strongHandover: boolean };
  critical: string[];
};

/** How a finished attempt reads against the reviewed case. Speed is never part of it. */
export function scoreSignal(b: SignalBlockData, s: SignalState): SignalResult {
  const passages = b.artefacts.flatMap((a) => a.passages);
  const material = passages.filter((p) => p.signal === "material");
  const distractors = passages.filter((p) => p.signal === "distractor");
  const marked = (id: string) => s.clues[id];
  const found = material.filter((p) => marked(p.id) && marked(p.id) !== "distractor");
  const fooled = distractors.filter((p) => marked(p.id) && marked(p.id) !== "distractor");
  const sources = new Set(b.artefacts.filter((a) => a.passages.some((p) => found.includes(p))).map((a) => a.id));
  const linked = s.links.some((l) => {
    const art = (id: string) => b.artefacts.find((a) => a.passages.some((p) => p.id === id))?.id;
    return art(l.a) !== art(l.b) && found.some((p) => p.id === l.a || p.id === l.b);
  });
  const detectNotes: string[] = [];
  if (found.length < material.length) detectNotes.push(`You picked out ${found.length} of the ${material.length} things that matter here.`);
  if (fooled.length) detectNotes.push("Something you treated as a signal has an ordinary explanation in the case. An unusual figure isn’t evidence by itself.");
  if (material.length > 1 && !linked)
    detectNotes.push("The point of this case is the pattern across sources. Try linking a clue from one update to a clue from another.");
  const detect = material.length
    ? Math.max(0, (found.length / material.length) * 0.7 + (linked || material.length < 2 ? 0.3 : 0) - (fooled.length ? 0.2 : 0))
    : 1;

  const labelled = found.filter((p) => marked(p.id) === p.kind);
  const evidenceNotes: string[] = [];
  const wrong = found.filter((p) => marked(p.id) !== p.kind);
  if (wrong.length)
    evidenceNotes.push(
      `“${wrong[0].text.slice(0, 80)}” is ${CLUE_KINDS[wrong[0].kind].label.toLowerCase()}, not ${CLUE_KINDS[marked(wrong[0].id) as ClueKind].label.toLowerCase()}.`,
    );
  const certain = VERDICT.test(`${s.rationale} ${Object.values(s.handover).join(" ")}`);
  if (certain)
    evidenceNotes.push("Some of your wording states a conclusion. Report what was seen and what was said, and leave the finding to the people who assess it.");
  const evidence = Math.max(0, (found.length ? labelled.length / found.length : 0) - (certain ? 0.3 : 0));

  const fb = actionFeedback(b, s.actions);
  const essential = b.actions.filter((a) => a.role === "essential");
  const protectNotes = fb.missed.map((m) => `This case also needed: ${m}.`);
  const protect = fb.critical.length ? 0 : essential.length ? essential.filter((a) => s.actions.includes(a.id)).length / essential.length : 1;

  const sirsNotes: string[] = [];
  const connectionRight = s.connection === b.key.connection;
  const typeRight = (s.typeId ?? "") === b.key.typeId && s.typeId !== null;
  const priorityRight = s.priority === b.key.priority || (s.priority !== "" && b.key.alsoAccept.includes(s.priority));
  if (!connectionRight)
    sirsNotes.push("Look again at the connection with funded aged care: who is said to have done what, and were they delivering care for the provider?");
  if (!typeRight) sirsNotes.push("The reportable type comes before the priority. Check the facts against a defined type.");
  if (!priorityRight)
    sirsNotes.push(
      s.priority === "p1" && b.key.priority !== "p1"
        ? POTENTIAL_HARM
        : "The priority follows from the conditions in the facts given, not from how serious it feels.",
    );
  if (!s.rationale.trim() || !s.rationaleClue) sirsNotes.push("Tie your reasoning to a specific clue.");
  const sirs = (Number(connectionRight) + Number(typeRight) + Number(priorityRight)) / 3 - (s.rationale.trim() && s.rationaleClue ? 0 : 0.15);

  const filled = (Object.keys(HANDOVER_FIELDS) as HandoverField[]).filter((f) => s.handover[f].trim().length >= 8);
  const quoted =
    /["“][^"”]{6,}["”]/.test(s.handover.quotes) || material.some((p) => s.handover.quotes.toLowerCase().includes(p.text.toLowerCase().slice(0, 24)));
  const handoverNotes: string[] = [];
  if (filled.length < 7)
    handoverNotes.push(
      `${7 - filled.length} part${7 - filled.length === 1 ? "" : "s"} of the handover ${7 - filled.length === 1 ? "is" : "are"} empty or very thin.`,
    );
  if (!quoted) handoverNotes.push("Include the exact words, in quotation marks. They’re what the reviewer will rely on.");
  const handover = Math.max(0, (filled.length / 7) * 0.7 + (quoted ? 0.3 : 0) - (certain ? 0.2 : 0));

  const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
  const dims = {
    detect: { score: clamp(detect), notes: detectNotes },
    evidence: { score: clamp(evidence), notes: evidenceNotes },
    protect: { score: clamp(protect), notes: protectNotes },
    sirs: { score: clamp(sirs), notes: sirsNotes },
    handover: { score: clamp(handover), notes: handoverNotes },
  };
  return {
    dims,
    total: Math.round((Object.keys(DIMENSIONS) as Dim[]).reduce((n, d) => n + dims[d].score * DIMENSIONS[d].weight, 0)),
    flags: {
      missedSignals: found.length < material.length || sources.size < 2,
      unwarrantedCertainty: certain || fooled.length > 0,
      unsafeDelay: fb.critical.length > 0,
      careConnection: !connectionRight,
      strongHandover: handover >= 0.85,
    },
    critical: fb.critical,
  };
}

export const ratingOf = (score: number) => RATING[score >= 0.8 ? 2 : score >= 0.45 ? 1 : 0];

/**
  The reporting window, as a reference: when the provider's outer limit falls, from the reviewed
  awareness time. Null when the case has no reportable priority or no confident awareness time.
*/
export function notificationWindow(b: Pick<SignalBlockData, "awareAt" | "key">): { aware: string; due: string; rule: string } | null {
  if (!b.awareAt || (b.key.priority !== "p1" && b.key.priority !== "p2")) return null;
  const aware = new Date(`${b.awareAt}:00`);
  if (Number.isNaN(aware.getTime())) return null;
  const due = new Date(aware);
  if (b.key.priority === "p1") due.setHours(due.getHours() + 24);
  else due.setDate(due.getDate() + 30);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
  return {
    aware: fmt(aware),
    due: fmt(due),
    rule: b.key.priority === "p1" ? "within 24 hours of becoming aware" : "within 30 calendar days of becoming aware",
  };
}

/**
  A copy of a case with ids of its own, so two Spot the Signal blocks (or two made from the same starter
  case) never share an id within a course. The reviewed answer still points at the right reportable type.
*/
export function freshSignal(data: SignalBlockData, tag = Math.random().toString(36).slice(2, 7)): SignalBlockData {
  const re = (id: string) => `${id.replace(/-x[a-z0-9]{5}$/, "")}-x${tag}`;
  return {
    ...data,
    artefacts: data.artefacts.map((a) => ({ ...a, id: re(a.id), passages: a.passages.map((p) => ({ ...p, id: re(p.id) })) })),
    actions: data.actions.map((a) => ({ ...a, id: re(a.id) })),
    key: {
      ...data.key,
      types: data.key.types.map((t) => ({ ...t, id: re(t.id) })),
      typeId: data.key.typeId ? re(data.key.typeId) : "",
      needed: [...data.key.needed],
      alsoAccept: [...data.key.alsoAccept],
    },
    source: { ...data.source },
    approval: { ...data.approval },
  };
}

/** Whether a case has what it needs to reach learners: who approved it, when, and against which source. */
export const signalApproved = (b: Pick<SignalBlockData, "approval" | "source">) =>
  Boolean(b.approval.owner && b.approval.clinical && b.approval.quality && b.approval.approvedOn && b.source.title && b.source.version);
