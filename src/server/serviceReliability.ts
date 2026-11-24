import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type ReliabilityBlock } from "@/lib/magazine";
import { calculate, cleanInputs, MODEL_VERSION, snapshotOf, validateInputs, type Num, type ReliabilityInputs } from "@/lib/serviceReliability";
import {
  buildDebrief,
  cleanState,
  DIM_ORDER,
  emptyState,
  finishProblems,
  LAB_VERSION,
  LAST,
  RUBRIC_VERSION,
  type Dim,
  type FlagId,
  type ReliabilityState,
} from "@/lib/reliabilityLab";
import { ensureReliability, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";

/*
  The Service Reliability Calculator ("What does a missed service cost?", docs/service-reliability.md), on the server:

  1. A learner's attempt at the fictional month, kept here and read against the same model and rubric the page shows.
     The order is enforced here: the log opens only after the first response and guess, and the debrief (the reviewed
     classification, the feedback, the story's outcome) is only sent once every step is done. Events carry fictional
     choices, matches, rubric levels and flags only: never typed words, figures, assumptions or hours.

  2. "Review my service reliability": a partner business's private Reliability Decision Sheets, scoped to the business
     on the server. Only the owner and the members they've authorised (the same access as Plan my business) can list,
     read or save them; anyone else, Trilogy staff and authors included, gets nothing, whatever id they ask for. A save
     is a new numbered version. Inputs are aggregate counts by service and time window: never a participant's or
     worker's name, a complaint, an allegation or a private fee term. None of it reaches the authors' totals.

  No AI is called anywhere in it.
*/

type AttemptRow = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  key_hash: string;
  story_version: string;
  model_version: string;
  rubric_version: string;
  state: string;
  result: string | null;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

export const caseHash = (b: ReliabilityBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureReliability(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "reliability") throw new HttpError(404, "That Service Reliability Calculator block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM reliability_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM reliability_attempts WHERE id = ?").get(id) as AttemptRow;

/** One event in the Hub's activity log. Fictional choices, matches, levels and flags only. */
function log(db: Db, a: AttemptRow, event: string, detail: object, now: Date) {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({ attempt: a.id, story: a.story_version, model: a.model_version, rubric: a.rubric_version, ...detail }),
  );
}

function view(a: AttemptRow | undefined, block: ReliabilityBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The rubric, the reviewed classification, the feedback and the story's outcome: only once the attempt is finished. */
    debrief: a?.status === "finished" ? buildDebrief(block, state, a.model_version) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION, definitions: block.definitionsVersion },
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
  };
}
export type ReliabilityView = ReturnType<typeof view>;

export function reliabilityState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: ReliabilityBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `ra-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO reliability_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    guideId,
    revisionId,
    block.id,
    user.id,
    attemptNo,
    caseHash(block),
    block.storyVersion,
    MODEL_VERSION,
    RUBRIC_VERSION,
    JSON.stringify({ ...emptyState(), retries }),
    at,
    at,
  );
  const row = reread(db, id);
  log(db, row, "reliability_started", { attemptNo }, now);
  return row;
}

const active = (db: Db, user: User, guideId: string, revisionId: string, block: ReliabilityBlock, now: Date) =>
  latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
const stored = (a: AttemptRow, block: ReliabilityBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, s: ReliabilityState, now: Date) =>
  db.prepare("UPDATE reliability_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/**
  Saves progress: the step, the response, card classifications, repair-work marks, what's been opened, actions tested
  with the learner's own assumptions, and the choices being drafted. The first guess is settled once made; the step
  moves forward one at a time, never past the later check (the debrief comes from finishing).
*/
export function saveReliability(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const prev = stored(a, block);
    const next = cleanState(block, input.state);
    // The log and everything after it open only once the response and the first guess are in.
    const ceiling = prev.prediction ? LAST - 1 : 1;
    const merged: ReliabilityState = {
      ...prev,
      stage: Math.min(ceiling, Math.max(prev.stage, Math.min(next.stage, prev.stage + 1))),
      response: next.response || prev.response,
      cards: { ...prev.cards, ...next.cards },
      entries: { ...prev.entries, ...next.entries },
      inspected: [...new Set([...prev.inspected, ...next.inspected])],
      tried: next.tried,
      estimates: next.estimates,
      freedHours: next.freedHours,
      changed: prev.changed || next.changed || next.tried.length > 0,
      // A choice can be changed until the attempt finishes, but a save that doesn't carry one never clears it.
      repeat: next.repeat || prev.repeat,
      explanation: next.explanation || prev.explanation,
      decision: next.decision || prev.decision,
      later: next.later || prev.later,
    };
    store(db, a, merged, now);
    if (merged.response && merged.response !== prev.response)
      log(db, a, "response_chosen", { response: merged.response, revised: Boolean(prev.response) }, now);
    for (const c of block.cards) {
      const m = merged.cards[c.id];
      const p = prev.cards[c.id];
      if (m?.choice && (p?.choice !== m.choice || p?.urgent !== m.urgent))
        log(
          db,
          a,
          "card_classified",
          { card: c.id, choice: m.choice, matched: m.choice === c.answer.choice, urgent: m.urgent, revised: Boolean(p?.choice) },
          now,
        );
    }
    const entriesNow = Object.keys(merged.entries).length;
    if (entriesNow === block.log.entries.length && Object.keys(prev.entries).length < entriesNow)
      log(db, a, "tasks_marked", { matched: block.log.entries.filter((e) => merged.entries[e.id] === !e.duplicate).length, of: entriesNow }, now);
    for (const x of merged.inspected.filter((y) => !prev.inspected.includes(y)))
      log(db, a, x.startsWith("occ:") ? "occurrence_opened" : "view_opened", { what: x }, now);
    for (const c of merged.tried.filter((x) => !prev.tried.includes(x))) log(db, a, "intervention_tried", { action: c }, now);
    // Which assumption was revised, never its value.
    for (const k of Object.keys(merged.estimates))
      if (prev.estimates[k] && prev.estimates[k].reduction !== merged.estimates[k].reduction) log(db, a, "assumption_revised", { action: k }, now);
    if (merged.repeat && merged.repeat !== prev.repeat)
      log(db, a, "repeat_answered", { answer: merged.repeat, flagged: (block.repeat.options.find((o) => o.id === merged.repeat)?.flags.length ?? 0) > 0 }, now);
    return view(reread(db, a.id), block);
  });
}

/** The first guess. Settled once made: the debrief compares it with the month. Only the choice is logged. */
export function submitPrediction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.prediction || a.status === "finished") return view(a, block);
    const s = cleanState(block, { prediction: input.prediction, response: input.response ?? prev.response });
    if (!s.response) throw new HttpError(400, "Choose Mrs Patel’s immediate response first.");
    if (!s.prediction || !s.prediction.cost) throw new HttpError(400, "Choose what you think the missed visits mostly cost.");
    store(db, a, { ...prev, response: s.response, prediction: s.prediction, stage: Math.max(prev.stage, 2) }, now);
    log(db, a, "prediction_submitted", { cost: s.prediction.cost }, now);
    return view(reread(db, a.id), block);
  });
}

/** The decision, explanation and later check: the attempt finishes and the debrief is sent. */
export function finishReliability(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return { id: a.id };
    const prev = stored(a, block);
    const take = (k: "decision" | "explanation" | "later") => (typeof input[k] === "string" ? input[k] : prev[k]);
    const cleaned = cleanState(block, { ...prev, decision: take("decision"), explanation: take("explanation"), later: take("later") });
    const problems = finishProblems(block, cleaned);
    if (problems.length) return { problems };
    const done: ReliabilityState = { ...cleaned, stage: LAST };
    const d = buildDebrief(block, done, MODEL_VERSION);
    const at = now.toISOString();
    const result = {
      versions: d.versions,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      unsafe: d.unsafe,
      response: done.response,
      decision: done.decision,
      explanation: done.explanation,
      later: done.later,
      cardsMatched: d.cards.filter((c) => c.matched).length,
      entriesMatched: d.entries.filter((e) => e.matched).length,
    };
    db.prepare("UPDATE reliability_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(db, a, "decision_submitted", { decision: done.decision, explanation: done.explanation, tried: done.tried }, now);
    log(db, a, "later_answered", { answer: done.later }, now);
    log(
      db,
      a,
      "reliability_completed",
      { score: d.score, dims: result.dims, flags: result.flags, unsafe: d.unsafe, cardsMatched: result.cardsMatched, entriesMatched: result.entriesMatched },
      now,
    );
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Look again: a fresh attempt from the empty Tuesday. Every attempt is kept, first and revised. */
export function retryReliability(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a && a.status !== "finished") return view(a, block);
    const retries = a ? stored(a, block).retries + 1 : 0;
    const row = create(db, user, edition.guide.id, edition.revision.id, block, (a?.attempt_no ?? 0) + 1, now, retries);
    if (a) log(db, row, "retry_started", { from: a.id }, now);
    return view(reread(db, row.id), block);
  });
}

/** The learning Decision Sheet was printed, or a private sheet saved from the article (its version number only). */
export function sheetEvent(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (!a) return { ok: true };
  if (input.action === "printed") log(db, a, "sheet_printed", {}, now);
  if (input.action === "saved" && typeof input.version === "number" && Number.isInteger(input.version))
    log(db, a, input.version > 1 ? "sheet_returned" : "sheet_saved", { version: input.version }, now);
  return { ok: true };
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels, flags
  and the choices made. Each person's first finished attempt counts. Never private sheets, and never anyone's figures.
*/
export function reliabilityStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureReliability(db);
  const rows = db
    .prepare("SELECT block_id, user_id, status, state, result, story_version, rubric_version FROM reliability_attempts WHERE guide_id = ? ORDER BY attempt_no")
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "status" | "state" | "result" | "story_version" | "rubric_version">[];
  type Totals = {
    attempts: number;
    people: Set<string>;
    predicted: number;
    finished: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    flags: Record<string, number>;
    decisions: Record<string, number>;
    later: Record<string, number>;
    unsafe: number;
    versions: Set<string>;
  };
  const blocks = new Map<string, Totals>();
  for (const r of rows) {
    const b: Totals = blocks.get(r.block_id) ?? {
      attempts: 0,
      people: new Set<string>(),
      predicted: 0,
      finished: 0,
      counted: new Set<string>(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>,
      flags: {},
      decisions: {},
      later: {},
      unsafe: 0,
      versions: new Set<string>(),
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    b.versions.add(`${r.story_version} · ${r.rubric_version}`);
    if ((JSON.parse(r.state) as { prediction?: unknown }).prediction) b.predicted += 1;
    if (r.status === "finished" && r.result) {
      b.finished += 1;
      if (!b.counted.has(r.user_id)) {
        b.counted.add(r.user_id);
        const res = JSON.parse(r.result) as { dims: Record<Dim, number>; flags: FlagId[]; decision: string; later: string; unsafe: boolean };
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const f of res.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
        b.decisions[res.decision] = (b.decisions[res.decision] ?? 0) + 1;
        b.later[res.later] = (b.later[res.later] ?? 0) + 1;
        if (res.unsafe) b.unsafe += 1;
      }
    }
    blocks.set(r.block_id, b);
  }
  return {
    blocks: [...blocks.entries()].map(([blockId, b]) => {
      const small = b.counted.size < SMALL_COHORT;
      return {
        blockId,
        attempts: b.attempts,
        people: b.people.size,
        predicted: b.predicted,
        finished: b.finished,
        counted: b.counted.size,
        suppressed: small,
        dims: small ? null : b.dims,
        flags: small ? null : b.flags,
        decisions: small ? null : b.decisions,
        later: small ? null : b.later,
        unsafe: small ? null : b.unsafe,
        versions: [...b.versions],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Review my service reliability": private Decision Sheets, scoped to the business
// ---------------------------------------------------------------------------------------------

type SheetRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = {
  sheet_id: string;
  number: number;
  inputs: string;
  sheet: string;
  model_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

export const RESULTS = {
  "": "Not answered yet",
  fewer: "Fewer missed visits",
  same: "About the same",
  more: "More missed visits",
  "not-tried": "We didn’t try it",
} as const;
export type FollowResult = keyof typeof RESULTS;

/** The Reliability Decision Sheet: what was reviewed, what's chosen, who owns it, how the person's outcome is checked, and when. */
export type DecisionSheet = {
  period: string;
  definitions: string;
  action: string;
  owner: string;
  reviewBy: string;
  /** The client-outcome measure: how the people affected will be asked whether service improved. */
  clientMeasure: string;
  expectedPrevented: Num;
  unknowns: string;
  notes: string;
  /** Back after the review date: what actually happened. An action isn't a success because it was created. */
  followUp: { result: FollowResult; participantsSay: string; note: string };
};

export function cleanSheet(v: unknown): DecisionSheet {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const f = (o.followUp && typeof o.followUp === "object" ? o.followUp : {}) as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  return {
    period: text(o.period, 120),
    definitions: text(o.definitions, 600),
    action: text(o.action, 400),
    owner: text(o.owner, 80),
    reviewBy: typeof o.reviewBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.reviewBy) ? o.reviewBy : "",
    clientMeasure: text(o.clientMeasure, 400),
    expectedPrevented:
      typeof o.expectedPrevented === "number" && Number.isFinite(o.expectedPrevented) && o.expectedPrevented >= 0 ? Math.min(o.expectedPrevented, 1000) : null,
    unknowns: text(o.unknowns, 600),
    notes: text(o.notes, 1000),
    followUp: {
      result: typeof f.result === "string" && f.result in RESULTS ? (f.result as FollowResult) : "",
      participantsSay: text(f.participantsSay, 400),
      note: text(f.note, 400),
    },
  };
}

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Review my service reliability is for the business owner and the people they’ve authorised.");
  ensureReliability(db);
  return a;
}

/** The sheet, only if it belongs to this person's own business. Otherwise it isn't there, whatever the id. */
function ownSheet(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM reliability_sheets WHERE id = ? AND org_id = ?").get(id, a.orgId) as SheetRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That Decision Sheet isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM reliability_sheet_versions WHERE sheet_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

/** Whether this person may review their business's reliability here, and its sheets. Nothing for anyone else. */
export function businessHome(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, sheets: [] };
  ensureReliability(db);
  const rows = db.prepare("SELECT * FROM reliability_sheets WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as SheetRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    sheets: rows.map((r) => {
      const v = versionsOf(db, r.id);
      const last = v.at(-1);
      return {
        id: r.id,
        name: r.name,
        versions: v.length,
        updatedAt: r.updated_at,
        updatedBy: last ? nameOf(db, last.saved_by) : "",
        snapshot: last ? JSON.parse(last.snapshot) : null,
      };
    }),
  };
}

export function getSheet(db: Db, user: User, id: unknown, version?: unknown) {
  const { row } = ownSheet(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That Decision Sheet isn’t here.");
  const before = versions.filter((v) => v.number < chosen.number).at(-1);
  return {
    id: row.id,
    name: row.name,
    version: chosen.number,
    versions: versions.map((v) => ({
      number: v.number,
      savedAt: v.saved_at,
      savedBy: nameOf(db, v.saved_by),
      note: v.note,
      modelVersion: v.model_version,
      snapshot: JSON.parse(v.snapshot),
    })),
    inputs: cleanInputs(JSON.parse(chosen.inputs)),
    sheet: cleanSheet(JSON.parse(chosen.sheet)),
    /** The version before: its chosen action and expected effect, shown beside the new figures. */
    previous: before
      ? { number: before.number, savedAt: before.saved_at, sheet: cleanSheet(JSON.parse(before.sheet)), snapshot: JSON.parse(before.snapshot) }
      : null,
    /** Saved under an earlier model: today's figures are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

/**
  Saves a Decision Sheet: a new one, or the next version of one. Nothing is overwritten; blanks are kept as blanks.
  Inputs are forced to aggregate counts: any individual visit rows sent are dropped, so no participant detail is kept.
*/
export function saveSheet(db: Db, user: User, input: { id?: unknown; name?: unknown; inputs?: unknown; sheet?: unknown; note?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const inputs: ReliabilityInputs = { ...cleanInputs(input.inputs), occurrences: [] };
  // Aggregate only: links to individual visits are dropped too.
  inputs.tasks = inputs.tasks.map((t) => ({ ...t, occurrence: "" }));
  inputs.costs = inputs.costs.map((c) => ({ ...c, occurrence: "" }));
  const sheet = cleanSheet(input.sheet);
  const errors = validateInputs(inputs);
  const snapshot = errors.length ? { incomplete: errors.length } : snapshotOf(calculate(inputs));
  const at = now.toISOString();
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  return tx(db, () => {
    let id: string;
    let number: number;
    if (input.id) {
      const { row } = ownSheet(db, user, input.id);
      id = row.id;
      number = (versionsOf(db, id).at(-1)?.number ?? 0) + 1;
      db.prepare("UPDATE reliability_sheets SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the Decision Sheet a name.");
      id = `rs-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO reliability_sheets (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare(
      "INSERT INTO reliability_sheet_versions (sheet_id, number, inputs, sheet, model_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, number, JSON.stringify(inputs), JSON.stringify(sheet), MODEL_VERSION, JSON.stringify(snapshot), note, user.id, at);
    return getSheet(db, user, id, number);
  });
}
