import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type DischargeBlock } from "@/lib/magazine";
import {
  applyMove,
  buildDebrief,
  cleanHandover,
  cleanState,
  derive,
  deskView,
  DIM_ORDER,
  dischargeForReaders,
  emptyState,
  ENGINE_VERSION,
  handoverProblems,
  MoveError,
  parseMove,
  PIVOT_VERSION,
  pivotUsable,
  readyNow,
  RUBRIC_VERSION,
  sourcesOf,
  variationFor,
  type Debrief,
  type DeskView,
  type DischargeData,
  type Dim,
  type PivotState,
} from "@/lib/dischargePivot";
import { dischargeSource, dischargeSourceStatus } from "@/lib/dischargeSources";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  The 72-Hour Discharge Pivot on the server (docs/discharge-pivot.md).

  - An attempt freezes the scenario it started on (the block's data, its hash and versions), so a refresh resumes the
    same desk and a later edit or republish never changes a historical result. A republished course starts a fresh
    attempt; old ones stay as they were.
  - Every move is replayed through the same pure engine the editor's preview uses (lib/dischargePivot). A move that
    has already happened changes nothing (an action is taken once; a wait is keyed by the minute it starts), so a
    network retry never duplicates an action, a score or an event.
  - The order is enforced here: the desk, then the handover, then the debrief (sent only once the handover is
    submitted), then completion when the debrief has been viewed. An opened page, a moved card or the clock reaching
    the discharge time is never completion.
  - Events carry ids, counts, levels, codes and versions, with an idempotency key: never free text (there's none to
    type) and never a fictional clinical detail.
  - The table is created here (ensureDischargeTables), not in server/db, so a running server picks it up.

  No AI is called anywhere in it, and nothing here books, messages, claims or changes a record.
*/

export const DISCHARGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS discharge_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL, rubric_version TEXT NOT NULL,
  engine_version TEXT NOT NULL, pivot_version TEXT NOT NULL, mode TEXT NOT NULL, variation TEXT NOT NULL DEFAULT '',
  place TEXT NOT NULL DEFAULT 'magazine', scenario TEXT NOT NULL, state TEXT NOT NULL, result TEXT, status TEXT NOT NULL,
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS discharge_attempts_guide ON discharge_attempts (guide_id, block_id);
`;
const ready = new WeakSet<object>();
export function ensureDischargeTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(DISCHARGE_SCHEMA);
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
  engine_version: string;
  pivot_version: string;
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

const today = (now: Date) => now.toISOString().slice(0, 10);
const placeOf = (v: unknown) => (typeof v === "string" && /^topic:[a-z0-9-]{1,80}$/.test(v) ? v : "magazine");
/** The scenario as data, without the block's id: what an attempt is frozen to. */
const scenarioOf = (b: DischargeBlock): DischargeData => {
  const rest: Record<string, unknown> = { ...b };
  delete rest.id;
  delete rest.type;
  return rest as unknown as DischargeData;
};
export const scenarioHash = (d: DischargeData) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureDischargeTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "discharge") throw new HttpError(404, "That discharge simulation isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM discharge_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM discharge_attempts WHERE id = ?").get(id) as Row;
const frozen = (a: Row) => JSON.parse(a.scenario) as DischargeData;
const stateOf = (a: Row) => cleanState(frozen(a), { ...JSON.parse(a.state), variation: a.variation });

/** One event in the Hub's activity log: ids, codes, counts and versions only, with a key so a consumer counts it once. */
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
      engine: a.engine_version,
      pivot: a.pivot_version,
      mode: a.mode,
      variation: a.variation,
      place: a.place,
      ...detail,
    }),
  );
}

export type DischargeView = {
  attemptId: string | null;
  attemptNo: number;
  status: "new" | Status;
  desk: DeskView | null;
  /** The debrief this attempt was given, as it was given: never recomputed. */
  debrief: Debrief | null;
  attempts: number;
  usable: { ok: boolean; reason: string };
  versions: { pivot: string; rubric: string; engine: string; scenario: string };
  /** The attempt began on an earlier version of this block's scenario. */
  earlierScenario: boolean;
  block?: DischargeBlock;
  guideId?: string;
};

function view(db: Db, a: Row | undefined, block: DischargeBlock, now: Date): DischargeView {
  const usable = pivotUsable(block, today(now));
  if (!a)
    return {
      attemptId: null,
      attemptNo: 0,
      status: "new",
      desk: null,
      debrief: null,
      attempts: 0,
      usable,
      versions: { pivot: PIVOT_VERSION, rubric: RUBRIC_VERSION, engine: ENGINE_VERSION, scenario: block.scenarioVersion },
      earlierScenario: false,
    };
  const d = frozen(a);
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    desk: deskView(d, stateOf(a)),
    debrief: a.result ? (JSON.parse(a.result) as Result).debrief : null,
    attempts: (
      db.prepare("SELECT COUNT(*) AS n FROM discharge_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?").get(a.user_id, a.guide_id, a.block_id) as {
        n: number;
      }
    ).n,
    usable,
    versions: { pivot: a.pivot_version, rubric: a.rubric_version, engine: a.engine_version, scenario: a.scenario_version },
    earlierScenario: a.scenario_hash !== scenarioHash(scenarioOf(block)),
  };
}

/** The learner's own attempt. With `embed` (a Topic card), the readers' copy of the block comes with it. */
export function dischargeState(db: Db, user: User, guideId: string, blockId: unknown, opts: { embed?: boolean } = {}, now = new Date()): DischargeView {
  const { edition, block } = load(db, user, guideId, blockId);
  const v = view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  return opts.embed ? { ...v, block: dischargeForReaders(block), guideId: edition.guide.id } : v;
}

function create(db: Db, user: User, guideId: string, revisionId: string, block: DischargeBlock, attemptNo: number, now: Date, place: string, mode: unknown) {
  const usable = pivotUsable(block, today(now));
  if (!usable.ok) throw new HttpError(block.mode === "assessed" ? 409 : 410, usable.reason);
  const d = scenarioOf(block);
  const variation = variationFor(d, attemptNo);
  const state = applyMove(d, emptyState(variation), { do: "start", mode: mode === "untimed" ? "untimed" : "timed" });
  const id = `dp-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO discharge_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, scenario_version, scenario_hash, rubric_version, engine_version, pivot_version, mode, variation, place, scenario, state, status, started_at, updated_at)
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
    ENGINE_VERSION,
    PIVOT_VERSION,
    d.mode,
    variation,
    place,
    JSON.stringify(d),
    JSON.stringify(state),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id)!;
  if (row.id === id) log(db, row, "activity_started", { play: state.mode }, now);
  return row;
}

/** Start (or resume): the scenario is frozen now, in the chosen play (with the story clock, or untimed). A resent start returns the same attempt. */
export function startDischarge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id) ??
      create(db, user, edition.guide.id, edition.revision.id, block, 1, now, placeOf(input.place), input.mode);
    return view(db, a, block, now);
  });
}

/** Logs what a move changed: the fields checked, the decisions, the specialist signals and confirmations received. */
function logChanges(db: Db, a: Row, d: DischargeData, prev: PivotState, next: PivotState, now: Date) {
  for (const f of next.inspected.filter((x) => !prev.inspected.includes(x))) log(db, a, "handover_field_checked", { fact: f }, now, f);
  const before = derive(d, prev);
  const after = derive(d, next);
  for (const t of after.taken.filter((x) => !prev.taken.some((p) => p.id === x.action.id))) {
    log(db, a, "action_taken", { action: t.action.id, lane: t.action.lane, minute: t.at, codes: t.codes }, now, t.action.id);
    if (t.action.signal) log(db, a, t.action.signal, { action: t.action.id, minute: t.at }, now, t.action.id);
  }
  for (const r of after.released.filter((x) => x.alert.confirms && !before.released.some((p) => p.alert.id === x.alert.id)))
    log(db, a, "service_confirmation_received", { alert: r.alert.id, minute: r.at }, now, r.alert.id);
  if (next.stage === "handover" && prev.stage !== "handover")
    log(
      db,
      a,
      "readiness_status_viewed",
      { ready: readyNow(d, after), gates: Object.fromEntries(Object.entries(after.gates).map(([k, g]) => [k, g.status])), minute: next.clock },
      now,
      `${next.clock}:${next.taken.length}`,
    );
  if (next.paused !== prev.paused)
    log(db, a, next.paused ? "activity_paused" : "activity_resumed", { minute: next.clock }, now, `${next.clock}:${next.taken.length}:${next.paused}`);
}

/** One move on the desk: check a field, read an alert, take an action, wait, pause or resume, go to the handover, or save it. */
export function moveDischarge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const move = parseMove(input.move);
  if (!move) throw new HttpError(400, "That isn’t a move on the desk.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the simulation first.");
    if (a.status !== "active") return view(db, a, block, now);
    const d = frozen(a);
    const prev = stateOf(a);
    let next: PivotState;
    try {
      next = applyMove(d, prev, move);
    } catch (e) {
      if (e instanceof MoveError) throw new HttpError(409, e.message);
      throw e;
    }
    if (JSON.stringify(next) === JSON.stringify(prev)) return view(db, a, block, now);
    db.prepare("UPDATE discharge_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now.toISOString(), a.id);
    logChanges(db, a, d, prev, next, now);
    return view(db, reread(db, a.id), block, now);
  });
}

type Result = {
  debrief: Debrief;
  score: number;
  dims: Record<Dim, number>;
  codes: string[];
  critical: string[];
  ending: string;
  passed: boolean | null;
  recognised: number | null;
  gaps: string[];
};

/** Submit the handover: the debrief is built from the frozen scenario and kept as given. A resent submit returns what's there. */
export function submitDischarge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a) throw new HttpError(409, "Start the simulation first.");
    if (a.status !== "active") return view(db, a, block, now);
    const d = frozen(a);
    const prev = stateOf(a);
    const s: PivotState = input.handover === undefined ? prev : { ...prev, handover: cleanHandover(d, input.handover) };
    const problems = handoverProblems(d, s);
    if (problems.length) throw Object.assign(new HttpError(400, `Not yet. ${problems[0]}`), { problems });
    const deb = buildDebrief(d, s);
    const x = derive(d, s);
    const result: Result = {
      debrief: deb,
      score: deb.score,
      dims: Object.fromEntries(deb.dims.map((y) => [y.dim, y.level])) as Record<Dim, number>,
      codes: deb.codes,
      critical: deb.critical.map((c) => c.code),
      ending: deb.ending,
      passed: deb.passed,
      recognised: deb.recognised,
      gaps: d.gates.filter((g) => g.essential && x.gates[g.id].status !== "confirmed").map((g) => g.id),
    };
    const at = now.toISOString();
    db.prepare("UPDATE discharge_attempts SET state = ?, result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(s),
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "handover_submitted",
      {
        declaration: s.handover.declaration,
        stated: Object.fromEntries(Object.entries(s.handover.gates).map(([k, g]) => [k, g.status])),
        answers: s.handover.answers,
        minute: s.clock,
      },
      now,
    );
    log(
      db,
      a,
      "response_submitted",
      {
        ending: deb.ending,
        score: deb.score,
        dims: result.dims,
        codes: deb.codes,
        critical: result.critical,
        gaps: result.gaps,
        recognised: deb.recognised,
        actions: x.taken.length,
        minute: s.clock,
        play: s.mode,
      },
      now,
    );
    if (a.mode === "assessed") log(db, a, "assessment_attempted", { score: deb.score, passMark: d.passMark, critical: result.critical.length }, now);
    return view(db, reread(db, a.id), block, now);
  });
}

/** The debrief has been viewed: now it's complete (and, in assessed mode, passed if it was). Once only. */
export function viewedDischarge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block, now);
    const r = JSON.parse(a.result ?? "{}") as Result;
    db.prepare("UPDATE discharge_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(
      now.toISOString(),
      now.toISOString(),
      a.id,
    );
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { ending: r.ending, score: r.score }, now);
    if (a.mode === "assessed" && r.passed) log(db, a, "assessment_passed", { score: r.score }, now);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Try again: a fresh attempt with the next variation. The finished one is kept with its own versions and debrief. */
export function retryDischarge(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    // A resent retry, or one while an attempt is still open, returns the open attempt.
    if (a && a.status === "active") return view(db, a, block, now);
    if (a && typeof input.from === "string" && input.from !== a.id) return view(db, a, block, now);
    const row = create(db, user, edition.guide.id, edition.revision.id, block, (a?.attempt_no ?? 0) + 1, now, placeOf(input.place), input.mode);
    if (a) log(db, row, "retry_started", { from: a.id }, now);
    return view(db, reread(db, row.id), block, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors and Quality: totals, placements and the decision register
// ---------------------------------------------------------------------------------------------

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: started, submitted, completed, retried; and, with enough people (each person's first
  submitted attempt), the rubric levels, endings, codes, gates left open and time to recognise the unfilled visit in
  the simulation. Never who did what.
*/
export function dischargeStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureDischargeTables(db);
  const rows = db
    .prepare(
      "SELECT block_id, user_id, status, result, attempt_no, scenario_version, rubric_version FROM discharge_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<Row, "block_id" | "user_id" | "status" | "result" | "attempt_no" | "scenario_version" | "rubric_version">[];
  const blocks = new Map<string, typeof rows>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return {
    blocks: [...blocks.entries()].map(([blockId, rs]) => {
      const firsts = new Map<string, Result>();
      for (const r of rs) if (r.result && !firsts.has(r.user_id)) firsts.set(r.user_id, JSON.parse(r.result) as Result);
      const small = firsts.size < SMALL_COHORT;
      const tally = (f: (x: Result) => string[]) => {
        const out: Record<string, number> = {};
        for (const x of firsts.values()) for (const k of f(x)) out[k] = (out[k] ?? 0) + 1;
        return out;
      };
      const rec = [...firsts.values()].map((x) => x.recognised).filter((n): n is number => n !== null);
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
        endings: small ? null : tally((x) => [x.ending]),
        codes: small ? null : tally((x) => x.codes),
        gapsLeftOpen: small ? null : tally((x) => x.gaps),
        critical: small ? null : [...firsts.values()].filter((x) => x.critical.length).length,
        passed: small ? null : [...firsts.values()].filter((x) => x.passed).length,
        /** Story minutes from the provider declining to the first escalation, in the simulation only. */
        recognisedMedian: small || !rec.length ? null : [...rec].sort((p, q) => p - q)[Math.floor(rec.length / 2)],
      };
    }),
  };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string };
function publishedPivots(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"discharge\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is DischargeBlock => b.type === "discharge")
      .map((b) => ({ guide: g, block: b })),
  );
}

/** Topics whose published version places a discharge simulation on a card. */
function topicPlacements(db: Db) {
  const rows = db
    .prepare("SELECT slug, published FROM authored_lessons WHERE published IS NOT NULL AND published LIKE '%\"pivotRef\"%' AND deleted_at IS NULL")
    .all() as { slug: string; published: string }[];
  return rows.flatMap((r) => {
    const l = JSON.parse(r.published) as { title?: string; nodes?: Record<string, { id: string; pivotRef?: { guide: string; block: string } }> };
    return Object.values(l.nodes ?? {})
      .filter((n) => n.pivotRef)
      .map((n) => ({ topic: r.slug, title: l.title ?? r.slug, card: n.id, guide: n.pivotRef!.guide, block: n.pivotRef!.block }));
  });
}
const placementsOf = (topics: ReturnType<typeof topicPlacements>, guide: GuideRow, blockId: string) => [
  `Magazine: ${guide.title}`,
  ...topics.filter((t) => (t.guide === guide.slug || t.guide === guide.id) && t.block === blockId).map((t) => `Topic: ${t.title} (card ${t.card})`),
];

/**
  For the Topic editor and Quality: every published discharge simulation, where it's live, its scenario version, and
  each source it rests on with its status. With `source`, only those citing it, so a policy change can be traced to
  every live placement.
*/
export function dischargePlacements(db: Db, actor: User, now: Date, opts: { source?: string } = {}) {
  requireAuthor(actor);
  const topics = topicPlacements(db);
  return {
    pivots: publishedPivots(db)
      .map(({ guide, block }) => ({
        guide: guide.slug,
        guideId: guide.id,
        guideTitle: guide.title,
        block: block.id,
        title: block.title,
        participant: block.participant.name,
        scenario: block.scenarioVersion,
        usable: pivotUsable(block, today(now)),
        sources: sourcesOf(block).map((id) => ({ id, title: dischargeSource(id)?.title ?? id, status: dischargeSourceStatus(id, today(now)) })),
        placements: placementsOf(topics, guide, block.id),
      }))
      .filter((p) => !opts.source || p.sources.some((s) => s.id === opts.source)),
  };
}

/**
  The decision register's "Discharge simulations" sheet (server/problemDesk export): each published simulation with its
  scenario, placements, theme and rationale decision, audience, dates, reviewers, practice results by rubric dimension,
  critical errors, gates most often left open, time to recognise the unfilled visit in the simulation, and the
  separately owned work measure. Practice evidence only; fewer than five people show counts only.
*/
export function dischargeRegister(db: Db, now: Date) {
  ensureDischargeTables(db);
  const topics = topicPlacements(db);
  return publishedPivots(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT user_id, status, result, attempt_no FROM discharge_attempts WHERE guide_id = ? AND block_id = ? ORDER BY attempt_no")
      .all(guide.id, block.id) as Pick<Row, "user_id" | "status" | "result" | "attempt_no">[];
    const firsts = new Map<string, Result>();
    for (const r of rows) if (r.result && !firsts.has(r.user_id)) firsts.set(r.user_id, JSON.parse(r.result) as Result);
    const small = firsts.size < SMALL_COHORT;
    const mean = (k: Dim) => (small ? "" : Math.round(([...firsts.values()].reduce((n, x) => n + (x.dims[k] ?? 0), 0) / firsts.size) * 10) / 10);
    const count = (f: (x: Result) => string[]) => {
      const out: Record<string, number> = {};
      for (const x of firsts.values()) for (const k of f(x)) out[k] = (out[k] ?? 0) + 1;
      return Object.entries(out)
        .map(([k, n]) => `${k} ${n}`)
        .join("; ");
    };
    const rec = [...firsts.values()].map((x) => x.recognised).filter((n): n is number => n !== null);
    const a = block.approval;
    const usable = pivotUsable(block, today(now));
    return {
      blockId: block.id,
      guideId: guide.id,
      guide: guide.title,
      title: block.title,
      scenario: block.scenarioVersion,
      status: usable.ok ? "In use" : usable.reason,
      placements: placementsOf(topics, guide, block.id),
      theme: [block.rationale.themeId, block.rationale.theme].filter(Boolean).join(": "),
      rationaleDecision: block.rationale.decision || "Not decided",
      jobAid: block.jobAid.snippetId,
      audience: (() => {
        try {
          return (JSON.parse(guide.audience) as string[]).join(", ") || "Everyone signed in";
        } catch {
          return guide.audience || "Everyone signed in";
        }
      })(),
      effectiveFrom: a.effectiveFrom,
      reviewBy: a.reviewBy,
      reviewers: [a.owner, a.clinical, a.operations, a.policy, a.process, a.learning].filter(Boolean).join("; ") || "Not signed off",
      mode: block.mode,
      started: new Set(rows.map((r) => r.user_id)).size,
      submitted: rows.filter((r) => r.status !== "active").length,
      completed: rows.filter((r) => r.status === "completed").length,
      retries: rows.filter((r) => r.attempt_no > 1).length,
      people: firsts.size,
      suppressed: small,
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, mean(k)])) as Record<Dim, number | "">,
      critical: small ? "" : [...firsts.values()].filter((x) => x.critical.length).length,
      passed: small || block.mode !== "assessed" ? "" : [...firsts.values()].filter((x) => x.passed).length,
      codes: small ? "" : count((x) => x.codes),
      gaps: small ? "" : count((x) => x.gaps),
      recognised: small || !rec.length ? "" : [...rec].sort((p, q) => p - q)[Math.floor(rec.length / 2)],
      measure: block.rationale.measure,
    };
  });
}
