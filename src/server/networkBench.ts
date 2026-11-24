import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type NetworkBlock } from "@/lib/magazine";
import {
  applyMove,
  benchView,
  BENCH_VERSION,
  buildDebrief,
  DIM_ORDER,
  emptyState,
  MoveError,
  networkForReaders,
  parseMove,
  RUBRIC_VERSION,
  RULES_VERSION,
  submitProblems,
  variationFor,
  type BenchState,
  type BenchView,
  type Debrief,
  type Dim,
  type NetworkData,
} from "@/lib/networkBench";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Build Your Local Bench on the server (docs/network-builder.md), in the Discharge Pivot's pattern:

  - An attempt freezes the case it started on (the block's data and its hash), so a refresh resumes it and a later
    edit never changes a historical result.
  - Every move is replayed through the same pure engine the editor's preview uses (lib/networkBench). A move that has
    already happened changes nothing, so a network retry never duplicates a choice, a draft, a score or an event.
  - The order is enforced here: open a card and diagnose, decide, draft the brief, the reveal, plan the rest, review
    quality, submit; the debrief is sent once, and completion follows only when it has been viewed.
  - Events carry ids, levels, codes, counts and versions, with an idempotency key: never typed words (the outreach
    fields stay in the attempt), never a fictional person's details. A copied draft is logged as copied, never sent.
  - The table is created here (ensureNetworkTables), not in server/db, so a running server picks it up.

  No AI is called, and nothing here reads or writes a real participant, contractor, onboarding, schedule or quality
  record. Every figure is the fictional case's.
*/

export const NETWORK_SCHEMA = `
CREATE TABLE IF NOT EXISTS network_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL, rubric_version TEXT NOT NULL,
  rules_version TEXT NOT NULL, bench_version TEXT NOT NULL, mode TEXT NOT NULL, variation TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT 'magazine', scenario TEXT NOT NULL, state TEXT NOT NULL, result TEXT, status TEXT NOT NULL,
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS network_attempts_guide ON network_attempts (guide_id, block_id);
`;
const ready = new WeakSet<object>();
export function ensureNetworkTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(NETWORK_SCHEMA);
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
  bench_version: string;
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
const scenarioOf = (b: NetworkBlock): NetworkData => {
  const rest: Record<string, unknown> = { ...b };
  delete rest.id;
  delete rest.type;
  return rest as unknown as NetworkData;
};
export const scenarioHash = (d: NetworkData) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureNetworkTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "network") throw new HttpError(404, "That Build Your Local Bench block isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM network_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM network_attempts WHERE id = ?").get(id) as Row;
const frozen = (a: Row) => JSON.parse(a.scenario) as NetworkData;
const stateOf = (a: Row): BenchState => ({ ...emptyState(a.variation), ...(JSON.parse(a.state) as Partial<BenchState>), variation: a.variation });

/** One event: ids, codes, counts and versions only, with a key so a consumer counts it once. Always marked fictional. */
function log(db: Db, a: Row, event: string, detail: object, now: Date, key = "") {
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
      rules: a.rules_version,
      bench: a.bench_version,
      mode: a.mode,
      variation: a.variation,
      place: a.place,
      fictional: true,
      ...detail,
    }),
  );
}

export type NetworkView = {
  attemptId: string | null;
  attemptNo: number;
  status: "new" | Status;
  view: BenchView | null;
  debrief: Debrief | null;
  attempts: number;
  versions: { bench: string; rubric: string; rules: string; scenario: string };
  earlierScenario: boolean;
  block?: NetworkBlock;
  guideId?: string;
};

function view(db: Db, a: Row | undefined, block: NetworkBlock): NetworkView {
  if (!a)
    return {
      attemptId: null,
      attemptNo: 0,
      status: "new",
      view: null,
      debrief: null,
      attempts: 0,
      versions: { bench: BENCH_VERSION, rubric: RUBRIC_VERSION, rules: RULES_VERSION, scenario: block.scenarioVersion },
      earlierScenario: false,
    };
  const d = frozen(a);
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    view: benchView(d, stateOf(a)),
    debrief: a.result ? (JSON.parse(a.result) as Result).debrief : null,
    attempts: (
      db.prepare("SELECT COUNT(*) AS n FROM network_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?").get(a.user_id, a.guide_id, a.block_id) as {
        n: number;
      }
    ).n,
    versions: { bench: a.bench_version, rubric: a.rubric_version, rules: a.rules_version, scenario: a.scenario_version },
    earlierScenario: a.scenario_hash !== scenarioHash(scenarioOf(block)),
  };
}

/** The learner's own attempt. With `embed` (a Topic card), the readers' copy of the block comes with it. */
export function networkState(db: Db, user: User, guideId: string, blockId: unknown, opts: { embed?: boolean } = {}): NetworkView {
  const { edition, block } = load(db, user, guideId, blockId);
  const v = view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  return opts.embed ? { ...v, block: networkForReaders(block), guideId: edition.guide.id } : v;
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: NetworkBlock, attemptNo: number, now: Date, place: string) {
  const d = scenarioOf(block);
  const variation = variationFor(d, attemptNo);
  const id = `nb-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO network_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, scenario_version, scenario_hash, rubric_version, rules_version, bench_version, mode, variation, place, scenario, state, status, started_at, updated_at)
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
    RULES_VERSION,
    BENCH_VERSION,
    d.mode,
    variation,
    place,
    JSON.stringify(d),
    JSON.stringify(emptyState(variation)),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id)!;
  if (row.id === id) log(db, row, "network_builder_opened", {}, now);
  return row;
}

/** Start (or resume): the case is frozen now. A resent start returns the same attempt. */
export function startNetwork(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id) ??
      create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place));
    return view(db, a, block);
  });
}

/** Logs what a move changed. Never the outreach text: only that a draft was generated or edited, its profile and its problem count. */
function logChanges(db: Db, a: Row, d: NetworkData, prev: BenchState, next: BenchState, now: Date) {
  for (const c of next.opened.filter((x) => !prev.opened.includes(x))) log(db, a, "candidate_card_opened", { card: c }, now, c);
  if (next.diagnosis && !prev.diagnosis)
    log(db, a, "gap_reviewed", { measure: next.diagnosis.measure, counted: next.diagnosis.counted.length }, now, "diagnosis");
  for (const [step, option] of Object.entries(next.answers).filter(([k]) => !prev.answers[k])) {
    const st = d.steps.find((x) => x.id === step);
    log(db, a, "decision_made", { step, option, phase: st?.phase ?? "" }, now, step);
    if (st?.signal) log(db, a, st.signal, { step, option }, now, step);
  }
  if (next.outreach && JSON.stringify(next.outreach) !== JSON.stringify(prev.outreach) && next.outreach.copied === prev.outreach?.copied)
    log(
      db,
      a,
      prev.outreach ? "outreach_draft_edited" : "outreach_draft_generated",
      { profile: next.outreach.profile },
      now,
      `${Object.values(next.outreach.fields).join("|").length}:${next.outreach.profile}:${createHash("sha1").update(JSON.stringify(next.outreach.fields)).digest("hex").slice(0, 8)}`,
    );
  if (next.outreach?.copied && !prev.outreach?.copied) log(db, a, "outreach_draft_copied", { profile: next.outreach.profile, sent: false }, now);
  if (next.outreach && next.outreach.profile !== prev.outreach?.profile)
    log(db, a, "onboarding_checklist_opened", { profile: next.outreach.profile }, now, next.outreach.profile);
  if (next.revealed && !prev.revealed) log(db, a, "readiness_status_viewed", { stage: "reveal" }, now);
}

/** One move: open a card, diagnose, decide, draft or copy the brief, or see the reveal. */
export function moveNetwork(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const move = parseMove(input.move);
  if (!move) throw new HttpError(400, "That isn’t a move in this case.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the case first.");
    if (a.status !== "active") return view(db, a, block);
    const d = frozen(a);
    const prev = stateOf(a);
    let next: BenchState;
    try {
      next = applyMove(d, prev, move);
    } catch (e) {
      if (e instanceof MoveError) throw new HttpError(409, e.message);
      throw e;
    }
    if (JSON.stringify(next) === JSON.stringify(prev)) return view(db, a, block);
    db.prepare("UPDATE network_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now.toISOString(), a.id);
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
  valid: boolean;
  passed: boolean | null;
  diagnosed: boolean;
  profile: string;
};

/** Submit: the debrief is built from the frozen case and kept as given. A resent submit returns what's there. */
export function submitNetwork(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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
      valid: deb.valid,
      passed: deb.passed,
      diagnosed: deb.dims.find((x) => x.dim === "diagnosis")?.level === 3,
      profile: s.outreach?.profile ?? "",
    };
    const at = now.toISOString();
    db.prepare("UPDATE network_attempts SET result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "response_submitted",
      { ending: deb.ending, valid: deb.valid, score: deb.score, dims: result.dims, codes: deb.codes, critical: result.critical },
      now,
    );
    if (a.mode === "assessed") log(db, a, "assessment_attempted", { score: deb.score, passMark: d.passMark, critical: result.critical.length }, now);
    return view(db, reread(db, a.id), block);
  });
}

/** The debrief has been viewed: now it's complete. Once only. */
export function viewedNetwork(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block);
    const r = JSON.parse(a.result ?? "{}") as Result;
    db.prepare("UPDATE network_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(
      now.toISOString(),
      now.toISOString(),
      a.id,
    );
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { ending: r.ending, score: r.score }, now);
    if (a.mode === "assessed" && r.passed) log(db, a, "assessment_passed", { score: r.score }, now);
    return view(db, reread(db, a.id), block);
  });
}

/** Try again: a fresh attempt with the next variation. The finished one keeps its own versions and debrief. */
export function retryNetwork(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
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
export function networkStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureNetworkTables(db);
  const rows = db
    .prepare(
      "SELECT block_id, user_id, status, result, attempt_no, scenario_version, rubric_version FROM network_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<Row, "block_id" | "user_id" | "status" | "result" | "attempt_no" | "scenario_version" | "rubric_version">[];
  const blocks = new Map<string, typeof rows>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return {
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
function publishedBenches(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"network\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is NetworkBlock => b.type === "network")
      .map((b) => ({ guide: g, block: b })),
  );
}

/**
  The decision register's "Network Builder" sheet (server/problemDesk export): each published block with its scenario,
  theme and rationale decision, audience, reviewers, practice results by rubric dimension, critical errors and the
  separately owned work measure. Practice evidence only, fictional throughout; fewer than five people show counts only.
*/
export function networkRegister(db: Db) {
  ensureNetworkTables(db);
  return publishedBenches(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT user_id, status, result, attempt_no FROM network_attempts WHERE guide_id = ? AND block_id = ? ORDER BY attempt_no")
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
        [a.owner, a.operations, a.onboarding, a.quality, a.partnerships, a.finance, a.privacy, a.learning].filter(Boolean).join("; ") || "Not signed off",
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
