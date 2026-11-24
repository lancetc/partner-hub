import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type TrustCheckBlock } from "@/lib/magazine";
import {
  applyMove,
  buildDebrief,
  DIM_ORDER,
  emptyState,
  ENGINE_VERSION,
  MoveError,
  parseMove,
  RUBRIC_VERSION,
  stepsFor,
  submitProblems,
  TRUST_VERSION,
  trustForReaders,
  trustUsable,
  trustView,
  variationFor,
  type Debrief,
  type Dim,
  type TrustData,
  type TrustState,
  type TrustView,
} from "@/lib/trustCheck";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  The 28-Day Trust Check on the server (docs/trust-check.md), in the Discharge Pivot's and Build Your Local Bench's
  pattern:

  - An attempt freezes the case it started on (the block's data and its hash), so a refresh resumes it and a later edit
    never changes a historical result.
  - Every move is replayed through the same pure engine the editor's preview uses (lib/trustCheck). A move that has
    already happened changes nothing, so a retried request never duplicates a choice, a score or an event.
  - The order is enforced by the engine: signal cards first, Notice, Ask, the plan, the checkpoints, Learn. The
    debrief is sent once, and completion follows only when it has been viewed.
  - Events carry ids, codes, counts and versions, marked fictional, with an idempotency key: never what the learner
    typed (the concern and what they'd say stay in the attempt), never a person's details.
  - The table is created here (ensureTrustTables), not in server/db, so a running server picks it up.

  No AI is called, and nothing here reads or writes a real participant, booking, claim, complaint, incident or exit
  record. Every figure is the fictional case's.
*/

export const TRUST_SCHEMA = `
CREATE TABLE IF NOT EXISTS trust_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL, rubric_version TEXT NOT NULL,
  rules_version TEXT NOT NULL, engine_version TEXT NOT NULL, mode TEXT NOT NULL, variation TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT 'magazine', scenario TEXT NOT NULL, state TEXT NOT NULL, result TEXT, status TEXT NOT NULL,
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS trust_attempts_guide ON trust_attempts (guide_id, block_id);
`;
const ready = new WeakSet<object>();
export function ensureTrustTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(TRUST_SCHEMA);
  ready.add(db);
}

type Status = "active" | "submitted" | "completed";
type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  scenario_version: string;
  scenario_hash: string;
  rubric_version: string;
  rules_version: string;
  engine_version: string;
  mode: string;
  variation: string;
  place: string;
  scenario: string;
  state: string;
  result: string | null;
  status: Status;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
};

const placeOf = (v: unknown) => (typeof v === "string" && /^topic:[a-z0-9-]{1,80}$/.test(v) ? v : "magazine");
const scenarioOf = (b: TrustCheckBlock): TrustData => {
  const rest: Record<string, unknown> = { ...b };
  delete rest.id;
  delete rest.type;
  return rest as unknown as TrustData;
};
export const scenarioHash = (d: TrustData) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureTrustTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "trustcheck") throw new HttpError(404, "That 28-Day Trust Check isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM trust_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM trust_attempts WHERE id = ?").get(id) as Row;
const frozen = (a: Row) => JSON.parse(a.scenario) as TrustData;
const stateOf = (a: Row): TrustState => ({ ...emptyState(a.variation), ...(JSON.parse(a.state) as Partial<TrustState>), variation: a.variation });

/** One event: ids, codes, counts and versions only, with a key so a consumer counts it once. Always marked fictional. */
function log(db: Db, a: Row, event: string, detail: object, now: Date, key = "") {
  const d = frozen(a);
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
      scenarioHash: a.scenario_hash,
      rubric: a.rubric_version,
      engine: a.engine_version,
      trust: TRUST_VERSION,
      policy: a.rules_version,
      mode: a.mode,
      variation: a.variation,
      place: a.place,
      theme: d.rationale.themeId,
      fictional: true,
      ...detail,
    }),
  );
}

export type TrustAttemptView = {
  attemptId: string | null;
  attemptNo: number;
  status: "new" | Status;
  view: TrustView | null;
  debrief: Debrief | null;
  attempts: number;
  versions: { trust: string; rubric: string; engine: string; scenario: string; rules: string };
  earlierScenario: boolean;
  block?: TrustCheckBlock;
  guideId?: string;
};

function view(db: Db, a: Row | undefined, block: TrustCheckBlock): TrustAttemptView {
  if (!a)
    return {
      attemptId: null,
      attemptNo: 0,
      status: "new",
      view: null,
      debrief: null,
      attempts: 0,
      versions: { trust: TRUST_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: block.scenarioVersion, rules: block.ruleSetId },
      earlierScenario: false,
    };
  const d = frozen(a);
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    view: trustView(d, stateOf(a)),
    debrief: a.result ? (JSON.parse(a.result) as Result).debrief : null,
    attempts: (
      db.prepare("SELECT COUNT(*) AS n FROM trust_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?").get(a.user_id, a.guide_id, a.block_id) as {
        n: number;
      }
    ).n,
    versions: { trust: TRUST_VERSION, rubric: a.rubric_version, engine: a.engine_version, scenario: a.scenario_version, rules: a.rules_version },
    earlierScenario: a.scenario_hash !== scenarioHash(scenarioOf(block)),
  };
}

/** The learner's own attempt. With `embed` (a Topic card), the readers' copy of the block comes with it. */
export function trustState(db: Db, user: User, guideId: string, blockId: unknown, opts: { embed?: boolean } = {}): TrustAttemptView {
  const { edition, block } = load(db, user, guideId, blockId);
  const v = view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  return opts.embed ? { ...v, block: trustForReaders(block), guideId: edition.guide.id } : v;
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: TrustCheckBlock, attemptNo: number, now: Date, place: string) {
  const d = scenarioOf(block);
  const usable = trustUsable(d, now.toISOString().slice(0, 10));
  if (!usable.ok) throw new HttpError(410, usable.reason);
  const variation = variationFor(d, attemptNo);
  const id = `tc-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO trust_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, scenario_version, scenario_hash, rubric_version, rules_version, engine_version, mode, variation, place, scenario, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    guideId,
    revisionId,
    block.id,
    user.id,
    attemptNo,
    d.scenarioVersion,
    scenarioHash(d),
    RUBRIC_VERSION,
    d.ruleSetId,
    ENGINE_VERSION,
    d.mode,
    variation,
    place,
    JSON.stringify(d),
    JSON.stringify(emptyState(variation)),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id)!;
  if (row.id === id) {
    log(db, row, "trust_check_opened", {}, now);
    log(db, row, "simulation_started", {}, now);
  }
  return row;
}

/** Start (or resume): the case is frozen now. A resent start returns the same attempt. */
export function startTrust(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id) ??
      create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place));
    return view(db, a, block);
  });
}

/** Logs what a move changed: ids and codes only. Never the concern or what the learner would say. */
function logChanges(db: Db, a: Row, d: TrustData, prev: TrustState, next: TrustState, now: Date) {
  for (const id of next.opened.filter((x) => !prev.opened.includes(x))) {
    const sg = d.signals.find((x) => x.id === id);
    log(db, a, "signal_viewed", { signal: id, group: sg?.group ?? "" }, now, id);
    if (sg?.checkpoint) log(db, a, "followup_checkpoint_viewed", { signal: id, checkpoint: sg.checkpoint }, now, id);
  }
  for (const [step, options] of Object.entries(next.answers).filter(([k]) => !prev.answers[k])) {
    const st = stepsFor(d, next.variation).find((x) => x.id === step);
    log(db, a, st?.signal || "decision_made", { step, options, phase: st?.phase ?? "" }, now, step);
  }
  if (next.proposed && !prev.proposed && next.plan) {
    const p = next.plan;
    log(
      db,
      a,
      "plan_proposed",
      { actions: p.actions, owner: p.owner, update: p.update, contingency: p.contingency, check: p.check, shared: p.share, said: Boolean(p.say) },
      now,
    );
  }
}

/** One move: open a signal, answer a decision, draft or propose the plan. */
export function moveTrust(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const move = parseMove(input.move);
  if (!move) throw new HttpError(400, "That isn’t a move in this case.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the case first.");
    if (a.status !== "active") return view(db, a, block);
    const d = frozen(a);
    const prev = stateOf(a);
    let next: TrustState;
    try {
      next = applyMove(d, prev, move);
    } catch (e) {
      if (e instanceof MoveError) throw new HttpError(409, e.message);
      throw e;
    }
    if (JSON.stringify(next) === JSON.stringify(prev)) return view(db, a, block);
    db.prepare("UPDATE trust_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now.toISOString(), a.id);
    logChanges(db, a, d, prev, next, now);
    return view(db, reread(db, a.id), block);
  });
}

type Result = {
  debrief: Debrief;
  score: number;
  dims: Record<Dim, number>;
  codes: string[];
  critical: string[];
  ending: string;
  defensible: boolean;
  passed: boolean | null;
};

/** Submit: the debrief is built from the frozen case and kept as given. A resent submit returns what's there. */
export function submitTrust(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the case first.");
    if (a.status !== "active") return view(db, a, block);
    const d = frozen(a);
    const s = stateOf(a);
    const problems = submitProblems(d, s);
    if (problems.length) throw Object.assign(new HttpError(400, problems[0]), { problems });
    const deb = buildDebrief(d, s);
    const result: Result = {
      debrief: deb,
      score: deb.score,
      dims: Object.fromEntries(deb.dims.map((x) => [x.dim, x.level])) as Record<Dim, number>,
      codes: deb.codes,
      critical: deb.critical.map((c) => c.code),
      ending: deb.ending,
      defensible: deb.defensible,
      passed: deb.passed,
    };
    const at = now.toISOString();
    db.prepare("UPDATE trust_attempts SET result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    for (const c of result.critical) log(db, a, "critical_rule_flagged", { code: c }, now, c);
    log(
      db,
      a,
      "response_submitted",
      { ending: deb.ending, defensible: deb.defensible, score: deb.score, dims: result.dims, codes: deb.codes, critical: result.critical },
      now,
    );
    if (a.mode === "assessed") log(db, a, "assessment_attempted", { score: deb.score, passMark: d.passMark, critical: result.critical.length }, now);
    return view(db, reread(db, a.id), block);
  });
}

/** The debrief has been viewed: now it's complete. Once only. */
export function viewedTrust(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block);
    const r = JSON.parse(a.result ?? "{}") as Result;
    db.prepare("UPDATE trust_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(now.toISOString(), now.toISOString(), a.id);
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { ending: r.ending, score: r.score }, now);
    if (a.mode === "assessed" && r.passed) log(db, a, "assessment_passed", { score: r.score }, now);
    return view(db, reread(db, a.id), block);
  });
}

/** Try again: a fresh attempt with the next variation. The finished one keeps its own versions and debrief. */
export function retryTrust(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a && a.status === "active") return view(db, a, block);
    if (a && typeof input.from === "string" && input.from !== a.id) return view(db, a, block);
    const row = create(db, user, edition.guide.id, edition.revision.id, block, (a?.attempt_no ?? 0) + 1, now, placeOf(input.place));
    if (a) log(db, row, "retry_started", { from: a.id }, now);
    return view(db, reread(db, row.id), block);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors and the decision register: totals only, never who did what
// ---------------------------------------------------------------------------------------------

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

type Firsts = Map<string, Result>;
const firstsOf = (rows: Pick<Row, "user_id" | "result">[]) => {
  const out: Firsts = new Map();
  for (const r of rows) if (r.result && !out.has(r.user_id)) out.set(r.user_id, JSON.parse(r.result) as Result);
  return out;
};
const tally = (firsts: Firsts, f: (x: Result) => string[]) => {
  const out: Record<string, number> = {};
  for (const x of firsts.values()) for (const k of f(x)) out[k] = (out[k] ?? 0) + 1;
  return out;
};

/** Totals for the course's authors: started, submitted, completed, retried; with five people or more, levels, endings and codes. */
export function trustStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureTrustTables(db);
  const rows = db
    .prepare(
      "SELECT block_id, user_id, status, result, attempt_no, scenario_version, rubric_version, variation FROM trust_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<Row, "block_id" | "user_id" | "status" | "result" | "attempt_no" | "scenario_version" | "rubric_version" | "variation">[];
  const blocks = new Map<string, typeof rows>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return {
    // Learning evidence from a fictional case: never an operational outcome, a retention figure or a real person's case.
    mode: "fictional" as const,
    blocks: [...blocks.entries()].map(([blockId, rs]) => {
      const firsts = firstsOf(rs);
      const small = firsts.size < SMALL_COHORT;
      return {
        blockId,
        attempts: rs.length,
        people: new Set(rs.map((r) => r.user_id)).size,
        submitted: rs.filter((r) => r.status !== "active").length,
        completed: rs.filter((r) => r.status === "completed").length,
        retries: rs.filter((r) => r.attempt_no > 1).length,
        counted: firsts.size,
        suppressed: small,
        versions: [...new Set(rs.map((r) => `${r.scenario_version} · ${r.rubric_version}`))],
        dims: small
          ? null
          : (Object.fromEntries(
              DIM_ORDER.map((k) => {
                const l = [0, 0, 0, 0];
                for (const x of firsts.values()) l[x.dims[k] ?? 0] += 1;
                return [k, l];
              }),
            ) as Record<Dim, number[]>),
        endings: small ? null : tally(firsts, (x) => [x.ending]),
        codes: small ? null : tally(firsts, (x) => x.codes),
        critical: small ? null : [...firsts.values()].filter((x) => x.critical.length).length,
      };
    }),
  };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string };
/** Published courses holding a 28-Day Trust Check, with each block. */
export function publishedTrustChecks(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"trustcheck\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is TrustCheckBlock => b.type === "trustcheck")
      .map((b) => ({ guide: g, block: b })),
  );
}

/**
  The decision register's "Trust checks" sheet (server/problemDesk export): each published block with its scenario,
  rule set, theme and rationale decision, audience, reviewers, practice results by rubric dimension, endings, critical
  errors and the separately owned work measure. Fictional practice evidence only; fewer than five people show counts only.
*/
export function trustRegister(db: Db) {
  ensureTrustTables(db);
  return publishedTrustChecks(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT user_id, status, result, attempt_no FROM trust_attempts WHERE guide_id = ? AND block_id = ? ORDER BY attempt_no")
      .all(guide.id, block.id) as Pick<Row, "user_id" | "status" | "result" | "attempt_no">[];
    const firsts = firstsOf(rows);
    const small = firsts.size < SMALL_COHORT;
    const mean = (k: Dim) => (small ? "" : Math.round(([...firsts.values()].reduce((n, x) => n + (x.dims[k] ?? 0), 0) / firsts.size) * 10) / 10);
    const list = (o: Record<string, number>) =>
      Object.entries(o)
        .map(([k, n]) => `${k} ${n}`)
        .join("; ");
    const a = block.approval;
    return {
      blockId: block.id,
      guideId: guide.id,
      guide: guide.title,
      title: block.title,
      scenario: block.scenarioVersion,
      rules: block.ruleSetId,
      theme: block.rationale.signal,
      rationaleDecision: block.rationale.decision || "Not decided",
      jobAid: block.jobAid.snippetId,
      audience: (() => {
        try {
          return (JSON.parse(guide.audience) as string[]).join(", ") || "Everyone signed in";
        } catch {
          return guide.audience || "Everyone signed in";
        }
      })(),
      reviewBy: a.reviewBy,
      reviewers:
        [a.owner, a.operations, a.quality, a.policy, a.finance, a.clinical, a.partnerships, a.privacy, a.learning].filter(Boolean).join("; ") ||
        "Not signed off",
      started: new Set(rows.map((r) => r.user_id)).size,
      submitted: rows.filter((r) => r.status !== "active").length,
      completed: rows.filter((r) => r.status === "completed").length,
      retries: rows.filter((r) => r.attempt_no > 1).length,
      people: firsts.size,
      suppressed: small,
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, mean(k)])) as Record<Dim, number | "">,
      critical: small ? "" : [...firsts.values()].filter((x) => x.critical.length).length,
      endings: small ? "" : list(tally(firsts, (x) => [x.ending])),
      codes: small ? "" : list(tally(firsts, (x) => x.codes)),
      measure: block.rationale.measure,
    };
  });
}
