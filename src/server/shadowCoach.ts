import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type ShadowCoachBlock } from "@/lib/magazine";
import {
  applyMove,
  buildDebrief,
  contentRefs,
  DIM_ORDER,
  emptyState,
  ENGINE_VERSION,
  isCritical,
  isReviewRequest,
  MoveError,
  OUTCOMES,
  parseMove,
  phaseOf,
  RUBRIC_VERSION,
  scenarioOf,
  SHADOW_VERSION,
  shadowForReaders,
  shadowUsable,
  shadowView,
  submitProblems,
  type AvailMap,
  type ContentRef,
  type Debrief,
  type Dim,
  type History,
  type ShadowData,
  type ShadowState,
  type ShadowView,
} from "@/lib/shadowCoach";
import { tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { catalogueInfo } from "./learningPaths";
import { playbooksForRelay } from "./playbooks";

/*
  First 100 Days: Shadow & Coach on the server (docs/shadow-and-coach.md), in the Discharge Pivot's and the 28-Day
  Trust Check's pattern:

  - An attempt is one scenario (an episode in the coordinator's first 100 days). It freezes the block it started on,
    so a refresh resumes it and a later edit never changes a historical result. An earlier episode's decision comes
    with a later one as its history.
  - Every move is replayed through the same pure engine the editor's preview uses (lib/shadowCoach). A move that has
    already happened changes nothing, so a retried request never duplicates a choice, a score or an event.
  - The plan's content is resolved here against the live catalogue: published Topics, published Magazine pages and
    approved Job Aids. Anything not current and approved is never assigned: it becomes an author review request
    (one open request per missing item, never one per learner), and the plan uses supervised practice meanwhile.
  - Events carry ids, codes, counts and versions, marked fictional, with an idempotency key: never what the learner
    typed (their reasons and coaching words stay in the attempt), never a person's details.
  - Authors see totals only, suppressed under five people. Nobody is ranked, and nothing here is an HR record.

  No AI is called, and nothing here reads or writes a real participant, employee, incident, billing or QA record.
*/

export const SHADOW_SCHEMA = `
CREATE TABLE IF NOT EXISTS shadow_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, scenario_id TEXT NOT NULL,
  user_id TEXT NOT NULL, attempt_no INTEGER NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL,
  rubric_version TEXT NOT NULL, rules_version TEXT NOT NULL, engine_version TEXT NOT NULL, mode TEXT NOT NULL,
  place TEXT NOT NULL DEFAULT 'magazine', scenario TEXT NOT NULL, state TEXT NOT NULL, result TEXT, status TEXT NOT NULL,
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, scenario_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS shadow_attempts_guide ON shadow_attempts (guide_id, block_id);
CREATE TABLE IF NOT EXISTS shadow_review_requests (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, block_id TEXT NOT NULL, scenario_id TEXT NOT NULL, suggestion_id TEXT NOT NULL,
  ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (guide_id, block_id, suggestion_id)
);
`;
const ready = new WeakSet<object>();
export function ensureShadowTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(SHADOW_SCHEMA);
  ready.add(db);
}

type Status = "active" | "submitted" | "completed";
type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  scenario_id: string;
  user_id: string;
  attempt_no: number;
  scenario_version: string;
  scenario_hash: string;
  rubric_version: string;
  rules_version: string;
  engine_version: string;
  mode: string;
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
export const dataOf = (b: ShadowCoachBlock): ShadowData => {
  const rest: Record<string, unknown> = { ...b };
  delete rest.id;
  delete rest.type;
  return rest as unknown as ShadowData;
};
export const scenarioHash = (d: ShadowData) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureShadowTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "shadowcoach") throw new HttpError(404, "That Shadow & Coach practice isn’t here.");
  return { edition, block };
}
const scenarioIdOf = (block: ShadowCoachBlock, v: unknown) => {
  const id = typeof v === "string" ? v : "";
  if (!block.scenarios.some((s) => s.id === id)) throw new HttpError(404, "That scenario isn’t in this practice.");
  return id;
};

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string, scenarioId: string) =>
  db
    .prepare(
      "SELECT * FROM shadow_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? AND scenario_id = ? ORDER BY attempt_no DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId, scenarioId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM shadow_attempts WHERE id = ?").get(id) as Row;
const frozen = (a: Row) => JSON.parse(a.scenario) as ShadowData;
const stateOf = (a: Row): ShadowState => ({ ...emptyState(a.scenario_id), ...(JSON.parse(a.state) as Partial<ShadowState>), scenario: a.scenario_id });

// ---------------------------------------------------------------------------------------------
// The live catalogue: only current, approved content can go in a plan
// ---------------------------------------------------------------------------------------------

/**
  What each suggestion's content resolves to today, for this person: a published Topic, a published Magazine page or
  an approved Job Aid in effect. Anything else is "missing" or "unapproved", never assigned.
*/
export function resolveContent(db: Db, user: User, refs: { suggestion: string; ref: ContentRef; label: string }[], now: Date): AvailMap {
  const out: AvailMap = {};
  if (!refs.length) return out;
  const topics = new Map(catalogueInfo(db).map((t) => [t.slug, t]));
  const aids = new Map(playbooksForRelay(db, user, now).map((a) => [a.id, a]));
  for (const r of refs) {
    const none = { title: r.label, version: "", href: "" };
    if (r.ref.type === "topic") {
      const t = topics.get(r.ref.id);
      const at = (
        db.prepare("SELECT published_at FROM authored_lessons WHERE slug = ? AND deleted_at IS NULL").get(r.ref.id) as
          { published_at: string | null } | undefined
      )?.published_at;
      out[r.suggestion] =
        t && !t.draft
          ? { status: "current", title: t.title, version: at ? `published ${at.slice(0, 10)}` : "shipped", href: `/topics/${t.slug}` }
          : { ...none, status: t ? "unapproved" : "missing" };
    } else if (r.ref.type === "magazine") {
      const g = db.prepare("SELECT id, slug, title, revision_id, status FROM magazine_guides WHERE slug = ? AND status != 'archived'").get(r.ref.id) as
        { id: string; slug: string; title: string; revision_id: string | null; status: string } | undefined;
      out[r.suggestion] =
        g?.status === "published" && g.revision_id
          ? { status: "current", title: g.title, version: g.revision_id, href: `/magazine/${g.slug}` }
          : { ...none, status: g ? "unapproved" : "missing" };
    } else {
      const a = aids.get(r.ref.id);
      const exists = Boolean(db.prepare("SELECT 1 FROM playbook_snippets WHERE id = ?").get(r.ref.id));
      out[r.suggestion] = a
        ? { status: "current", title: a.title, version: `release ${a.number}`, href: `/tools/${a.id}` }
        : { ...none, status: exists ? "unapproved" : "missing" };
    }
  }
  return out;
}
const availFor = (db: Db, user: User, d: ShadowData, scenarioId: string, now: Date) =>
  resolveContent(
    db,
    user,
    contentRefs(d).filter((r) => r.scenario === scenarioId),
    now,
  );

/** An author review request for missing content: one open request per block and item, counted, never a lesson. */
function requestReviews(db: Db, a: Row, d: ShadowData, s: ShadowState, now: Date) {
  const sc = scenarioOf(d, s.scenario)!;
  const avail: AvailMap = Object.fromEntries((s.assigned ?? []).map((i) => [i.id, i]));
  const at = now.toISOString();
  const made: string[] = [];
  for (const i of s.assigned ?? []) {
    const x = sc.suggestions.find((y) => y.id === i.id);
    if (!x?.ref || !isReviewRequest(x, avail)) continue;
    const had = db
      .prepare("SELECT id FROM shadow_review_requests WHERE guide_id = ? AND block_id = ? AND suggestion_id = ?")
      .get(a.guide_id, a.block_id, x.id) as { id: string } | undefined;
    if (had) db.prepare("UPDATE shadow_review_requests SET attempts = attempts + 1, updated_at = ? WHERE id = ?").run(at, had.id);
    else
      db.prepare(
        "INSERT INTO shadow_review_requests (id, guide_id, block_id, scenario_id, suggestion_id, ref_type, ref_id, label, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?)",
      ).run(`scr-${randomUUID().slice(0, 12)}`, a.guide_id, a.block_id, sc.id, x.id, x.ref.type, x.ref.id, x.label, at, at);
    made.push(x.id);
  }
  return made;
}

// ---------------------------------------------------------------------------------------------
// Events: ids, codes, counts and versions only
// ---------------------------------------------------------------------------------------------

/** One event, with a key so a consumer counts it once. Always marked fictional. */
function log(db: Db, a: Row, event: string, detail: Record<string, string | number | boolean | string[]>, now: Date, key = "") {
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
      scenario: a.scenario_id,
      scenarioVersion: a.scenario_version,
      scenarioHash: a.scenario_hash,
      rubric: a.rubric_version,
      engine: a.engine_version,
      shadow: SHADOW_VERSION,
      rules: a.rules_version,
      mode: a.mode,
      place: a.place,
      fictional: true,
      ...detail,
    }),
  );
}

/** What a move changed, as the PRD's event taxonomy: never the learner's reasons or coaching words. */
function logChanges(db: Db, a: Row, d: ShadowData, prev: ShadowState, next: ShadowState, now: Date) {
  const sc = scenarioOf(d, next.scenario)!;
  for (const id of next.viewed.filter((x) => !prev.viewed.includes(x))) log(db, a, "artefact_viewed", { artefact: id }, now, id);
  for (const [k, m] of Object.entries(next.marks)) {
    const was = prev.marks[k];
    if (was && was.kind === m.kind && was.cls === m.cls && was.cause === m.cause) continue;
    const key = `${k}:${m.kind}:${m.cls}:${m.cause}`;
    if (!was) log(db, a, "passage_highlighted", { line: k, omission: k.startsWith("omit:") }, now, k);
    log(db, a, "concern_classified", { line: k, kind: m.kind, class: m.cls, cause: m.cause }, now, key);
  }
  if (next.actionTries > prev.actionTries && next.actions) {
    log(
      db,
      a,
      "immediate_action_selected",
      { now: next.actions.now, later: next.actions.later, ok: next.actionsOk, codes: next.actionCodes, try: next.actionTries },
      now,
      String(next.actionTries),
    );
    for (const c of next.actionCodes.filter((x) => isCritical(x) && !prev.actionCodes.includes(x)))
      log(db, a, "critical_rule_flagged", { code: c, step: "act" }, now, c);
    if (next.actionsOk) log(db, a, "escalation_branch_completed", { tries: next.actionTries }, now);
  }
  if (next.turns.length > prev.turns.length) {
    const t = next.turns.at(-1)!;
    log(
      db,
      a,
      "coaching_response_submitted",
      { turn: next.turns.length, moves: t.moves, risks: t.risks, review: t.hedged.length > 0, reply: t.reply },
      now,
      String(next.turns.length),
    );
  }
  if (next.pushback && next.pushback !== prev.pushback) log(db, a, "coaching_pushback_answered", { option: next.pushback }, now, next.pushback);
  for (const r of next.involved.filter((x) => !prev.involved.includes(x))) log(db, a, "reviewer_requested", { reviewer: r }, now, r);
  if (next.coached && !prev.coached) log(db, a, "plan_suggested", { suggestions: sc.suggestions.length }, now);
  if (JSON.stringify(next.plan) !== JSON.stringify(prev.plan) && !next.assigned)
    log(
      db,
      a,
      "plan_edited",
      { items: next.plan.map((i) => i.id), dues: next.plan.map((i) => String(i.due)) },
      now,
      next.plan.map((i) => `${i.id}.${i.due}`).join("_"),
    );
  if (next.assigned && !prev.assigned) {
    log(db, a, "plan_assigned", { items: next.assigned.map((i) => i.id), statuses: next.assigned.map((i) => i.status), simulated: true }, now);
    for (const i of next.assigned) {
      const x = sc.suggestions.find((y) => y.id === i.id);
      if (x?.kind === "process") log(db, a, "process_issue_raised", { item: x.id }, now, x.id);
    }
  }
  if (next.followViewed && !prev.followViewed)
    log(db, a, "artefact_viewed", { artefact: sc.followup.artefact.id, followup: true }, now, sc.followup.artefact.id);
  for (const [f, st] of Object.entries(next.followMarks))
    if (prev.followMarks[f] !== st) log(db, a, "followup_evidence_marked", { field: f, state: st }, now, `${f}:${st}`);
  if (next.decision && !prev.decision) {
    log(db, a, "followup_sample_reviewed", { fields: Object.keys(next.followMarks).length }, now);
    const dec = next.decision;
    if (dec.outcome === "signoff") log(db, a, "defined_task_signed_off", { scope: dec.scope, reviewer: dec.reviewer, simulated: true }, now);
    if (dec.outcome === "fix_process") log(db, a, "process_issue_raised", { step: "decide" }, now, "decide");
    log(db, a, "readiness_decided", { outcome: dec.outcome, scope: dec.scope, reviewer: dec.reviewer }, now);
  }
}

// ---------------------------------------------------------------------------------------------
// The learner's attempt
// ---------------------------------------------------------------------------------------------

export type ShadowAttemptView = {
  attemptId: string | null;
  attemptNo: number;
  scenario: string;
  status: "new" | Status;
  view: ShadowView | null;
  debrief: Debrief | null;
  attempts: number;
  versions: { shadow: string; rubric: string; engine: string; scenario: string; rules: string };
  earlierScenario: boolean;
};
export type ShadowHome = {
  scenarios: { id: string; title: string; day: number; stage: string; status: "new" | Status; attempts: number }[];
  current: ShadowAttemptView | null;
  block?: ShadowCoachBlock;
  guideId?: string;
};

function historyFor(db: Db, a: Row): History[] {
  const d = frozen(a);
  const me = scenarioOf(d, a.scenario_id);
  const rows = db
    .prepare(
      "SELECT scenario_id, result FROM shadow_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ? AND status = 'completed' ORDER BY attempt_no DESC",
    )
    .all(a.user_id, a.guide_id, a.block_id) as { scenario_id: string; result: string }[];
  const out: History[] = [];
  for (const sc of d.scenarios.filter((x) => me && x.day < me.day)) {
    const r = rows.find((x) => x.scenario_id === sc.id);
    if (!r) continue;
    const deb = (JSON.parse(r.result) as Result).debrief;
    out.push({ scenario: sc.id, title: sc.title, outcome: deb.followup.outcome || deb.endingLabel, scope: deb.followup.scope });
  }
  return out;
}

function view(db: Db, user: User, a: Row | undefined, block: ShadowCoachBlock, scenarioId: string, now: Date): ShadowAttemptView {
  const versions = (r?: Row) => ({
    shadow: SHADOW_VERSION,
    rubric: r?.rubric_version ?? RUBRIC_VERSION,
    engine: r?.engine_version ?? ENGINE_VERSION,
    scenario: r?.scenario_version ?? block.scenarioVersion,
    rules: r?.rules_version ?? (scenarioOf(block, scenarioId)?.rules?.ruleSet || ""),
  });
  if (!a)
    return {
      attemptId: null,
      attemptNo: 0,
      scenario: scenarioId,
      status: "new",
      view: null,
      debrief: null,
      attempts: 0,
      versions: versions(),
      earlierScenario: false,
    };
  const d = frozen(a);
  const s = stateOf(a);
  const ph = phaseOf(s);
  const avail = ph === "plan" ? availFor(db, user, d, a.scenario_id, now) : Object.fromEntries((s.assigned ?? []).map((i) => [i.id, i]));
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    scenario: a.scenario_id,
    status: a.status,
    view: a.status === "active" ? shadowView(d, s, { avail, history: historyFor(db, a) }) : null,
    debrief: a.result ? (JSON.parse(a.result) as Result).debrief : null,
    attempts: (
      db
        .prepare("SELECT COUNT(*) AS n FROM shadow_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ? AND scenario_id = ?")
        .get(a.user_id, a.guide_id, a.block_id, a.scenario_id) as {
        n: number;
      }
    ).n,
    versions: versions(a),
    earlierScenario: a.scenario_hash !== scenarioHash(dataOf(block)),
  };
}

/** The learner's own attempts: each scenario's status, and the one asked for. With `embed`, the readers' copy of the block. */
export function shadowState(db: Db, user: User, guideId: string, blockId: unknown, scenario: unknown, now: Date, opts: { embed?: boolean } = {}): ShadowHome {
  const { edition, block } = load(db, user, guideId, blockId);
  const scenarios = block.scenarios.map((sc) => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id, sc.id);
    const n = a
      ? (
          db
            .prepare("SELECT COUNT(*) AS n FROM shadow_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ? AND scenario_id = ?")
            .get(user.id, edition.guide.id, block.id, sc.id) as { n: number }
        ).n
      : 0;
    return { id: sc.id, title: sc.title, day: sc.day, stage: sc.stage, status: a ? a.status : ("new" as const), attempts: n };
  });
  const sid = typeof scenario === "string" && scenario ? scenarioIdOf(block, scenario) : null;
  const current = sid ? view(db, user, latest(db, user, edition.guide.id, edition.revision.id, block.id, sid), block, sid, now) : null;
  return { scenarios, current, ...(opts.embed ? { block: shadowForReaders(block), guideId: edition.guide.id } : {}) };
}

function create(
  db: Db,
  user: User,
  guideId: string,
  revisionId: string,
  block: ShadowCoachBlock,
  scenarioId: string,
  attemptNo: number,
  now: Date,
  place: string,
) {
  const d = dataOf(block);
  const usable = shadowUsable(d);
  if (!usable.ok) throw new HttpError(410, usable.reason);
  const id = `sc-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO shadow_attempts (id, guide_id, revision_id, block_id, scenario_id, user_id, attempt_no, scenario_version, scenario_hash, rubric_version, rules_version, engine_version, mode, place, scenario, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    guideId,
    revisionId,
    block.id,
    scenarioId,
    user.id,
    attemptNo,
    d.scenarioVersion,
    scenarioHash(d),
    RUBRIC_VERSION,
    scenarioOf(d, scenarioId)?.rules?.ruleSet ?? "",
    ENGINE_VERSION,
    d.mode,
    place,
    JSON.stringify(d),
    JSON.stringify(emptyState(scenarioId)),
    at,
    at,
  );
  const row = latest(db, user, guideId, revisionId, block.id, scenarioId)!;
  if (row.id === id) log(db, row, "shadow_coach_started", { day: scenarioOf(d, scenarioId)?.day ?? 0 }, now);
  return row;
}

/** Start (or resume) a scenario: the block is frozen now. A resent start returns the same attempt. */
export function startShadow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const sid = scenarioIdOf(block, input.scenario);
  return tx(db, () => {
    const a =
      latest(db, user, edition.guide.id, edition.revision.id, block.id, sid) ??
      create(db, user, edition.guide.id, edition.revision.id, block, sid, 1, now, placeOf(input.place));
    return view(db, user, a, block, sid, now);
  });
}

/** One move. A move that changes nothing logs nothing, so a retry is harmless. */
export function moveShadow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const sid = scenarioIdOf(block, input.scenario);
  const move = parseMove(input.move);
  if (!move) throw new HttpError(400, "That isn’t a move in this practice.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id, sid);
    if (!a) throw new HttpError(409, "Start the scenario first.");
    if (a.status !== "active") return view(db, user, a, block, sid, now);
    const d = frozen(a);
    const prev = stateOf(a);
    let next: ShadowState;
    try {
      next = applyMove(d, prev, move, { avail: move.do === "assign" ? availFor(db, user, d, sid, now) : {} });
    } catch (e) {
      if (e instanceof MoveError) throw new HttpError(409, e.message);
      throw e;
    }
    if (JSON.stringify(next) === JSON.stringify(prev)) return view(db, user, a, block, sid, now);
    db.prepare("UPDATE shadow_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now.toISOString(), a.id);
    logChanges(db, a, d, prev, next, now);
    if (next.assigned && !prev.assigned) requestReviews(db, a, d, next, now);
    return view(db, user, reread(db, a.id), block, sid, now);
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
  outcome: string;
};

/** Submit: the debrief is built from the frozen block and kept as given. A resent submit returns what's there. */
export function submitShadow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const sid = scenarioIdOf(block, input.scenario);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id, sid);
    if (!a) throw new HttpError(409, "Start the scenario first.");
    if (a.status !== "active") return view(db, user, a, block, sid, now);
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
      passed: deb.passed,
      outcome: s.decision?.outcome ?? "",
    };
    const at = now.toISOString();
    db.prepare("UPDATE shadow_attempts SET result = ?, status = 'submitted', updated_at = ?, submitted_at = ? WHERE id = ?").run(
      JSON.stringify(result),
      at,
      at,
      a.id,
    );
    for (const c of result.critical.filter((x) => !s.actionCodes.includes(x as never)))
      log(db, a, "critical_rule_flagged", { code: c, step: "debrief" }, now, c);
    log(
      db,
      a,
      "response_submitted",
      { ending: deb.ending, score: deb.score, dims: Object.values(result.dims).map(String), codes: deb.codes, review: deb.review },
      now,
    );
    if (a.mode === "assessed") log(db, a, "assessment_attempted", { score: deb.score, passMark: d.passMark, critical: result.critical.length }, now);
    return view(db, user, reread(db, a.id), block, sid, now);
  });
}

/** The debrief has been viewed: now it's complete. Once only. */
export function viewedShadow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const sid = scenarioIdOf(block, input.scenario);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id, sid);
    if (!a || a.status !== "submitted") return view(db, user, a, block, sid, now);
    const r = JSON.parse(a.result ?? "{}") as Result;
    db.prepare("UPDATE shadow_attempts SET status = 'completed', updated_at = ?, completed_at = ? WHERE id = ?").run(
      now.toISOString(),
      now.toISOString(),
      a.id,
    );
    log(db, a, "feedback_viewed", {}, now);
    log(db, a, "activity_completed", { ending: r.ending, score: r.score }, now);
    if (a.mode === "assessed" && r.passed) log(db, a, "assessment_passed", { score: r.score }, now);
    return view(db, user, reread(db, a.id), block, sid, now);
  });
}

/** Try again: a fresh attempt on the same scenario. The finished one keeps its own versions and debrief. */
export function retryShadow(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const sid = scenarioIdOf(block, input.scenario);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id, sid);
    if (a && a.status === "active") return view(db, user, a, block, sid, now);
    if (a && typeof input.from === "string" && input.from !== a.id) return view(db, user, a, block, sid, now);
    const row = create(db, user, edition.guide.id, edition.revision.id, block, sid, (a?.attempt_no ?? 0) + 1, now, placeOf(input.place));
    if (a) log(db, row, "retry_started", { from: a.id }, now);
    return view(db, user, reread(db, row.id), block, sid, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Authors and the decision register: totals only, never who did what, never a ranking
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
const reviewsFor = (db: Db, guideId: string, blockId?: string) =>
  db
    .prepare(
      `SELECT suggestion_id, scenario_id, ref_type, ref_id, label, status, attempts, created_at FROM shadow_review_requests WHERE guide_id = ? ${blockId ? "AND block_id = ?" : ""} ORDER BY created_at`,
    )
    .all(...(blockId ? [guideId, blockId] : [guideId])) as {
    suggestion_id: string;
    scenario_id: string;
    ref_type: string;
    ref_id: string;
    label: string;
    status: string;
    attempts: number;
    created_at: string;
  }[];

/** Totals for the course's authors, per block and scenario: simulation practice only, never an operational outcome. */
export function shadowStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureShadowTables(db);
  const rows = db
    .prepare(
      "SELECT block_id, scenario_id, user_id, status, result, attempt_no, scenario_version, rubric_version FROM shadow_attempts WHERE guide_id = ? ORDER BY attempt_no",
    )
    .all(guideId) as Pick<Row, "block_id" | "scenario_id" | "user_id" | "status" | "result" | "attempt_no" | "scenario_version" | "rubric_version">[];
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(`${r.block_id}|${r.scenario_id}`, [...(groups.get(`${r.block_id}|${r.scenario_id}`) ?? []), r]);
  return {
    // Simulation practice: never a manager observation, a provider QA record, an incident record or an HR action.
    mode: "simulation" as const,
    scenarios: [...groups.entries()].map(([k, rs]) => {
      const [blockId, scenarioId] = k.split("|");
      const firsts = firstsOf(rs);
      const small = firsts.size < SMALL_COHORT;
      return {
        blockId,
        scenarioId,
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
              DIM_ORDER.map((d) => {
                const l = [0, 0, 0, 0];
                for (const x of firsts.values()) l[x.dims[d] ?? 0] += 1;
                return [d, l];
              }),
            ) as Record<Dim, number[]>),
        outcomes: small ? null : tally(firsts, (x) => [x.outcome || x.ending]),
        codes: small ? null : tally(firsts, (x) => x.codes),
        critical: small ? null : [...firsts.values()].filter((x) => x.critical.length).length,
      };
    }),
    reviewRequests: reviewsFor(db, guideId).map((r) => ({ ...r })),
  };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string };
/** Published courses holding a Shadow & Coach block, with each block. */
export function publishedShadowBlocks(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"shadowcoach\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is ShadowCoachBlock => b.type === "shadowcoach")
      .map((b) => ({ guide: g, block: b })),
  );
}

/**
  The decision register's "Shadow & Coach" sheet (server/problemDesk export): one row per published scenario, with
  the selection rationale, reviewers, denominators, versions, practice results by dimension, readiness decisions,
  critical errors and the content gaps awaiting an author. Simulation practice only: fewer than five people show counts
  only, nobody is named and nothing is ranked.
*/
export function shadowRegister(db: Db) {
  ensureShadowTables(db);
  return publishedShadowBlocks(db).flatMap(({ guide, block }) =>
    block.scenarios.map((sc) => {
      const rows = db
        .prepare("SELECT user_id, status, result, attempt_no FROM shadow_attempts WHERE guide_id = ? AND block_id = ? AND scenario_id = ? ORDER BY attempt_no")
        .all(guide.id, block.id, sc.id) as Pick<Row, "user_id" | "status" | "result" | "attempt_no">[];
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
        scenario: sc.title,
        scenarioId: sc.id,
        version: block.scenarioVersion,
        rules: sc.rules?.ruleSet ?? "",
        theme: block.rationale.signal,
        rationaleDecision: block.rationale.decision || "Not decided",
        jobAid: block.jobAid.snippetId,
        reviewBy: a.reviewBy,
        reviewers: [a.owner, a.operations, a.quality, a.clinical, a.policy, a.partnerships, a.people, a.privacy].filter(Boolean).join("; ") || "Not signed off",
        started: new Set(rows.map((r) => r.user_id)).size,
        submitted: rows.filter((r) => r.status !== "active").length,
        completed: rows.filter((r) => r.status === "completed").length,
        retries: rows.filter((r) => r.attempt_no > 1).length,
        people: firsts.size,
        suppressed: small,
        dims: Object.fromEntries(DIM_ORDER.map((k) => [k, mean(k)])) as Record<Dim, number | "">,
        critical: small ? "" : [...firsts.values()].filter((x) => x.critical.length).length,
        outcomes: small ? "" : list(tally(firsts, (x) => [x.outcome ? OUTCOMES[x.outcome as keyof typeof OUTCOMES] : x.ending])),
        codes: small ? "" : list(tally(firsts, (x) => x.codes)),
        reviewRequests: reviewsFor(db, guide.id, block.id)
          .filter((r) => r.scenario_id === sc.id && r.status === "open")
          .map((r) => `${r.label} (${r.ref_type} ${r.ref_id})`)
          .join("; "),
        measure: block.rationale.measure,
      };
    }),
  );
}
