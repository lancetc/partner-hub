import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type CashBridgeBlock } from "@/lib/magazine";
import {
  BASELINE,
  brisbaneDate,
  calculate,
  cleanInputs,
  MODEL_VERSION,
  snapshotOf,
  standardCases,
  validateInputs,
  workbookSheets,
  type CashInputs,
  type Scenario,
} from "@/lib/cashBridge";
import {
  buildDebrief,
  cleanState,
  currentScenario,
  DIM_ORDER,
  emptyState,
  finishProblems,
  LAB_VERSION,
  LAST,
  RUBRIC_VERSION,
  type CashBridgeLabData,
  type CashState,
  type Dim,
  type FlagId,
} from "@/lib/cashBridgeLab";
import { ensureCashBridge, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";
import { workbook } from "./xlsx";

/*
  The 90-Day Cash Bridge ("Can we fund the next 90 days?", docs/cash-bridge.md), on the server:

  1. A learner's attempt at Maya's fictional 90 days, kept here and read against the same model and rubric the page
     shows. The order is enforced here: the evidence opens only after the first guess, the choices only after the low
     point is read, and the debrief (the reviewed stages, the feedback, the story's outcome) is only sent once every step
     is done. Events carry fictional choices, matches, rubric levels and flags only: never typed words or figures.

  2. "Plan my next 90 days": a partner business's private 90-Day Cash Plans, scoped to the business on the server. Only
     the owner and the members they've authorised (the same access as Plan my business) can list, read, save or export
     them; anyone else, Trilogy staff and authors included, gets nothing, whatever id they ask for. A save is a new
     numbered version. Client and coordinator labels are replaced with generic ones, so no name is kept. Every read,
     save and export is recorded in an audit table, without figures. None of it reaches the authors' totals.

  No AI is called anywhere in it, and no private input leaves the Hub.
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

export const caseHash = (b: CashBridgeBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureCashBridge(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "cashbridge") throw new HttpError(404, "That 90-Day Cash Bridge block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM cashbridge_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM cashbridge_attempts WHERE id = ?").get(id) as AttemptRow;

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

function view(a: AttemptRow | undefined, block: CashBridgeBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The rubric, the reviewed stages, the feedback and the story's outcome: only once the attempt is finished. */
    debrief: a?.status === "finished" ? buildDebrief(block, state, a.model_version) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION, definitions: block.definitionsVersion },
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
  };
}
export type CashBridgeView = ReturnType<typeof view>;

export function cashBridgeState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: CashBridgeBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `cb-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO cashbridge_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, state, status, started_at, updated_at)
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
  log(db, row, "cashbridge_started", { attemptNo }, now);
  return row;
}

const active = (db: Db, user: User, guideId: string, revisionId: string, block: CashBridgeBlock, now: Date) =>
  latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
const stored = (a: AttemptRow, block: CashBridgeBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, s: CashState, now: Date) =>
  db.prepare("UPDATE cashbridge_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/** How far the attempt may go: the evidence after the first guess, the choices after the low point is read. */
const ceilingFor = (s: CashState) => (!s.prediction ? 0 : !s.low ? 3 : LAST - 1);

/**
  Saves progress: the step, the evidence placed, the moved-start answer, what's been opened, the options switched on,
  the Day 30 actuals (once applied, kept), and the choices being drafted. The first guess and the low-point reading are
  settled once made; the step moves forward one at a time, never past the Day 30 check-in.
*/
export function saveCashBridge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const prev = stored(a, block);
    const next = cleanState(block, input.state);
    const merged: CashState = {
      ...prev,
      stage: Math.min(ceilingFor(prev), Math.max(prev.stage, Math.min(next.stage, prev.stage + 1))),
      cards: { ...prev.cards, ...next.cards },
      slip: next.slip || prev.slip,
      inspected: [...new Set([...prev.inspected, ...next.inspected])],
      tried: next.tried,
      tested: [...new Set([...prev.tested, ...next.tested, ...next.tried])],
      // A choice can be changed until the attempt finishes, but a save that doesn't carry one never clears it.
      explanation: next.explanation || prev.explanation,
      decision: next.decision || prev.decision,
      actuals: prev.actuals || next.actuals,
      review: next.review || prev.review,
    };
    store(db, a, merged, now);
    for (const c of block.cards) {
      const m = merged.cards[c.id];
      const p = prev.cards[c.id];
      if (m?.stage && m.cash !== null && (p?.stage !== m.stage || p?.cash !== m.cash))
        log(
          db,
          a,
          "card_placed",
          { card: c.id, stage: m.stage, matched: m.stage === c.answer.stage, cashMatched: m.cash === c.answer.cash, revised: Boolean(p?.stage) },
          now,
        );
    }
    if (merged.slip && merged.slip !== prev.slip)
      log(db, a, "start_answered", { answer: merged.slip, flagged: (block.slip.options.find((o) => o.id === merged.slip)?.flags.length ?? 0) > 0 }, now);
    for (const x of merged.inspected.filter((y) => !prev.inspected.includes(y)))
      log(
        db,
        a,
        x.startsWith("week:") ? "week_opened" : x.startsWith("date:") ? "date_opened" : x.startsWith("example:") ? "example_tried" : "view_opened",
        { what: x },
        now,
      );
    for (const o of merged.tried.filter((x) => !prev.tried.includes(x)))
      log(db, a, block.options.find((x) => x.id === o)?.kind === "sensitivity" ? "sensitivity_tested" : "option_tried", { option: o }, now);
    if (merged.actuals && !prev.actuals) log(db, a, "actuals_applied", {}, now);
    if (merged.review && merged.review !== prev.review)
      log(db, a, "review_answered", { answer: merged.review, flagged: (block.review.options.find((o) => o.id === merged.review)?.flags.length ?? 0) > 0 }, now);
    return view(reread(db, a.id), block);
  });
}

/** The first guess. Settled once made: the debrief compares it with the ledger. Only the choices are logged. */
export function submitPrediction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.prediction || a.status === "finished") return view(a, block);
    const s = cleanState(block, { prediction: input.prediction });
    if (!s.prediction || !s.prediction.cover || !s.prediction.hardest) throw new HttpError(400, "Answer both questions in your first guess.");
    store(db, a, { ...prev, prediction: s.prediction, stage: Math.max(prev.stage, 1) }, now);
    log(db, a, "prediction_submitted", { cover: s.prediction.cover, hardest: s.prediction.hardest }, now);
    return view(reread(db, a.id), block);
  });
}

/** The learner's reading of the low point. Settled once made. Logged as matches only, never the amount they typed. */
export function submitLow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.low || a.status === "finished") return view(a, block);
    if (!prev.prediction) throw new HttpError(400, "Make your first guess first.");
    const s = cleanState(block, { low: input.low });
    if (!s.low || !s.low.option) throw new HttpError(400, "Choose the date you think cash is lowest.");
    const base = calculate(block.inputs);
    const chosen = block.lowPoint.options.find((o) => o.id === s.low!.option);
    const req = s.low.required === null ? null : Math.round(s.low.required * 100);
    store(db, a, { ...prev, low: s.low, stage: Math.max(prev.stage, 4) }, now);
    log(
      db,
      a,
      "low_answered",
      {
        option: s.low.option,
        matched: chosen?.date === base.low.date,
        requiredGiven: req !== null,
        requiredClose: req !== null && Math.abs(req - base.required) <= base.required * 0.1,
      },
      now,
    );
    return view(reread(db, a.id), block);
  });
}

/** The decision, explanation and Day 30 answer: the attempt finishes and the debrief is sent. */
export function finishCashBridge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return { id: a.id };
    const prev = stored(a, block);
    const take = (k: "decision" | "explanation" | "review") => (typeof input[k] === "string" ? input[k] : prev[k]);
    const cleaned = cleanState(block, { ...prev, decision: take("decision"), explanation: take("explanation"), review: take("review") });
    const problems = finishProblems(block, cleaned);
    if (problems.length) return { problems };
    const done: CashState = { ...cleaned, stage: LAST };
    const d = buildDebrief(block, done, MODEL_VERSION);
    const at = now.toISOString();
    const result = {
      versions: d.versions,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      unsafe: d.unsafe,
      decision: done.decision,
      explanation: done.explanation,
      review: done.review,
      lowMatched: d.low.matched,
      cardsMatched: d.cards.filter((c) => c.matched).length,
      tested: done.tested,
    };
    db.prepare("UPDATE cashbridge_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(db, a, "decision_submitted", { decision: done.decision, explanation: done.explanation, tested: done.tested }, now);
    log(db, a, "cashbridge_completed", { score: d.score, dims: result.dims, flags: result.flags, unsafe: d.unsafe, lowMatched: d.low.matched }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Look again: a fresh attempt from the start. Every attempt is kept, first and revised. */
export function retryCashBridge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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

/** The learning Decision Sheet was printed, or a private plan saved from the article (its version number only). */
export function sheetEvent(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (!a) return { ok: true };
  if (input.action === "printed") log(db, a, "sheet_printed", {}, now);
  if (input.action === "saved" && typeof input.version === "number" && Number.isInteger(input.version))
    log(
      db,
      a,
      input.version > 1 ? "plan_updated" : "plan_saved",
      { version: input.version, scenario: SCENARIO_TYPES.includes(input.scenario as never) ? input.scenario : "" },
      now,
    );
  return { ok: true };
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels, flags
  and the choices made. Each person's first finished attempt counts. Never private plans, and never anyone's figures.
*/
export function cashBridgeStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureCashBridge(db);
  const rows = db
    .prepare("SELECT block_id, user_id, status, state, result, story_version, rubric_version FROM cashbridge_attempts WHERE guide_id = ? ORDER BY attempt_no")
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
    lowMatched: number;
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
      lowMatched: 0,
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
        const res = JSON.parse(r.result) as { dims: Record<Dim, number>; flags: FlagId[]; decision: string; unsafe: boolean; lowMatched: boolean };
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const f of res.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
        b.decisions[res.decision] = (b.decisions[res.decision] ?? 0) + 1;
        if (res.lowMatched) b.lowMatched += 1;
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
        lowMatched: small ? null : b.lowMatched,
        unsafe: small ? null : b.unsafe,
        versions: [...b.versions],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Plan my next 90 days": private 90-Day Cash Plans, scoped to the business
// ---------------------------------------------------------------------------------------------

type PlanRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = {
  plan_id: string;
  number: number;
  inputs: string;
  sheet: string;
  model_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

/** The broad kind of scenario chosen: the only part of a private plan that's ever counted outside it. */
export const SCENARIO_TYPES = ["", "baseline", "delay", "slip", "hire", "stage", "cover", "credit", "buffer"] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

/** The 90-Day Funding Decision Sheet: the chosen option, who owns it, what's unresolved, the service constraint, and when to check. */
export type FundingSheet = {
  option: string;
  scenarioType: ScenarioType;
  owner: string;
  followUp: string;
  unresolved: string;
  serviceConstraint: string;
  notes: string;
};

export function cleanFundingSheet(v: unknown): FundingSheet {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  return {
    option: text(o.option, 400),
    scenarioType: SCENARIO_TYPES.includes(o.scenarioType as ScenarioType) ? (o.scenarioType as ScenarioType) : "",
    owner: text(o.owner, 80),
    followUp: typeof o.followUp === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.followUp) ? o.followUp : "",
    unresolved: text(o.unresolved, 600),
    serviceConstraint: text(o.serviceConstraint, 400),
    notes: text(o.notes, 1000),
  };
}

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Plan my next 90 days is for the business owner and the people they’ve authorised.");
  ensureCashBridge(db);
  return a;
}

function audit(db: Db, user: User, plan: { id: string; org_id: string }, action: "read" | "save" | "export", version: number | null, now: Date) {
  db.prepare("INSERT INTO cashbridge_plan_audit (plan_id, org_id, user_id, action, version, at) VALUES (?, ?, ?, ?, ?, ?)").run(
    plan.id,
    plan.org_id,
    user.id,
    action,
    version,
    now.toISOString(),
  );
}

/** The plan, only if it belongs to this person's own business. Otherwise it isn't there, whatever the id. */
function ownPlan(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM cashbridge_plans WHERE id = ? AND org_id = ?").get(id, a.orgId) as PlanRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That 90-Day Cash Plan isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM cashbridge_plan_versions WHERE plan_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

/** Whether this person may plan their business's next 90 days here, and its plans. Nothing for anyone else. */
export function businessHome(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, plans: [] };
  ensureCashBridge(db);
  const rows = db.prepare("SELECT * FROM cashbridge_plans WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as PlanRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    plans: rows.map((r) => {
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

export function getPlan(db: Db, user: User, id: unknown, version: unknown, now: Date) {
  const { row } = ownPlan(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That 90-Day Cash Plan isn’t here.");
  const before = versions.filter((v) => v.number < chosen.number).at(-1);
  audit(db, user, row, "read", chosen.number, now);
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
    sheet: cleanFundingSheet(JSON.parse(chosen.sheet)),
    /** The version before, for "What changed since last time?". */
    previous: before
      ? {
          number: before.number,
          savedAt: before.saved_at,
          inputs: cleanInputs(JSON.parse(before.inputs)),
          sheet: cleanFundingSheet(JSON.parse(before.sheet)),
          snapshot: JSON.parse(before.snapshot),
        }
      : null,
    /** Saved under an earlier model: today's figures are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

/** Private inputs as they're kept: generic labels (no names), no capacity model (that's the Work Tool's). */
export function privateInputs(v: unknown): CashInputs {
  const i = cleanInputs(v);
  return {
    ...i,
    clients: i.clients.map((c, k) => ({ ...c, label: `Start ${k + 1}` })),
    hires: i.hires.map((h, k) => ({ ...h, label: h.existing ? `Current coordinator ${k + 1}` : `New coordinator ${k + 1}` })),
    events: i.events.map((e) => ({ ...e, source: e.source === "fictional" ? "estimate" : e.source })),
    capacity: null,
  };
}

/**
  Saves a 90-Day Cash Plan: a new one, or the next version of one. Nothing is overwritten; blanks are kept as blanks.
  Forecasts are replaced with actuals only by the owner's own deliberate save.
*/
export function savePlan(db: Db, user: User, input: { id?: unknown; name?: unknown; inputs?: unknown; sheet?: unknown; note?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const inputs = privateInputs(input.inputs);
  const sheet = cleanFundingSheet(input.sheet);
  const errors = validateInputs(inputs);
  const snapshot = errors.length ? { incomplete: errors.length } : snapshotOf(calculate(inputs));
  const at = now.toISOString();
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  return tx(db, () => {
    let row: PlanRow;
    let number: number;
    if (input.id) {
      row = ownPlan(db, user, input.id).row;
      number = (versionsOf(db, row.id).at(-1)?.number ?? 0) + 1;
      db.prepare("UPDATE cashbridge_plans SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, row.id);
    } else {
      if (!name) throw new HttpError(400, "Give the 90-Day Cash Plan a name.");
      const id = `cp-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO cashbridge_plans (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
      row = db.prepare("SELECT * FROM cashbridge_plans WHERE id = ?").get(id) as PlanRow;
    }
    db.prepare(
      "INSERT INTO cashbridge_plan_versions (plan_id, number, inputs, sheet, model_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(row.id, number, JSON.stringify(inputs), JSON.stringify(sheet), MODEL_VERSION, JSON.stringify(snapshot), note, user.id, at);
    audit(db, user, row, "save", number, now);
    return getPlan(db, user, row.id, number, now);
  });
}

// ---------------------------------------------------------------------------------------------
// The workbook
// ---------------------------------------------------------------------------------------------

/** The cases every workbook compares: the baseline and each of the block's sensitivity cases, or just the baseline for a private plan. */
const comparisonCases = (block: CashBridgeLabData | null) => [
  { id: "baseline", label: "Baseline: receipts on time", changed: [], scenario: BASELINE },
  ...(block?.options ?? []).map((o) => ({ id: o.id, label: o.label, changed: [o.describe], scenario: o.patch })),
];
const privateCases = standardCases;

/**
  The workbook for a saved plan version, the plan on screen (unsaved), or the article's fictional case under the
  learner's current scenario. A business plan needs access to that business, and its export is recorded.
*/
export function exportWorkbook(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  let inputs: CashInputs;
  let name: string;
  let version: number | null = null;
  let scenario: Scenario = BASELINE;
  let scenarioLabel = "Baseline";
  let cases;
  let kind: "fictional" | "private" = "private";
  if (input.guideId) {
    // The fictional case, recalculated here from the reader's copy of the block.
    const { edition, block } = load(db, user, String(input.guideId), input.blockId);
    const s = cleanState(block, { tried: input.tried, actuals: input.actuals === true });
    scenario = currentScenario(block, s);
    scenarioLabel = [...s.tried.map((x) => block.options.find((o) => o.id === x)!.label), ...(s.actuals ? ["Day 30 actuals"] : [])].join("; ") || "Baseline";
    inputs = block.inputs;
    name = block.title;
    cases = comparisonCases(block);
    kind = "fictional";
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a) log(db, a, "workbook_exported", { tried: s.tried, actuals: s.actuals }, now);
  } else if (input.id) {
    const p = getPlan(db, user, input.id, input.version, now);
    inputs = p.inputs;
    name = p.name;
    version = p.version;
    cases = privateCases(inputs);
    const row = db.prepare("SELECT * FROM cashbridge_plans WHERE id = ?").get(p.id) as PlanRow;
    audit(db, user, row, "export", version, now);
  } else {
    requireBusiness(db, user);
    inputs = privateInputs(input.inputs);
    name = "Unsaved 90-Day Cash Plan";
    cases = privateCases(inputs);
  }
  if (validateInputs(inputs).length) throw new HttpError(400, "Fill in the blank figures before downloading the workbook.");
  const sheets = workbookSheets(inputs, scenario, cases, { kind, name, generatedAt: now.toISOString(), version, scenarioLabel }).map((s) => ({
    ...s,
    numbers: true,
  }));
  const stem = kind === "fictional" ? "fictional-90-day-cash-bridge" : name.replace(/[^\w-]+/g, "-").toLowerCase() || "cash-plan";
  return { bytes: workbook(sheets), file: `${stem}-${brisbaneDate(now)}.xlsx`, sheets };
}
