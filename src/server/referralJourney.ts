import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type ReferralBlock } from "@/lib/magazine";
import { calculate, cleanInputs, MODEL_VERSION, snapshotOf, validateInputs, type ReferralInputs } from "@/lib/referralJourney";
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
  type Dim,
  type FlagId,
  type ReferralLabData,
  type ReferralState,
} from "@/lib/referralLab";
import { ensureReferral, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";

/*
  Referral Journey Calculator ("Which referrals become active clients?", docs/referral-journey.md), on the server:

  1. A learner's attempt at the fictional case, kept here and read against the same model and rubric the page shows.
     The order is enforced here: the stage cards and what follows open only after the prediction, and the debrief
     (the cards' answers and feedback, the options' feedback and outcomes) is only sent once every card is sorted, a
     funnel, the timing, effort and continuity are opened, every question is answered and the return visit is read.
     Events carry fictional choices, whether a sort matched, whether an answer was flagged, rubric levels and flags
     only: never typed words, counts or relationship labels.

  2. "Review my relationships": a partner business's private Relationship Reviews, scoped to the business on the
     server. Only the owner and the members they've authorised (the same access as Plan my business) can list, read
     or save them; anyone else, Trilogy staff and authors included, gets nothing, whatever id they ask for. A save is
     a new numbered version. Rows are aggregate monthly cohorts; nothing here asks for a person's name, a practice's or
     hospital's name, or clinical information. None of it reaches the authors' totals: the only trace in the activity
     log is that a review was saved or reopened, with its version number. The Local Referral Studio handoff is a
     placeholder: that Work Tool isn't in the Hub yet.

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

export const caseHash = (b: ReferralBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureReferral(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "referral") throw new HttpError(404, "That Referral Journey block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM referral_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM referral_attempts WHERE id = ?").get(id) as AttemptRow;

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

function view(a: AttemptRow | undefined, block: ReferralBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    state,
    /** The rubric, the cards' answers, the feedback and the story's outcomes: only once the decisions are in. */
    debrief: a?.status === "finished" ? buildDebrief(block, state, a.model_version) : null,
    versions: { lab: LAB_VERSION, story: block.storyVersion, model: MODEL_VERSION, rubric: RUBRIC_VERSION, stages: block.stageModelVersion },
    earlierCase: Boolean(a && a.key_hash !== caseHash(block)),
  };
}
export type ReferralView = ReturnType<typeof view>;

export function referralState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: ReferralBlock, attemptNo: number, now: Date, retries = 0): AttemptRow {
  const id = `ra-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO referral_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, model_version, rubric_version, state, status, started_at, updated_at)
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
  log(db, row, "referral_started", { attemptNo }, now);
  return row;
}

const active = (db: Db, user: User, guideId: string, revisionId: string, block: ReferralBlock, now: Date) =>
  latest(db, user, guideId, revisionId, block.id) ?? create(db, user, guideId, revisionId, block, 1, now);
const stored = (a: AttemptRow, block: ReferralBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, s: ReferralState, now: Date) =>
  db.prepare("UPDATE referral_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/** The answered questions that are logged as they're chosen: which question, the fictional option, and whether it was flagged. */
const QUESTIONS = { denominator: "denominator_answered", timing: "timing_answered", choice: "choice_answered" } as const;
const flagged = (block: ReferralLabData, k: keyof typeof QUESTIONS, id: string) => Boolean(block[k].options.find((o) => o.id === id)?.flags.length);

/**
  Saves progress: the step, views opened, filters used, stage sorts, and the answers being drafted. The prediction is
  settled once made; the step moves forward one at a time and never past the return visit (the debrief comes from
  finishing).
*/
export function saveReferral(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const prev = stored(a, block);
    const next = cleanState(block, input.state);
    // The stage cards and what follows open only once the prediction is in.
    const ceiling = prev.prediction ? LAST - 1 : 1;
    const merged: ReferralState = {
      ...prev,
      stage: Math.min(ceiling, Math.max(prev.stage, Math.min(next.stage, prev.stage + 1))),
      opened: [...new Set([...prev.opened, ...next.opened])],
      filters: [...new Set([...prev.filters, ...next.filters])],
      tags: { ...prev.tags, ...next.tags },
      denominator: next.denominator,
      timing: next.timing,
      choice: next.choice,
      revised: next.revised,
      dataPoint: next.dataPoint,
      relationship: next.relationship,
      operational: next.operational,
      explanation: next.explanation,
      followUp: next.followUp,
      reinterpret: next.reinterpret,
    };
    store(db, a, merged, now);
    for (const x of merged.opened.filter((y) => !prev.opened.includes(y))) {
      const [kind, source] = x.split(":");
      log(db, a, kind === "funnel" ? "funnel_opened" : "view_opened", { view: kind, ...(source ? { source } : {}) }, now);
    }
    for (const f of merged.filters.filter((y) => !prev.filters.includes(y))) log(db, a, "filter_used", { filter: f }, now);
    for (const [k, t] of Object.entries(merged.tags))
      if (t && prev.tags[k] !== t) {
        const card = block.cards.find((c) => c.id === k);
        const answer = card ? cardAnswer(block, card) : null;
        log(db, a, "stage_classified", { card: k, stage: t, matches: answer ? answer.stage === t : null, revised: Boolean(prev.tags[k]) }, now);
      }
    for (const [k, event] of Object.entries(QUESTIONS) as [keyof typeof QUESTIONS, string][])
      if (merged[k] && merged[k] !== prev[k])
        log(db, a, event, { question: k, answer: merged[k], flagged: flagged(block, k, merged[k]), revised: Boolean(prev[k]) }, now);
    return view(reread(db, a.id), block);
  });
}

/** The prediction, from enquiry counts alone. Settled once made: the debrief compares it with what the cohort shows. */
export function submitPrediction(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    if (prev.prediction || a.status === "finished") return view(a, block);
    const p = cleanState(block, { prediction: input.prediction }).prediction;
    if (!p || !p.source) throw new HttpError(400, "Choose which relationship you think produced the most useful growth.");
    store(db, a, { ...prev, prediction: p, stage: Math.max(prev.stage, 2) }, now);
    log(db, a, "prediction_submitted", { source: p.source }, now);
    return view(reread(db, a.id), block);
  });
}

const DECISIONS = ["denominator", "timing", "choice", "revised", "dataPoint", "relationship", "operational", "explanation", "followUp", "reinterpret"] as const;

/** The next move and the return visit: the attempt finishes and the debrief is sent. */
export function finishReferral(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return { id: a.id };
    const prev = stored(a, block);
    const picked = Object.fromEntries(DECISIONS.map((k) => [k, typeof input[k] === "string" ? input[k] : prev[k]]));
    const cleaned = cleanState(block, { ...prev, ...picked });
    const problems = finishProblems(block, cleaned);
    if (problems.length) return { problems };
    const done: ReferralState = { ...cleaned, stage: LAST };
    const d = buildDebrief(block, done, MODEL_VERSION);
    const at = now.toISOString();
    const result = {
      versions: d.versions,
      score: d.score,
      dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.rating])) as Record<Dim, number>,
      flags: d.flags.map((f) => f.id),
      prediction: done.prediction?.source ?? "",
      revised: done.revised,
      relationship: done.relationship,
      operational: done.operational,
      explanation: done.explanation,
      followUp: done.followUp,
      reinterpret: done.reinterpret,
      misread: d.cards.filter((c) => !c.matches).map((c) => c.id),
    };
    db.prepare("UPDATE referral_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "decision_submitted",
      { revised: done.revised, dataPoint: done.dataPoint, relationship: done.relationship, operational: done.operational, explanation: done.explanation },
      now,
    );
    const changed = Boolean(done.reinterpret && done.reinterpret !== done.relationship);
    log(db, a, "followup_answered", { answer: done.followUp, reinterpret: done.reinterpret, changed }, now);
    log(db, a, "referral_completed", { score: d.score, dims: result.dims, flags: result.flags, misread: result.misread.length }, now);
    return { id: a.id };
  });
  if ("problems" in out) throw Object.assign(new HttpError(400, `Not yet. ${out.problems!.join(" ")}`), { problems: out.problems });
  return view(reread(db, out.id!), block);
}

/** Look again: a fresh attempt, from the start. Every attempt is kept, first and revised. */
export function retryReferral(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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

/** The learning Relationship Review was printed or saved. */
export function reviewPrinted(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (a) log(db, a, "review_printed", {}, now);
  return { ok: true };
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, how far they got, and (with enough people) rubric levels, flags,
  the choices made and which stage cards were misread, with the denominator and versions. Each person's first
  finished attempt counts. Never private reviews, and never any source counts or relationship labels.
*/
export function referralStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureReferral(db);
  const rows = db
    .prepare("SELECT block_id, user_id, status, state, result, story_version, rubric_version FROM referral_attempts WHERE guide_id = ? ORDER BY attempt_no")
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "status" | "state" | "result" | "story_version" | "rubric_version">[];
  type Totals = {
    attempts: number;
    people: Set<string>;
    predicted: number;
    finished: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    flags: Record<string, number>;
    prediction: Record<string, number>;
    revised: Record<string, number>;
    relationship: Record<string, number>;
    operational: Record<string, number>;
    reinterpreted: number;
    misread: Record<string, number>;
    versions: Set<string>;
  };
  const blocks = new Map<string, Totals>();
  const bump = (m: Record<string, number>, k: string) => {
    if (k) m[k] = (m[k] ?? 0) + 1;
  };
  for (const r of rows) {
    const b: Totals = blocks.get(r.block_id) ?? {
      attempts: 0,
      people: new Set<string>(),
      predicted: 0,
      finished: 0,
      counted: new Set<string>(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>,
      flags: {},
      prediction: {},
      revised: {},
      relationship: {},
      operational: {},
      reinterpreted: 0,
      misread: {},
      versions: new Set<string>(),
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    b.versions.add(`${r.story_version} · ${r.rubric_version}`);
    if ((JSON.parse(r.state) as { prediction?: unknown }).prediction) b.predicted += 1;
    if (r.status === "finished" && r.result && !b.counted.has(r.user_id)) {
      b.finished += 1;
      b.counted.add(r.user_id);
      const res = JSON.parse(r.result) as {
        dims: Record<Dim, number>;
        flags: FlagId[];
        prediction: string;
        revised: string;
        relationship: string;
        operational: string;
        reinterpret: string;
        misread: string[];
      };
      for (const k of DIM_ORDER) b.dims[k][res.dims[k] ?? 0] += 1;
      for (const f of res.flags) bump(b.flags, f);
      bump(b.prediction, res.prediction);
      bump(b.revised, res.revised);
      bump(b.relationship, res.relationship);
      bump(b.operational, res.operational);
      if (res.reinterpret && res.reinterpret !== res.relationship) b.reinterpreted += 1;
      for (const c of res.misread ?? []) bump(b.misread, c);
    } else if (r.status === "finished") b.finished += 1;
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
        prediction: small ? null : b.prediction,
        revised: small ? null : b.revised,
        relationship: small ? null : b.relationship,
        operational: small ? null : b.operational,
        reinterpreted: small ? null : b.reinterpreted,
        misread: small ? null : b.misread,
        versions: [...b.versions],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// "Review my relationships": private Relationship Reviews, scoped to the business
// ---------------------------------------------------------------------------------------------

type ReviewRow = { id: string; org_id: string; name: string; created_by: string; created_at: string; updated_at: string };
type VersionRow = {
  review_id: string;
  number: number;
  inputs: string;
  review: string;
  model_version: string;
  snapshot: string;
  note: string;
  saved_by: string;
  saved_at: string;
};

/** The Relationship Review: cohort definitions, evidence and unknowns, one relationship action, one operational action, owners, a review date. */
export type RelationshipReview = {
  period: string;
  evidence: string;
  unknowns: string;
  relationshipAction: string;
  relationshipOwner: string;
  operationalAction: string;
  operationalOwner: string;
  /** Where the action leads: the Local Referral Studio (a placeholder), the coverage article or the Next 10 Clients calculator. */
  next: "" | "studio" | "coverage" | "intake";
  reviewBy: string;
  notes: string;
};

export function cleanReview(v: unknown): RelationshipReview {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
  return {
    period: text(o.period, 160),
    evidence: text(o.evidence, 1200),
    unknowns: text(o.unknowns, 800),
    relationshipAction: text(o.relationshipAction, 400),
    relationshipOwner: text(o.relationshipOwner, 80),
    operationalAction: text(o.operationalAction, 400),
    operationalOwner: text(o.operationalOwner, 80),
    next: o.next === "studio" || o.next === "coverage" || o.next === "intake" ? o.next : "",
    reviewBy: typeof o.reviewBy === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.reviewBy) ? o.reviewBy : "",
    notes: text(o.notes, 1000),
  };
}

function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "Review my relationships is for the business owner and the people they’ve authorised.");
  ensureReferral(db);
  return a;
}

/** The review, only if it belongs to this person's own business. Otherwise it isn't there, whatever the id. */
function ownReview(db: Db, user: User, id: unknown) {
  const a = requireBusiness(db, user);
  const row =
    typeof id === "string" ? (db.prepare("SELECT * FROM referral_reviews WHERE id = ? AND org_id = ?").get(id, a.orgId) as ReviewRow | undefined) : undefined;
  if (!row) throw new HttpError(404, "That review isn’t here.");
  return { access: a, row };
}

const versionsOf = (db: Db, id: string) => db.prepare("SELECT * FROM referral_review_versions WHERE review_id = ? ORDER BY number").all(id) as VersionRow[];
const nameOf = (db: Db, id: string) => (db.prepare("SELECT name FROM users WHERE id = ?").get(id) as { name: string } | undefined)?.name ?? "";

/**
  The activity-log trace of a private review: that one was saved or reopened from an article, with its version. Only
  when the article is real; never a figure, a label or a note.
*/
function logPrivate(db: Db, user: User, where: { guideId?: unknown; blockId?: unknown }, event: "review_saved" | "review_returned", detail: object, now: Date) {
  if (typeof where.guideId !== "string" || typeof where.blockId !== "string") return;
  const g = db.prepare("SELECT id FROM magazine_guides WHERE id = ?").get(where.guideId) as { id: string } | undefined;
  if (!g) return;
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    user.id,
    g.id,
    event,
    where.blockId.slice(0, 80),
    JSON.stringify({ model: MODEL_VERSION, ...detail }),
  );
}

/** Whether this person may review their relationships here, and their business's reviews. Nothing for anyone else. */
export function businessHome(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null, reviews: [] };
  ensureReferral(db);
  const rows = db.prepare("SELECT * FROM referral_reviews WHERE org_id = ? ORDER BY updated_at DESC").all(a.orgId) as ReviewRow[];
  return {
    access: { orgName: a.orgName, role: a.role },
    reviews: rows.map((r) => {
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

export function getReview(db: Db, user: User, id: unknown, version?: unknown, where: { guideId?: unknown; blockId?: unknown } = {}, now?: Date) {
  const { row } = ownReview(db, user, id);
  const versions = versionsOf(db, row.id);
  const n = Number(version);
  const chosen = (Number.isInteger(n) && versions.find((v) => v.number === n)) || versions.at(-1);
  if (!chosen) throw new HttpError(404, "That review isn’t here.");
  const before = versions.filter((v) => v.number < chosen.number).at(-1);
  if (now) logPrivate(db, user, where, "review_returned", { version: chosen.number, versions: versions.length }, now);
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
    review: cleanReview(JSON.parse(chosen.review)),
    /** The version before, so the page can say what changed: enquiries, starts, effort and continuity. */
    previous: before
      ? { number: before.number, savedAt: before.saved_at, inputs: cleanInputs(JSON.parse(before.inputs)), review: cleanReview(JSON.parse(before.review)) }
      : null,
    /** Saved under an earlier model: today's figures are recalculated, and may differ from what it showed then. */
    earlierModel: chosen.model_version !== MODEL_VERSION,
  };
}

/** Saves a review: a new one, or the next version of one. Nothing is overwritten. Blanks are kept as blanks. */
export function saveReview(
  db: Db,
  user: User,
  input: { id?: unknown; name?: unknown; inputs?: unknown; review?: unknown; note?: unknown; guideId?: unknown; blockId?: unknown },
  now: Date,
) {
  const a = requireBusiness(db, user);
  // Private mode is the manual aggregate grid: never individual rows.
  const inputs: ReferralInputs = { ...cleanInputs(input.inputs), mode: "aggregate", records: [], effort: [] };
  const review = cleanReview(input.review);
  const errors = validateInputs(inputs);
  const snapshot = errors.length ? { incomplete: errors.length } : snapshotOf(calculate(inputs));
  const at = now.toISOString();
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 200) : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  return tx(db, () => {
    let id: string;
    let number: number;
    if (input.id) {
      const { row } = ownReview(db, user, input.id);
      id = row.id;
      number = (versionsOf(db, id).at(-1)?.number ?? 0) + 1;
      db.prepare("UPDATE referral_reviews SET name = ?, updated_at = ? WHERE id = ?").run(name || row.name, at, id);
    } else {
      if (!name) throw new HttpError(400, "Give the review a name.");
      id = `rr-${randomUUID().slice(0, 12)}`;
      number = 1;
      db.prepare("INSERT INTO referral_reviews (id, org_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        id,
        a.orgId,
        name,
        user.id,
        at,
        at,
      );
    }
    db.prepare(
      "INSERT INTO referral_review_versions (review_id, number, inputs, review, model_version, snapshot, note, saved_by, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, number, JSON.stringify(inputs), JSON.stringify(review), MODEL_VERSION, JSON.stringify(snapshot), note, user.id, at);
    logPrivate(db, user, input, "review_saved", { version: number }, now);
    return getReview(db, user, id, number);
  });
}
