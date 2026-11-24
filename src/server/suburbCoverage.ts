import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type CoverageBlock } from "@/lib/magazine";
import { calculate, cleanInputs, MODEL_VERSION, snapshotOf, validateInputs, type CoverageInputs } from "@/lib/suburbCoverage";
import {
  buildDebrief,
  cardAnswer,
  cleanState,
  DIM_ORDER,
  emptyState,
  finishProblems,
  LAB_VERSION,
  LAST,
  RUBRIC_VERSION,
  type CoverageState,
  type Dim,
  type FlagId,
} from "@/lib/coverageLab";
import { ensureCoverage, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";

/*
  Local Coverage Comparison ("Is this suburb ready for growth?", docs/suburb-growth.md), on the server:

  1. A learner's attempt at the fictional case, kept here and read against the same model and rubric the page shows.
     The order is enforced here: the area detail opens only after the prediction, and the debrief (the cards' readings
     and feedback, the options' feedback and outcomes) is only sent once an area and a coverage row are opened, every
     card is tagged, the absence is looked at, both decisions and the evidence are chosen, and the follow-up is
     answered. Events carry fictional choices, whether a tag matched, rubric levels and flags only: never typed words,
     hours or area figures.

  2. "Plan my local area": a partner business's private plans, scoped to the business on the server. Only the owner
     and the members they've authorised (the same access as Plan my business) can list, read or save them; anyone
     else, Trilogy staff and authors included, gets nothing, whatever id they ask for. A save is a new numbered
     version. Rows are aggregate and anonymous; nothing here asks for a participant's or contractor's name, address,
     diagnosis or contact details. None of it reaches the authors' totals. The Contractor Network Builder handoff is
     a placeholder: that Work Tool isn't in the Hub yet.

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

export const caseHash = (b: CoverageBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureCoverage(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "coverage") throw new HttpError(404, "That Local Coverage block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM coverage_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM coverage_attempts WHERE id = ?").get(id) as AttemptRow;

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

function view(a: AttemptRow | undefined, block: CoverageBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The rubric, the cards' readings, the feedback and the story's outcomes: only once the decisions are in. */
    debrief: a?.status === "finished" ? buildDebrief(block, state, a.model_version) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION, taxonomy: block.taxonomyVersion },
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
  };
}
export type CoverageView = ReturnType<typeof view>;

export function coverageState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: CoverageBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `ca-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO coverage_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, state, status, started_at, updated_at)
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
  log(db, row, "coverage_started", { attemptNo }, now);
  return row;
}

const active = (db: Db, user: User, guideId: string, revisionId: string, block: CoverageBlock, now: Date) =>
  latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
const stored = (a: AttemptRow, block: CoverageBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, s: CoverageState, now: Date) =>
  db.prepare("UPDATE coverage_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/** Whether a card's tag matches the model's reading of it: logged as a yes/no, for the misconceptions authors see. */
function tagMatches(block: CoverageBlock, cardId: string, use: string) {
  if (validateInputs(block.inputs).length) return null;
  const card = block.cards.find((c) => c.id === cardId);
  const a = card ? cardAnswer(calculate(block.inputs), card) : null;
  return a ? a.use === use : null;
}

/**
  Saves progress: the step, areas and rows opened, filters used, card tags, the absence, and the choices being
  drafted. The prediction is settled once made; the step moves forward one at a time and never past the follow-up
  (the debrief comes from finishing).
*/
export function saveCoverage(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const prev = stored(a, block);
    const next = cleanState(block, input.state);
    // The area detail and what follows open only once the prediction is in.
    const ceiling = prev.prediction ? LAST - 1 : 1;
    const merged: CoverageState = {
      ...prev,
      stage: Math.min(ceiling, Math.max(prev.stage, Math.min(next.stage, prev.stage + 1))),
      opened: [...new Set([...prev.opened, ...next.opened])],
      filters: [...new Set([...prev.filters, ...next.filters])],
      tags: { ...prev.tags, ...next.tags },
      absence: prev.absence || next.absence,
      immediate: next.immediate,
      network: next.network,
      explanation: next.explanation,
      followUp: next.followUp,
      revised: next.revised,
    };
    store(db, a, merged, now);
    for (const x of merged.opened.filter((y) => !prev.opened.includes(y)))
      log(db, a, x.startsWith("area:") ? "area_opened" : "row_opened", { [x.startsWith("area:") ? "area" : "row"]: x.slice(x.indexOf(":") + 1) }, now);
    for (const f of merged.filters.filter((y) => !prev.filters.includes(y))) log(db, a, "filter_used", { filter: f }, now);
    for (const [k, t] of Object.entries(merged.tags))
      if (t && prev.tags[k] !== t) log(db, a, "card_tagged", { card: k, use: t, matches: tagMatches(block, k, t), revised: Boolean(prev.tags[k]) }, now);
    if (merged.absence && !prev.absence) log(db, a, "absence_viewed", {}, now);
    return view(reread(db, a.id), block);
  });
}

/** The prediction, before the detail. Settled once made: the debrief compares it with what the comparison shows. */
export function submitPrediction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.prediction || a.status === "finished") return view(a, block);
    const p = cleanState(block, { prediction: input.prediction }).prediction;
    if (!p || !p.area) throw new HttpError(400, "Choose which area you think is ready for more starts.");
    store(db, a, { ...prev, prediction: p, stage: Math.max(prev.stage, 2) }, now);
    log(db, a, "prediction_submitted", { area: p.area }, now);
    return view(reread(db, a.id), block);
  });
}

/** The decisions, the evidence and the follow-up: the attempt finishes and the debrief is sent. */
export function finishCoverage(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return { id: a.id };
    const prev = stored(a, block);
    const pick = (k: "immediate" | "network" | "explanation" | "followUp" | "revised") => (typeof input[k] === "string" ? input[k] : prev[k]);
    const cleaned = cleanState(block, {
      ...prev,
      immediate: pick("immediate"),
      network: pick("network"),
      explanation: pick("explanation"),
      followUp: pick("followUp"),
      revised: pick("revised"),
    });
    const problems = finishProblems(block, cleaned);
    if (problems.length) return { problems };
    const done: CoverageState = { ...cleaned, revised: cleaned.revised || cleaned.network, stage: LAST };
    const d = buildDebrief(block, done, MODEL_VERSION);
    const at = now.toISOString();
    const result = {
      versions: d.versions,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      immediate: done.immediate,
      network: done.network,
      revised: done.revised,
      explanation: done.explanation,
      followUp: done.followUp,
      prediction: done.prediction?.area ?? "",
      misread: d.cards.filter((c) => !c.matches).map((c) => c.id),
    };
    db.prepare("UPDATE coverage_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(db, a, "decision_submitted", { immediate: done.immediate, network: done.network, explanation: done.explanation }, now);
    log(db, a, "followup_answered", { answer: done.followUp, revised: done.revised, changed: done.revised !== done.network }, now);
    log(db, a, "coverage_completed", { score: d.score, dims: result.dims, flags: result.flags, misread: result.misread.length }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Look again: a fresh attempt, from the start. Every attempt is kept, first and revised. */
export function retryCoverage(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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

/** The learning Local Coverage Brief was printed or saved. */
export function briefPrinted(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (a) log(db, a, "brief_printed", {}, now);
  return { ok: true };
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels, flags,
  the choices made and which cards were misread (repeated confusion about candidate versus verified capacity, say),
  with the denominator and versions. Each person's first finished attempt counts. Never private plans, and never any
  area-level figures.
*/
export function coverageStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureCoverage(db);
  const rows = db
    .prepare("SELECT block_id, user_id, status, state, result, story_version, rubric_version FROM coverage_attempts WHERE guide_id = ? ORDER BY attempt_no")
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "status" | "state" | "result" | "story_version" | "rubric_version">[];
  type Totals = {
    attempts: number;
    people: Set<string>;
    predicted: number;
    finished: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    flags: Record<string, number>;
    immediate: Record<string, number>;
    network: Record<string, number>;
    revised: number;
    misread: Record<string, number>;
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
      immediate: {},
      network: {},
      revised: 0,
      misread: {},
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
        const res = JSON.parse(r.result) as {
          dims: Record<Dim, number>;
          flags: FlagId[];
          immediate: string;
          network: string;
          revised: string;
          misread: string[];
        };
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const f of res.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
        b.immediate[res.immediate] = (b.immediate[res.immediate] ?? 0) + 1;
        b.network[res.network] = (b.network[res.network] ?? 0) + 1;
        if (res.revised && res.revised !== res.network) b.revised += 1;
        for (const c of res.misread ?? []) b.misread[c] = (b.misread[c] ?? 0) + 1;
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
        immediate: small ? null : b.immediate,
        network: small ? null : b.network,
        revised: small ? null : b.revised,
        misread: small ? null : b.misread,
        versions: [...b.versions],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Plan my local area": private plans, scoped to the business
// ---------------------------------------------------------------------------------------------

type PlanRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = {
  plan_id: string;
  number: number;
  inputs: string;
  brief: string;
  model_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

/** The Local Coverage Brief: the period, assumptions, the owner's network order with reasons, an owner and a review date. */
export type CoverageBrief = {
  period: string;
  assumptions: string;
  /** The owner's own order for the network priorities, each move with its recorded reason. */
  order: { cell: string; reason: string }[];
  /** The participant-choice issue, as an anonymous status and route only. */
  choice: string;
  owner: string;
  reviewBy: string;
  notes: string;
};

export function cleanBrief(v: unknown): CoverageBrief {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  return {
    period: text(o.period, 120),
    assumptions: text(o.assumptions, 800),
    order: (Array.isArray(o.order) ? o.order : [])
      .slice(0, 40)
      .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
      .filter((x) => typeof x.cell === "string")
      .map((x) => ({ cell: text(x.cell, 40), reason: text(x.reason, 300) })),
    choice: text(o.choice, 300),
    owner: text(o.owner, 80),
    reviewBy: typeof o.reviewBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.reviewBy) ? o.reviewBy : "",
    notes: text(o.notes, 1000),
  };
}

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Plan my local area is for the business owner and the people they’ve authorised.");
  ensureCoverage(db);
  return a;
}

/** The plan, only if it belongs to this person's own business. Otherwise it isn't there, whatever the id. */
function ownPlan(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM coverage_plans WHERE id = ? AND org_id = ?").get(id, a.orgId) as PlanRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That plan isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM coverage_plan_versions WHERE plan_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

/** Whether this person may plan their local area here, and their business's plans. Nothing for anyone else. */
export function businessHome(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, plans: [] };
  ensureCoverage(db);
  const rows = db.prepare("SELECT * FROM coverage_plans WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as PlanRow[];
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

export function getPlan(db: Db, user: User, id: unknown, version?: unknown) {
  const { row } = ownPlan(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That plan isn’t here.");
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
    brief: cleanBrief(JSON.parse(chosen.brief)),
    /** The version before, so the page can say what changed: demand, bookings, newly usable capacity, backups and gaps. */
    previous: before
      ? { number: before.number, savedAt: before.saved_at, inputs: cleanInputs(JSON.parse(before.inputs)), brief: cleanBrief(JSON.parse(before.brief)) }
      : null,
    /** Saved under an earlier model: today's figures are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

/** Saves a plan: a new one, or the next version of one. Nothing is overwritten. Blanks are kept as blanks. */
export function savePlan(db: Db, user: User, input: { id?: unknown; name?: unknown; inputs?: unknown; brief?: unknown; note?: unknown }, now: Date) {
  const a = requireBusiness(db, user);
  const inputs: CoverageInputs = cleanInputs(input.inputs);
  const brief = cleanBrief(input.brief);
  const errors = validateInputs(inputs);
  const snapshot = errors.length ? { incomplete: errors.length } : snapshotOf(calculate(inputs));
  const at = now.toISOString();
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  return tx(db, () => {
    let id: string;
    let number: number;
    if (input.id) {
      const { row } = ownPlan(db, user, input.id);
      id = row.id;
      number = (versionsOf(db, id).at(-1)?.number ?? 0) + 1;
      db.prepare("UPDATE coverage_plans SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the plan a name.");
      id = `cp-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO coverage_plans (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare(
      "INSERT INTO coverage_plan_versions (plan_id, number, inputs, brief, model_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, number, JSON.stringify(inputs), JSON.stringify(brief), MODEL_VERSION, JSON.stringify(snapshot), note, user.id, at);
    return getPlan(db, user, id, number);
  });
}
