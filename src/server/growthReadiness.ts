import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type IntakeBlock } from "@/lib/magazine";
import { calculate, cleanInputs, MODEL_VERSION, snapshotOf, validateInputs, type IntakeInputs } from "@/lib/growthReadiness";
import {
  buildDebrief,
  cleanState,
  DIM_ORDER,
  emptyState,
  finishProblems,
  LAB_VERSION,
  RUBRIC_VERSION,
  type Dim,
  type FlagId,
  type IntakeState,
} from "@/lib/growthLab";
import { ensureGrowth, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";

/*
  Growth readiness ("Can we take on the next 10 clients?", docs/growth-readiness.md), on the server:

  1. A learner's attempt at the fictional case, kept here and read against the same model and rubric the page shows.
     The order is enforced here: the debrief (which checks matter, the feedback, the story's outcome) is only sent once
     the prediction is in, a week and a service gap have been opened, a change tried, and an action and a message
     chosen. Events carry fictional choices, rubric levels and flags only, never typed words.

  2. "Use my business": a partner business's private scenarios, scoped to the business on the server. Only the owner
     and the members they've authorised (the same access as Plan my business) can list, read or save them; anyone else,
     Trilogy staff included, gets nothing, whatever id they ask for. A save is a new numbered version. Inputs are
     aggregate figures and anonymous start labels; nothing here asks for a participant's name, diagnosis or address.
     None of it goes into the authors' totals.

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

export const caseHash = (b: IntakeBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureGrowth(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "intake") throw new HttpError(404, "That growth readiness block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM intake_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM intake_attempts WHERE id = ?").get(id) as AttemptRow;

/** One event in the Hub's activity log. Fictional choices, levels and flags only. */
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

function view(a: AttemptRow | undefined, block: IntakeBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The rubric, the feedback and the story's outcome: only once the decision is in. */
    debrief: a?.status === "finished" ? buildDebrief(block, state, a.model_version) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION },
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
  };
}
export type IntakeView = ReturnType<typeof view>;

export function intakeState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: IntakeBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `ia-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO intake_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, state, status, started_at, updated_at)
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
  log(db, row, "intake_started", { attemptNo }, now);
  return row;
}

const active = (db: Db, user: User, guideId: string, revisionId: string, block: IntakeBlock, now: Date) =>
  latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
const stored = (a: AttemptRow, block: IntakeBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, s: IntakeState, now: Date) =>
  db.prepare("UPDATE intake_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/**
  Saves progress: the step, weeks and service checks opened, changes tried, the learner's own edits to the fictional
  figures, and the action and message being drafted. The prediction is settled once made; the step moves forward one
  at a time and never past "Decide" (the debrief comes from finishing).
*/
export function saveIntake(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const prev = stored(a, block);
    const next = cleanState(block, input.state);
    // The map and what follows open only once the prediction is in.
    const ceiling = prev.prediction ? 5 : 1;
    const merged: IntakeState = {
      ...prev,
      stage: Math.min(ceiling, Math.max(prev.stage, Math.min(next.stage, prev.stage + 1)), 5),
      weeks: [...new Set([...prev.weeks, ...next.weeks])],
      services: [...new Set([...prev.services, ...next.services])],
      applied: next.applied,
      edited: prev.edited || next.edited,
      inputs: next.inputs,
      decision: next.decision,
      message: next.message,
    };
    store(db, a, merged, now);
    for (const w of merged.weeks.filter((x) => !prev.weeks.includes(x))) log(db, a, "week_inspected", { week: w + 1 }, now);
    for (const k of merged.services.filter((x) => !prev.services.includes(x)))
      log(db, a, "service_inspected", { check: k.split("#")[0].split("|")[0], week: Number(k.split("#")[1]) + 1 }, now);
    for (const c of merged.applied.filter((x) => !prev.applied.includes(x))) log(db, a, "change_tried", { change: c }, now);
    if (merged.edited && !prev.edited) log(db, a, "change_tried", { change: "own-edit" }, now);
    return view(reread(db, a.id), block);
  });
}

/** The prediction, before the numbers. Settled once made: the debrief compares it with what the model shows. */
export function submitPrediction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.prediction || a.status === "finished") return view(a, block);
    const p = cleanState(block, { prediction: input.prediction }).prediction;
    if (!p || p.count === null) throw new HttpError(400, "Say how many starts you think could be confirmed today.");
    store(db, a, { ...prev, prediction: p, stage: Math.max(prev.stage, 2) }, now);
    log(db, a, "prediction_submitted", { count: p.count, checks: p.checks }, now);
    return view(reread(db, a.id), block);
  });
}

/** The action and the message: the attempt finishes and the debrief is sent. */
export function finishIntake(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return { id: a.id };
    const prev = stored(a, block);
    const s: IntakeState = {
      ...prev,
      decision: typeof input.decision === "string" ? input.decision : prev.decision,
      message: typeof input.message === "string" ? input.message : prev.message,
    };
    const cleaned = cleanState(block, s);
    const problems = finishProblems(block, cleaned);
    if (problems.length) return { problems };
    const done: IntakeState = { ...cleaned, stage: 6 };
    const d = buildDebrief(block, done, MODEL_VERSION);
    const at = now.toISOString();
    const result = {
      versions: d.versions,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      decision: done.decision,
      message: done.message,
      prediction: done.prediction?.count ?? null,
    };
    db.prepare("UPDATE intake_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(db, a, "decision_submitted", { decision: done.decision, message: done.message }, now);
    log(db, a, "intake_completed", { score: d.score, dims: result.dims, flags: result.flags }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Try another route: a fresh attempt, from the story. Every attempt is kept. */
export function retryIntake(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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

/** The learning Decision Sheet was printed or saved. */
export function sheetPrinted(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (a) log(db, a, "sheet_printed", {}, now);
  return { ok: true };
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels and
  flags, with the denominator and versions. Each person's first finished attempt counts. Never private scenarios.
*/
export function intakeStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureGrowth(db);
  const rows = db
    .prepare("SELECT block_id, user_id, status, state, result, story_version, rubric_version FROM intake_attempts WHERE guide_id = ? ORDER BY attempt_no")
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "status" | "state" | "result" | "story_version" | "rubric_version">[];
  const blocks = new Map<
    string,
    {
      attempts: number;
      people: Set<string>;
      predicted: number;
      finished: number;
      counted: Set<string>;
      dims: Record<Dim, number[]>;
      flags: Record<string, number>;
      versions: Set<string>;
    }
  >();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      attempts: 0,
      people: new Set<string>(),
      predicted: 0,
      finished: 0,
      counted: new Set<string>(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>,
      flags: {},
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
        const res = JSON.parse(r.result) as { dims: Record<Dim, number>; flags: FlagId[] };
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const f of res.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
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
        versions: [...b.versions],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Use my business": private scenarios, scoped to the business
// ---------------------------------------------------------------------------------------------

type ScenarioRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = {
  scenario_id: string;
  number: number;
  inputs: string;
  sheet: string;
  model_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

export type SheetAction = { action: string; owner: string; due: string; status: "open" | "done" };
export type Sheet = { actions: SheetAction[]; reviewBy: string; notes: string };

export function cleanSheet(v: unknown): Sheet {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const date = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");
  return {
    actions: (Array.isArray(o.actions) ? o.actions : []).slice(0, 12).map((x) => {
      const a = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        action: typeof a.action === "string" ? a.action.slice(0, 300) : "",
        owner: typeof a.owner === "string" ? a.owner.slice(0, 80) : "",
        due: date(a.due),
        status: a.status === "done" ? "done" : "open",
      };
    }),
    reviewBy: date(o.reviewBy),
    notes: typeof o.notes === "string" ? o.notes.slice(0, 1000) : "",
  };
}

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Use my business is for the business owner and the people they’ve authorised.");
  ensureGrowth(db);
  return a;
}

/** The scenario, only if it belongs to this person's own business. Otherwise it isn't there, whatever the id. */
function ownScenario(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM growth_scenarios WHERE id = ? AND org_id = ?").get(id, a.orgId) as ScenarioRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That scenario isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM growth_scenario_versions WHERE scenario_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

/** Whether this person may plan their business here, and their business's scenarios. Nothing for anyone else. */
export function businessHome(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, scenarios: [] };
  ensureGrowth(db);
  const rows = db.prepare("SELECT * FROM growth_scenarios WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as ScenarioRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    scenarios: rows.map((r) => {
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

export function getScenario(db: Db, user: User, id: unknown, version?: unknown) {
  const { row } = ownScenario(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That scenario isn’t here.");
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
    /** Saved under an earlier model: today's figures are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

/** Saves a scenario: a new one, or the next version of one. Nothing is overwritten. Blanks are kept as blanks. */
export function saveScenario(db: Db, user: User, input: { id?: unknown; name?: unknown; inputs?: unknown; sheet?: unknown; note?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const inputs: IntakeInputs = cleanInputs(input.inputs);
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
      const { row } = ownScenario(db, user, input.id);
      id = row.id;
      number = (versionsOf(db, id).at(-1)?.number ?? 0) + 1;
      db.prepare("UPDATE growth_scenarios SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the scenario a name.");
      id = `gs-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO growth_scenarios (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare(
      "INSERT INTO growth_scenario_versions (scenario_id, number, inputs, sheet, model_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, number, JSON.stringify(inputs), JSON.stringify(sheet), MODEL_VERSION, JSON.stringify(snapshot), note, user.id, at);
    return getScenario(db, user, id, number);
  });
}
