import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type HiringBlock } from "@/lib/magazine";
import { MODEL_VERSION } from "@/lib/hiringModel";
import {
  buildHiringDebrief,
  cleanDecision,
  cleanHiringState,
  compareBeforeAfter,
  decisionProblems,
  DIM_ORDER,
  emptyHiringState,
  LAB_VERSION,
  RUBRIC_VERSION,
  type Dim,
  type HiringDebrief,
  type HiringState,
  type Misconception,
} from "@/lib/hiringRunway";
import { ensureHiring, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Hiring Runway Decision Lab (docs/hiring-runway-lab.md): a learner's attempt, kept on the server and read against the
  same calculation core and rubric the page shows. The order is enforced here, not in the browser: the new information
  is only sent once a first decision is committed, the rubric and reviewed plans only once the revised plan is in.

  It works the same with AI switched off: there's no model call anywhere in it. A learner's choices and words are
  theirs; the events and the authors' totals carry fictional choices, rubric levels and misconception codes only,
  never typed explanations or any real business figure.
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
  assessment: string;
  state: string;
  result: string | null;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

/** Changes when the case does, so an attempt says which version it was read against. */
export const caseHash = (b: HiringBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureHiring(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "hiring") throw new HttpError(404, "That Hiring Runway lab isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM hiring_lab_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM hiring_lab_attempts WHERE id = ?").get(id) as AttemptRow;

/** One event in the Hub's activity log, with the attempt's id and versions. Fictional choices only. */
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

/** A plan's fictional choices for the activity log: actions and timing, never the explanation. */
const choices = (x: HiringState["initial"]) =>
  x
    ? {
        actions: (["recruit", "temporary", "pace", "workflow", "monitor"] as const).filter((k) => x[k]),
        option: x.recruit ? x.optionId : null,
        startMonth: x.recruit ? x.startMonth : null,
        income: x.incomeBasis,
      }
    : null;

function view(a: AttemptRow | undefined, block: HiringBlock) {
  const state = a ? cleanHiringState(block, JSON.parse(a.state)) : emptyHiringState(block);
  const revealed = state.stage >= 2;
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The new information: only once a first decision is committed. */
    event: revealed
      ? { title: block.event.title, story: block.event.story, source: block.event.source, changed: block.event.changed, adjustments: block.event.adjustments }
      : null,
    /** Before and after the new information, for the first plan. */
    comparison: revealed && state.initial ? compareBeforeAfter(block, state.initial) : null,
    /** The rubric, the reviewed plans and the debrief: only once the revised plan is in. */
    debrief: state.stage === 3 ? buildHiringDebrief(block, state) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION },
    /** Read against an earlier version of the case (it has since been edited). */
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
    assessment: block.assessment,
  };
}
export type HiringView = ReturnType<typeof view>;

export function hiringState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: HiringBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `hl-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO hiring_lab_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, assessment, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
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
    block.assessment,
    JSON.stringify({ ...emptyHiringState(block), retries }),
    at,
    at,
  );
  const row = reread(db, id);
  log(db, row, "hiring_lab_started", { attemptNo, assessment: block.assessment }, now);
  return row;
}

/** The learner's current attempt, started if there isn't one. */
function active(db: Db, user: User, guideId: string, revisionId: string, block: HiringBlock, now: Date) {
  // The latest attempt, finished or not (a finished one stays as it is until Try another approach).
  return latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
}

const stored = (a: AttemptRow, block: HiringBlock) => cleanHiringState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, state: HiringState, now: Date) {
  db.prepare("UPDATE hiring_lab_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}

/**
  Saves progress: the evidence opened, the growth case and option looked at, what-if edits, and a decision being drafted.
  A committed decision is settled; the stage only moves forward through commit and revise.
*/
export function saveHiring(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (a.status === "finished") return view(a, block);
    const next = cleanHiringState(block, input.state);
    const merged: HiringState = {
      ...prev,
      stage: prev.stage === 0 && next.stage === 1 ? 1 : prev.stage,
      opened: [...new Set([...prev.opened, ...next.opened])],
      growthId: next.growthId,
      optionId: next.optionId,
      edits: prev.stage < 2 ? next.edits : prev.edits,
      compared: [...new Set([...prev.compared, ...next.compared])],
      // Drafts: the first decision until it's committed, then the revision until it's in.
      initial: prev.stage < 2 ? next.initial : prev.initial,
      revised: prev.stage === 2 ? next.revised : prev.revised,
    };
    store(db, a, merged, now);
    for (const id of merged.opened.filter((x) => !prev.opened.includes(x))) log(db, a, "evidence_opened", { evidence: id }, now);
    if (merged.growthId !== prev.growthId) log(db, a, "growth_case_changed", { growth: merged.growthId }, now);
    for (const g of merged.compared.filter((x) => !prev.compared.includes(x))) log(db, a, "option_compared", { growth: g }, now);
    return view(reread(db, a.id), block);
  });
}

/** Commits the first decision. Only then is the new information sent. */
export function commitInitial(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    if (s.stage >= 2) return { id: a.id };
    const decision = cleanDecision(input.decision, block);
    const problems = decisionProblems(block, decision, "initial");
    if (problems.length) return { problems };
    const next: HiringState = { ...s, stage: 2, initial: decision, revised: decision };
    store(db, a, next, now);
    log(db, a, "initial_decision_submitted", { plan: choices(decision) }, now);
    log(db, a, "event_revealed", { event: block.event.title }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Commits the revised decision and finishes the attempt with its rubric. */
export function commitRevised(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    if (s.stage < 2) return { problems: ["Commit your first decision before the new information."] };
    if (s.stage === 3) return { id: a.id };
    const decision = cleanDecision(input.decision, block);
    const problems = decisionProblems(block, decision, "revised");
    if (problems.length) return { problems };
    const done: HiringState = { ...s, stage: 3, revised: decision };
    const d = buildHiringDebrief(block, done);
    const at = now.toISOString();
    db.prepare("UPDATE hiring_lab_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(resultOf(d, done)),
      at,
      at,
      a.id,
    );
    log(db, a, "revised_decision_submitted", { plan: choices(decision) }, now);
    log(
      db,
      a,
      "hiring_lab_completed",
      { score: d.score, dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])), misconceptions: d.misconceptions },
      now,
    );
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** What's kept with a finished attempt: versions, rubric levels, misconceptions and the fictional choices. No explanation text. */
function resultOf(d: HiringDebrief, s: HiringState) {
  return {
    versions: { lab: d.labVersion, story: d.storyVersion, model: d.modelVersion, rubric: d.rubricVersion },
    score: d.score,
    dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
    misconceptions: d.misconceptions,
    initial: choices(s.initial),
    revised: choices(s.revised),
    plan: { monthsAbove: d.yours.after.monthsAbove, lowestCash: Math.round(d.yours.after.lowestCash) },
  };
}

/** The learner read their feedback. */
export function feedbackViewed(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  // Once per attempt: reopening the debrief later isn't a second reading to count.
  const seen =
    a &&
    db
      .prepare("SELECT 1 FROM magazine_events WHERE event = 'rubric_feedback_viewed' AND user_id = ? AND guide_id = ? AND detail LIKE ?")
      .get(a.user_id, a.guide_id, `%"attempt":"${a.id}"%`);
  if (a?.status === "finished" && !seen) log(db, a, "rubric_feedback_viewed", {}, now);
  return { ok: true };
}

/** Try another approach: a fresh attempt, from the story. Every attempt is kept; an assessed lab records the first. */
export function retryHiring(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels by
  dimension and misconception counts, each with its denominator and versions. Never plans, words or figures.
  An assessed lab counts each person's first finished attempt; later ones are practice.
*/
export function hiringStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureHiring(db);
  const rows = db
    .prepare(
      "SELECT block_id, user_id, attempt_no, status, state, result, story_version, rubric_version, assessment FROM hiring_lab_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<
    AttemptRow,
    "block_id" | "user_id" | "attempt_no" | "status" | "state" | "result" | "story_version" | "rubric_version" | "assessment"
  >[];
  type Totals = {
    blockId: string;
    attempts: number;
    people: Set<string>;
    decided: number;
    finished: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    misconceptions: Record<string, number>;
    versions: Set<string>;
  };
  const blocks = new Map<string, Totals>();
  for (const r of rows) {
    const b: Totals = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set(),
      decided: 0,
      finished: 0,
      counted: new Set(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0]])) as Record<Dim, number[]>,
      misconceptions: {},
      versions: new Set(),
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    b.versions.add(`${r.story_version} · ${r.rubric_version}`);
    const st = JSON.parse(r.state) as { stage?: number };
    if ((st.stage ?? 0) >= 2) b.decided += 1;
    if (r.status === "finished" && r.result) {
      b.finished += 1;
      // One result per person: their first finished attempt.
      if (!b.counted.has(r.user_id)) {
        b.counted.add(r.user_id);
        const res = JSON.parse(r.result) as { dims: Record<Dim, number>; misconceptions: Misconception[] };
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const m of res.misconceptions) b.misconceptions[m] = (b.misconceptions[m] ?? 0) + 1;
      }
    }
    blocks.set(r.block_id, b);
  }
  return {
    blocks: [...blocks.values()].map((b) => {
      const small = b.counted.size < SMALL_COHORT;
      return {
        blockId: b.blockId,
        attempts: b.attempts,
        people: b.people.size,
        decided: b.decided,
        finished: b.finished,
        /** People whose first finished attempt is counted: the denominator for the breakdowns. */
        counted: b.counted.size,
        suppressed: small,
        dims: small ? null : b.dims,
        misconceptions: small ? null : b.misconceptions,
        versions: [...b.versions],
      };
    }),
  };
}
