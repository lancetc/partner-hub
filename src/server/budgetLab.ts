import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type BudgetLabBlock } from "@/lib/magazine";
import {
  budgetLabForReaders,
  buildDebrief,
  cleanState,
  DIM_ORDER,
  emptyState,
  finishProblems,
  LAB_VERSION,
  LAST,
  RUBRIC_VERSION,
  stepProblems,
  type Debrief,
  type Dim,
  type FlagId,
  type LabState,
} from "@/lib/budgetLab";
import { MODEL_VERSION } from "@/lib/quarterBudget";
import { quarterRules, ruleStatus } from "@/lib/quarterEndRules";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  The Quarterly Budget Decision Lab on the server (docs/budget-decision-lab.md).

  - A learner's attempt at the fictional quarter, kept here and read against the same model and rubric the page shows.
    The order is enforced here: each step opens only when the one before is done, and the debrief (feedback, levels,
    flags, endings) is sent only once a reason is submitted. Completion needs the feedback viewed as well.
  - Each attempt keeps its scenario, rule set, rubric, model and lab versions, and the debrief it was given. A later
    rule or block change never rescores it: a new course version starts a fresh attempt, and old ones stay as they were.
  - A Topic card shows the same block by reference (labRef on the card): the same attempt record, rules and rubric,
    loaded from the published course, for people who can read that course.
  - Events carry ids, option ids, counts, versions and where it was done (the Magazine or a Topic): never the learner's
    written reason, and never a figure they typed. Saves that change nothing log nothing, and a resent submit or retry
    returns what's already there, so a network retry never makes a second attempt.
  - The table is created here (ensureBudgetLabTables), not in server/db, so a running server picks it up.

  No AI is called anywhere in it, and nothing here books, claims, invoices or changes a care plan.
*/

export const BUDGET_LAB_SCHEMA = `
CREATE TABLE IF NOT EXISTS budgetlab_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, case_hash TEXT NOT NULL, scenario_version TEXT NOT NULL, rule_set_id TEXT NOT NULL,
  model_version TEXT NOT NULL, rubric_version TEXT NOT NULL, lab_version TEXT NOT NULL, mode TEXT NOT NULL,
  twist TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT 'magazine', state TEXT NOT NULL, result TEXT,
  status TEXT NOT NULL, started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS budgetlab_attempts_guide ON budgetlab_attempts (guide_id, block_id);
`;
const ready = new WeakSet<object>();
export function ensureBudgetLabTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(BUDGET_LAB_SCHEMA);
  ready.add(db);
}

type Status = "active" | "submitted" | "completed";
type AttemptRow = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  case_hash: string;
  scenario_version: string;
  rule_set_id: string;
  model_version: string;
  rubric_version: string;
  lab_version: string;
  mode: string;
  twist: string;
  place: string;
  state: string;
  result: string | null;
  status: Status;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
};
type Result = { debrief: Debrief; score: number; dims: Record<Dim, number>; flags: FlagId[]; unsafe: boolean; passed: boolean | null; ending: string };

export const caseHash = (b: BudgetLabBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);
const today = (now: Date) => now.toISOString().slice(0, 10);
const placeOf = (v: unknown) => (typeof v === "string" && /^topic:[a-z0-9-]{1,80}$/.test(v) ? v : "magazine");

function load(db: Db, user: User, guideId: string, blockId: unknown, now = new Date()) {
  ensureBudgetLabTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "budgetlab") throw new HttpError(404, "That Quarterly Budget Decision Lab isn’t here.");
  // A withdrawn rule set takes the lab out of use: it never stays available as current guidance.
  if (ruleStatus(block.ruleSetId, today(now)) === "withdrawn") throw new HttpError(410, "This lab has been withdrawn while its rules are reviewed.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM budgetlab_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM budgetlab_attempts WHERE id = ?").get(id) as AttemptRow;

/** One event in the Hub's activity log: ids, option ids, counts and versions only, with a key so a consumer can count it once. */
function log(db: Db, a: AttemptRow, event: string, detail: object, now: Date, key = "") {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({
      key: `${a.id}:${event}${key ? `:${key}` : ""}`,
      attempt: a.id,
      attemptNo: a.attempt_no,
      scenario: a.scenario_version,
      ruleSet: a.rule_set_id,
      rubric: a.rubric_version,
      model: a.model_version,
      mode: a.mode,
      place: a.place,
      ...detail,
    }),
  );
}

function view(db: Db, a: AttemptRow | undefined, block: BudgetLabBlock, now: Date) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = a?.result ? (JSON.parse(a.result) as Result) : null;
  const rules = quarterRules(block.ruleSetId);
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The debrief this attempt was given, as it was given: never recomputed under later rules. */
    debrief: result?.debrief ?? null,
    versions: { lab: LAB_VERSION, scenario: block.scenarioVersion, ruleSet: block.ruleSetId, rubric: RUBRIC_VERSION, model: MODEL_VERSION },
    rules: { id: block.ruleSetId, label: rules?.label ?? "", status: ruleStatus(block.ruleSetId, today(now)) },
    earlierCase: Boolean(a && a.case_hash !== caseHash(block)),
    /** How many attempts this person has, including this one. */
    attempts: a
      ? (
          db
            .prepare("SELECT COUNT(*) AS n FROM budgetlab_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?")
            .get(a.user_id, a.guide_id, a.block_id) as { n: number }
        ).n
      : 0,
  };
}
export type BudgetLabView = ReturnType<typeof view> & { block?: BudgetLabBlock; guideId?: string };

/** The learner's own attempt. With `embed` (a Topic card), the readers' copy of the block comes with it. */
export function budgetLabState(db: Db, user: User, guideId: string, blockId: unknown, opts: { embed?: boolean } = {}, now = new Date()): BudgetLabView {
  const { edition, block } = load(db, user, guideId, blockId, now);
  const v = view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  return opts.embed ? { ...v, block: budgetLabForReaders(block), guideId: edition.guide.id } : v;
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: BudgetLabBlock, attemptNo: number, now: Date, place: string, retries = 0) {
  // An assessed attempt can't start on a rule set known to need review.
  if (block.assessment.mode === "assessed" && ruleStatus(block.ruleSetId, today(now)) !== "current")
    throw new HttpError(409, "Review required: this assessed lab’s rules are being reviewed, so a new attempt can’t start yet.");
  // Attempt 2 gets the first variation, attempt 3 the next, and so on: a retry is never the identical case.
  const twist = attemptNo > 1 && block.twists.length ? block.twists[(attemptNo - 2) % block.twists.length].id : "";
  const id = `bl-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO budgetlab_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, case_hash, scenario_version, rule_set_id, model_version, rubric_version, lab_version, mode, twist, place, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    guideId,
    revisionId,
    block.id,
    user.id,
    attemptNo,
    caseHash(block),
    block.scenarioVersion,
    block.ruleSetId,
    MODEL_VERSION,
    RUBRIC_VERSION,
    LAB_VERSION,
    block.assessment.mode,
    twist,
    place,
    JSON.stringify({ ...emptyState(), twist, retries }),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id)!;
  if (row.id === id) log(db, row, "activity_started", { twist }, now);
  return row;
}

const stored = (a: AttemptRow, block: BudgetLabBlock) => cleanState(block, { ...JSON.parse(a.state), twist: a.twist });
const store = (db: Db, a: AttemptRow, s: LabState, now: Date) =>
  db.prepare("UPDATE budgetlab_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);
const planKey = (s: LabState) => JSON.stringify([s.proposed.map((p) => `${p.serviceId}@${p.date}${p.review ? "r" : ""}`).sort(), s.unchanged]);

/**
  Saves progress: what's been opened, the answers and choices so far, the plan and the reason. The step moves forward
  one at a time, and only when the step before is done; never to the consequences, which come from submitting.
*/
export function saveBudgetLab(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId, now);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id) ??
      create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place));
    if (a.status !== "active") return view(db, a, block, now);
    const prev = stored(a, block);
    const next = cleanState(block, { ...(input.state as object), twist: a.twist });
    const merged: LabState = {
      ...next,
      opened: [...new Set([...prev.opened, ...next.opened])],
      answers: { ...prev.answers, ...next.answers },
      twist: a.twist,
      retries: prev.retries,
      stage: prev.stage,
    };
    // Forward one step at a time, and only through a finished step.
    const want = Math.min(LAST - 1, Math.max(prev.stage, next.stage));
    for (let st = prev.stage + 1; st <= want && !stepProblems(block, merged, st).length; st++) merged.stage = st;
    if (next.stage < prev.stage) merged.stage = Math.max(0, next.stage);
    store(db, a, merged, now);
    for (const x of merged.opened.filter((y) => !prev.opened.includes(y)))
      log(db, a, x === "projection" ? "budget_projection_viewed" : "budget_information_opened", { what: x }, now, x);
    if (merged.stage >= 3 && prev.stage < 3 && !merged.opened.includes("projection"))
      log(db, a, "budget_projection_viewed", { what: "decision-summary" }, now, "summary");
    if (planKey(merged) !== planKey(prev))
      log(
        db,
        a,
        "budget_plan_changed",
        {
          sessions: merged.proposed.filter((p) => !p.review).length,
          reviews: merged.proposed.filter((p) => p.review).length,
          unchanged: merged.unchanged && !merged.proposed.length,
        },
        now,
        String(Date.parse(now.toISOString())),
      );
    if (merged.equipment && merged.equipment !== prev.equipment)
      log(db, a, "funding_route_chosen", { route: merged.equipment, revised: Boolean(prev.equipment) }, now, merged.equipment);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Submits the response: the plan, the explanation, the next step and the reason. The debrief is built and kept as given. */
export function submitBudgetLab(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId, now);
  const out = tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) return { problems: ["Start with the statement and the care plan."] };
    if (a.status !== "active") return { id: a.id };
    const prev = stored(a, block);
    const take = <K extends keyof LabState>(k: K) => (input[k] !== undefined ? input[k] : prev[k]);
    const s = cleanState(block, {
      ...prev,
      explanation: take("explanation"),
      nextStep: take("nextStep"),
      reason: take("reason"),
      twist: a.twist,
    });
    // Everything before has to be done: the same gates as the steps.
    const problems = [...new Set([...stepProblems(block, { ...s, stage: LAST }, 3), ...finishProblems(block, s)])];
    if (prev.stage < 3) problems.unshift("Work through the steps first.");
    if (problems.length) return { problems };
    const done: LabState = { ...s, stage: LAST };
    const d = buildDebrief(block, done);
    const result: Result = {
      debrief: d,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      unsafe: d.unsafe,
      passed: d.passed,
      ending: d.ending,
    };
    const at = now.toISOString();
    db.prepare("UPDATE budgetlab_attempts SET state = ?, result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "participant_explanation_submitted",
      { explanation: done.explanation, nextStep: done.nextStep, reasonWritten: done.reason.trim().length > 0 },
      now,
    );
    log(
      db,
      a,
      "response_submitted",
      {
        ending: d.ending,
        score: d.score,
        dims: result.dims,
        flags: result.flags,
        unsafe: d.unsafe,
        projected: d.plan.projectedBalanceCents,
        above: d.plan.projectedAboveThresholdCents,
        twist: a.twist,
      },
      now,
    );
    if (a.mode === "assessed") log(db, a, "assessment_attempted", { score: d.score, passMark: d.passMark, unsafe: d.unsafe }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(db, reread(db, out.id!), block, now);
}

/** The feedback has been viewed: now the activity is complete (and, in assessed mode, passed if it was). Once only. */
export function viewedBudgetLab(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId, now);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block, now);
    const result = JSON.parse(a.result ?? "{}") as Result;
    db.prepare("UPDATE budgetlab_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(
      now.toISOString(),
      now.toISOString(),
      a.id,
    );
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { score: result.score, ending: result.ending }, now);
    if (a.mode === "assessed" && result.passed) log(db, a, "assessment_passed", { score: result.score }, now);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Try again: a fresh attempt with the next variation. The finished one is kept with its own versions and debrief. */
export function retryBudgetLab(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId, now);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    // A resent retry, or one while an attempt is still open, returns the open attempt.
    if (a && a.status === "active") return view(db, a, block, now);
    if (a && typeof input.from === "string" && input.from !== a.id) return view(db, a, block, now);
    const retries = a ? stored(a, block).retries + 1 : 0;
    const row = create(db, user, edition.guide.id, edition.revision.id, block, (a?.attempt_no ?? 0) + 1, now, placeOf(input.place), retries);
    if (a) log(db, row, "retry_started", { from: a.id, twist: row.twist }, now);
    return view(db, reread(db, row.id), block, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors: totals, placements and the decision register
// ---------------------------------------------------------------------------------------------

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: started, submitted, completed and retried; and, with enough people, scores by rubric
  dimension, misconception codes, endings and critical errors. Each person's first submitted attempt counts. Never a
  learner's reason or plan.
*/
export function budgetLabStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureBudgetLabTables(db);
  const rows = db
    .prepare(
      "SELECT block_id, user_id, status, result, attempt_no, scenario_version, rule_set_id, rubric_version FROM budgetlab_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "status" | "result" | "attempt_no" | "scenario_version" | "rule_set_id" | "rubric_version">[];
  type Totals = {
    attempts: number;
    people: Set<string>;
    submitted: number;
    completed: number;
    retries: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    flags: Record<string, number>;
    endings: Record<string, number>;
    unsafe: number;
    passed: number;
    versions: Set<string>;
  };
  const blocks = new Map<string, Totals>();
  for (const r of rows) {
    const b: Totals = blocks.get(r.block_id) ?? {
      attempts: 0,
      people: new Set<string>(),
      submitted: 0,
      completed: 0,
      retries: 0,
      counted: new Set<string>(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>,
      flags: {},
      endings: {},
      unsafe: 0,
      passed: 0,
      versions: new Set<string>(),
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.attempt_no > 1) b.retries += 1;
    b.versions.add(`${r.scenario_version} · ${r.rule_set_id} · ${r.rubric_version}`);
    if (r.status !== "active" && r.result) {
      b.submitted += 1;
      if (r.status === "completed") b.completed += 1;
      if (!b.counted.has(r.user_id)) {
        b.counted.add(r.user_id);
        const res = JSON.parse(r.result) as Result;
        for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
        for (const f of res.flags) b.flags[f] = (b.flags[f] ?? 0) + 1;
        b.endings[res.ending] = (b.endings[res.ending] ?? 0) + 1;
        if (res.unsafe) b.unsafe += 1;
        if (res.passed) b.passed += 1;
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
        submitted: b.submitted,
        completed: b.completed,
        retries: b.retries,
        counted: b.counted.size,
        suppressed: small,
        dims: small ? null : b.dims,
        flags: small ? null : b.flags,
        endings: small ? null : b.endings,
        unsafe: small ? null : b.unsafe,
        passed: small ? null : b.passed,
        versions: [...b.versions],
      };
    }),
  };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string };
function publishedLabs(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"budgetlab\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is BudgetLabBlock => b.type === "budgetlab")
      .map((b) => ({ guide: g, block: b })),
  );
}

/** For the Topic editor: the published labs an author can place on a card, by reference. */
export function budgetLabPlacements(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  return {
    labs: publishedLabs(db).map(({ guide, block }) => ({
      guide: guide.slug,
      guideId: guide.id,
      guideTitle: guide.title,
      block: block.id,
      title: block.title,
      participant: block.story.participant,
      ruleSet: block.ruleSetId,
      status: ruleStatus(block.ruleSetId, today(now)),
    })),
  };
}

/** Topics whose published version places a lab on a card. */
function topicPlacements(db: Db) {
  const rows = db
    .prepare("SELECT slug, published FROM authored_lessons WHERE published IS NOT NULL AND published LIKE '%\"labRef\"%' AND deleted_at IS NULL")
    .all() as {
    slug: string;
    published: string;
  }[];
  return rows.flatMap((r) => {
    const l = JSON.parse(r.published) as { title?: string; nodes?: Record<string, { id: string; labRef?: { guide: string; block: string } }> };
    return Object.values(l.nodes ?? {})
      .filter((n) => n.labRef)
      .map((n) => ({ topic: r.slug, title: l.title ?? r.slug, card: n.id, guide: n.labRef!.guide, block: n.labRef!.block }));
  });
}

/**
  The decision register's "Budget Decision Labs" sheet (server/problemDesk export): every published lab with its rule
  set, placements, theme and response decision, audience, dates, practice results by rubric dimension, reviewers and the
  separately owned work measure. Practice evidence only; no learner's reason or plan is ever in it, and results resting on
  fewer than five people show counts only.
*/
export function budgetLabRegister(db: Db, now: Date) {
  ensureBudgetLabTables(db);
  const topics = topicPlacements(db);
  return publishedLabs(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT user_id, status, result, attempt_no FROM budgetlab_attempts WHERE guide_id = ? AND block_id = ? ORDER BY attempt_no")
      .all(guide.id, block.id) as Pick<AttemptRow, "user_id" | "status" | "result" | "attempt_no">[];
    const firsts = new Map<string, Result>();
    for (const r of rows) if (r.result && !firsts.has(r.user_id)) firsts.set(r.user_id, JSON.parse(r.result) as Result);
    const small = firsts.size < SMALL_COHORT;
    const mean = (k: Dim) => (small ? "" : Math.round(([...firsts.values()].reduce((n, x) => n + (x.dims[k] ?? 0), 0) / firsts.size) * 10) / 10);
    const codes: Record<string, number> = {};
    for (const x of firsts.values()) for (const f of x.flags) codes[f] = (codes[f] ?? 0) + 1;
    const a = block.approval;
    return {
      blockId: block.id,
      guideId: guide.id,
      guide: guide.title,
      slug: guide.slug,
      title: block.title,
      scenario: block.scenarioVersion,
      ruleSet: block.ruleSetId,
      ruleStatus: ruleStatus(block.ruleSetId, today(now)),
      placements: [
        `Magazine: ${guide.title}`,
        ...topics.filter((t) => (t.guide === guide.slug || t.guide === guide.id) && t.block === block.id).map((t) => `Topic: ${t.title} (card ${t.card})`),
      ],
      theme: [block.rationale.themeId, block.rationale.theme].filter(Boolean).join(": "),
      rationaleDecision: block.rationale.decision || "Not decided",
      audience: (() => {
        try {
          return (JSON.parse(guide.audience) as string[]).join(", ") || "Everyone signed in";
        } catch {
          return guide.audience || "Everyone signed in";
        }
      })(),
      effectiveFrom: a.effectiveFrom,
      reviewBy: a.reviewBy,
      reviewers: [a.owner, a.operations, a.policy, a.quality, a.learning].filter(Boolean).join("; ") || "Not signed off",
      mode: block.assessment.mode,
      started: new Set(rows.map((r) => r.user_id)).size,
      submitted: rows.filter((r) => r.status !== "active").length,
      completed: rows.filter((r) => r.status === "completed").length,
      retries: rows.filter((r) => r.attempt_no > 1).length,
      people: firsts.size,
      suppressed: small,
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, mean(k)])) as Record<Dim, number | "">,
      critical: small ? "" : [...firsts.values()].filter((x) => x.unsafe).length,
      passed: small || block.assessment.mode !== "assessed" ? "" : [...firsts.values()].filter((x) => x.passed).length,
      misconceptions: small
        ? ""
        : Object.entries(codes)
            .map(([k, n]) => `${k} ${n}`)
            .join("; "),
      measure: block.rationale.measure,
    };
  });
}
