import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type ReferralStudioBlock } from "@/lib/magazine";
import {
  callerLineProblems,
  caseFile,
  cleanNote,
  cuesNow,
  emptyNote,
  endCall,
  noteFilled,
  NOTE_ORDER,
  openCheck,
  proposalIssues,
  type FamilyDim,
  type Proposal,
} from "@/lib/familyCall";
import { safetyMatch } from "@/lib/roleplay";
import {
  cleanStudioState,
  CLAIM_STATE_LABELS,
  claimCorrection,
  claimState,
  detailsProblem,
  engineOf,
  MAX_STUDIO_REPLY,
  redactStudio,
  REFERRER_ROLES,
  referrerPrompt,
  scenarioCard,
  STAGE_ORDER,
  STAGES,
  startStudio,
  STUDIO_DIMS,
  STUDIO_ENGINE_VERSION,
  STUDIO_PROMPT_VERSION,
  STUDIO_RUBRIC_VERSION,
  STUDIO_TURNS_PER_HOUR,
  studioResult,
  studioSummary,
  studioTurn,
  THEMES,
  type ApprovedClaim,
  type Stage,
  type StudioDebrief,
  type StudioScenario,
  type StudioState,
  type StudioSummary,
  type Theme,
} from "@/lib/referralStudio";
import { assetStanding, buildKit, cleanKitFields, kitFieldProblems, kitStatus, LAYERS, layerOf, PATHWAY_STATUSES, templateClaims } from "@/lib/referralKit";
import { SOURCES, type Source } from "@/lib/referralJourney";
import { STUDIO_SCENARIOS } from "@/content/referralStudio";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { plannerAccess } from "./caseloadPlanner";
import { askForJson } from "./claudeJson";
import { claudeConfigured, openaiJson, openaiReady } from "./openaiText";
import { claimRegister, ensureClaimTables, kitTemplate } from "./referralClaims";
import { workbook, type Sheet } from "./xlsx";

/*
  The Local Referral Studio on the server (docs/local-referral-studio.md).

  Two places run the same practice: the Work Tool (/tools/referral-studio, the reviewed scenarios in content, for the
  business owner and the people they authorise: plannerAccess) and the Magazine block (`referralstudio`, an author's
  copy, for anyone in the course's audience). The outreach kit, saved pitch cards and relationship notes are the Work
  Tool's alone, and belong to one business.

  - An attempt freezes the scenario and the claim register it started on, so a later edit or a withdrawn claim never
    changes a past debrief. The state is replayed through the pure engine (lib/referralStudio over lib/familyCall).
  - The bounded referrer, when a block uses it and a model is connected, only proposes: its ids and quotes are checked
    against the compiled scenario, and its line is refused for the authored one if it claims anything the state doesn't
    allow. The Work Tool runs the reviewed script until the bounded caller's evaluation set is approved.
  - A reply with real-looking personal details is refused before any model, store or event sees it.
  - Every write is idempotent: a turn has an id, a start resumes, a submit returns what's there, an asset or activity
    save carries a key.
  - Words are the learner's. The transcript and close note stay for the retention days (or until the debrief is done,
    in an unsaved practice), then they're removed. Events carry ids, versions, levels and counts, never words.
  - Nothing here contacts anyone, creates a referral, sends a message or marks a draft "sent".
*/

export const TOOL_ID = "referral-studio";
export const TOOL_HREF = `/tools/${TOOL_ID}`;
export const TOOL_TITLE = "Local Referral Studio";
/** The Work Tool's referrer: the reviewed script, until Trilogy Care approves the bounded caller's evaluation set. */
export const TOOL_CALLER: "script" | "bounded-ai" = "script";
const TOOL_RETENTION_DAYS = 30;
export const SMALL_COHORT = 5;
export const REFERRAL_JOURNEY_HREF = "/magazine/which-referrals-become-active-clients";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS referral_practice (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, org_id TEXT NOT NULL DEFAULT '', place TEXT NOT NULL, guide_id TEXT NOT NULL DEFAULT '',
  revision_id TEXT NOT NULL DEFAULT '', block_id TEXT NOT NULL DEFAULT '', scenario_id TEXT NOT NULL, persona TEXT NOT NULL, stage TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL, rubric_version TEXT NOT NULL, engine_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL, claims TEXT NOT NULL, caller TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'text', retain INTEGER NOT NULL DEFAULT 1,
  scenario TEXT NOT NULL, register TEXT NOT NULL, state TEXT NOT NULL, transcript TEXT NOT NULL DEFAULT '[]', note TEXT, result TEXT, debrief TEXT,
  status TEXT NOT NULL, turns INTEGER NOT NULL DEFAULT 0, fallbacks INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  submitted_at TEXT, completed_at TEXT, expires_at TEXT NOT NULL, purged_at TEXT,
  UNIQUE (user_id, place, guide_id, block_id, scenario_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS referral_practice_place ON referral_practice (place, guide_id, block_id);
-- One row per turn, for idempotency and the hourly limit. No words.
CREATE TABLE IF NOT EXISTS referral_practice_turns (
  attempt_id TEXT NOT NULL, n INTEGER NOT NULL, turn_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, n), UNIQUE (attempt_id, turn_id)
);
CREATE TABLE IF NOT EXISTS referral_assets (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL, idem TEXT NOT NULL, kind TEXT NOT NULL, template_version TEXT NOT NULL,
  claim_versions TEXT NOT NULL, stage TEXT NOT NULL, audience TEXT NOT NULL, fields TEXT NOT NULL, status TEXT NOT NULL, scenario_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, downloaded_at TEXT, copied_at TEXT, UNIQUE (org_id, idem)
);
CREATE TABLE IF NOT EXISTS referral_activity (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, user_id TEXT NOT NULL, idem TEXT NOT NULL, met_on TEXT NOT NULL, category TEXT NOT NULL, area TEXT NOT NULL,
  asset_id TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL, follow_up_on TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (org_id, idem)
);
-- Events: ids, versions, levels and counts, never words or patient details. A key makes each one count once.
CREATE TABLE IF NOT EXISTS referral_studio_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT NOT NULL, org_id TEXT NOT NULL DEFAULT '', place TEXT NOT NULL,
  guide_id TEXT NOT NULL DEFAULT '', block_id TEXT NOT NULL DEFAULT '', event TEXT NOT NULL, layer TEXT NOT NULL, detail TEXT NOT NULL, key TEXT UNIQUE
);
`;
const ready = new WeakSet<object>();
export function ensureStudioTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(SCHEMA);
  ensureClaimTables(db);
  ready.add(db);
}

type Status = "active" | "submitted" | "completed" | "exited";
type Row = {
  id: string;
  user_id: string;
  org_id: string;
  place: "tool" | "magazine";
  guide_id: string;
  revision_id: string;
  block_id: string;
  scenario_id: string;
  persona: string;
  stage: Stage;
  attempt_no: number;
  scenario_version: string;
  scenario_hash: string;
  rubric_version: string;
  engine_version: string;
  prompt_version: string;
  claims: string;
  caller: "script" | "bounded-ai";
  channel: "text" | "voice";
  retain: number;
  scenario: string;
  register: string;
  state: string;
  transcript: string;
  note: string | null;
  result: string | null;
  debrief: string | null;
  status: Status;
  turns: number;
  fallbacks: number;
  started_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  expires_at: string;
  purged_at: string | null;
};
export type TranscriptTurn = {
  n: number;
  turnId: string;
  mode: "text" | "voice";
  text: string;
  heard: string;
  reply: string;
  by: "script" | "ai" | "safety";
  at: string;
};

const today = (now: Date) => now.toISOString().slice(0, 10);
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const aiConnected = () => claudeConfigured() || openaiReady();
const hashOf = (v: unknown) => createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------------------------
// Where the practice runs: the Work Tool, or a Magazine block
// ---------------------------------------------------------------------------------------------

type Where =
  | { place: "tool"; guideId: ""; revisionId: ""; blockId: ""; orgId: string; scenarios: StudioScenario[]; caller: "script" | "bounded-ai"; retention: number }
  | {
      place: "magazine";
      guideId: string;
      revisionId: string;
      blockId: string;
      orgId: string;
      scenarios: StudioScenario[];
      caller: "script" | "bounded-ai";
      retention: number;
      block: ReferralStudioBlock;
    };

/** The Work Tool: the business owner and the people they've authorised, and nobody else, authors included. */
function requireBusiness(db: Db, user: User) {
  const a = plannerAccess(db, user);
  if (!a) throw new HttpError(403, "The Local Referral Studio is for the business owner and the people they’ve authorised.");
  ensureStudioTables(db);
  return a;
}

function toolWhere(db: Db, user: User): Where {
  const a = requireBusiness(db, user);
  return {
    place: "tool",
    guideId: "",
    revisionId: "",
    blockId: "",
    orgId: a.orgId,
    scenarios: STUDIO_SCENARIOS,
    caller: TOOL_CALLER,
    retention: TOOL_RETENTION_DAYS,
  };
}

function blockWhere(db: Db, user: User, guideId: string, blockId: unknown): Where {
  ensureStudioTables(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "referralstudio") throw new HttpError(404, "That practice isn’t here.");
  return {
    place: "magazine",
    guideId: edition.guide.id,
    revisionId: edition.revision.id,
    blockId: block.id,
    orgId: user.org_id,
    scenarios: block.scenarios,
    caller: block.caller,
    retention: block.privacy.retentionDays,
    block,
  };
}
export const whereOf = (db: Db, user: User, input: { guideId?: string; blockId?: unknown }) =>
  input.guideId ? blockWhere(db, user, input.guideId, input.blockId) : toolWhere(db, user);

const latest = (db: Db, user: User, w: Where) =>
  db
    .prepare(
      "SELECT * FROM referral_practice WHERE user_id = ? AND place = ? AND guide_id = ? AND block_id = ? ORDER BY started_at DESC, attempt_no DESC LIMIT 1",
    )
    .get(user.id, w.place, w.guideId, w.blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM referral_practice WHERE id = ?").get(id) as Row;
const scenarioOf = (a: Row) => JSON.parse(a.scenario) as StudioScenario;
const registerOf = (a: Row) => JSON.parse(a.register) as ApprovedClaim[];
const stateOf = (a: Row) => cleanStudioState(scenarioOf(a), registerOf(a), JSON.parse(a.state));
const transcriptOf = (a: Row) => JSON.parse(a.transcript) as TranscriptTurn[];

/** One event: ids, versions, levels and counts. Never what was said. */
function log(
  db: Db,
  base: { user: string; org: string; place: string; guide?: string; block?: string },
  event: string,
  detail: object,
  now: Date,
  key: string,
) {
  db.prepare(
    "INSERT OR IGNORE INTO referral_studio_events (at, user_id, org_id, place, guide_id, block_id, event, layer, detail, key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    now.toISOString(),
    base.user,
    base.org,
    base.place,
    base.guide ?? "",
    base.block ?? "",
    event,
    layerOf(event) ?? "practice",
    JSON.stringify(detail),
    key,
  );
}
const attemptLog = (db: Db, a: Row, event: string, detail: object, now: Date, key = "") =>
  log(
    db,
    { user: a.user_id, org: a.org_id, place: a.place, guide: a.guide_id, block: a.block_id },
    event,
    {
      attempt: a.id,
      attemptNo: a.attempt_no,
      scenario: a.scenario_id,
      scenarioVersion: a.scenario_version,
      scenarioHash: a.scenario_hash,
      persona: a.persona,
      stage: a.stage,
      rubric: a.rubric_version,
      engine: a.engine_version,
      prompt: a.prompt_version,
      claims: a.claims,
      caller: a.caller,
      ...detail,
    },
    now,
    `${a.id}:${event}${key ? `:${key}` : ""}`,
  );

// ---------------------------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------------------------

function purge(db: Db, a: Row, now: Date) {
  const st = stateOf(a);
  const redacted: StudioState = {
    ...st,
    claims: st.claims.map((c) => ({ ...c, quote: "" })),
    engine: {
      ...st.engine,
      evals: st.engine.evals.map((e) => ({ ...e, moves: e.moves.map((m) => ({ ...m, quote: "" })), risks: e.risks.map((r) => ({ ...r, quote: "" })) })),
    },
  };
  const note = a.note ? { ...emptyNote(), actions: cleanNote(JSON.parse(a.note)).actions } : null;
  db.prepare("UPDATE referral_practice SET transcript = '[]', note = ?, state = ?, debrief = ?, purged_at = ? WHERE id = ?").run(
    note ? JSON.stringify(note) : null,
    JSON.stringify(redacted),
    a.debrief ? JSON.stringify(redactStudio(JSON.parse(a.debrief) as StudioDebrief)) : null,
    now.toISOString(),
    a.id,
  );
}

/** Removes the words from attempts past their retention date. The levels and ending stay. */
export function purgeExpired(db: Db, now: Date) {
  ensureStudioTables(db);
  const due = db.prepare("SELECT * FROM referral_practice WHERE purged_at IS NULL AND expires_at < ?").all(now.toISOString()) as Row[];
  for (const a of due) purge(db, a, now);
  return due.length;
}

// ---------------------------------------------------------------------------------------------
// The learner's view
// ---------------------------------------------------------------------------------------------

function attemptView(db: Db, a: Row, now: Date) {
  const sc = scenarioOf(a);
  const reg = registerOf(a);
  const st = stateOf(a);
  const eng = engineOf(sc, a.stage, reg, today(now));
  const last = st.engine.evals.at(-1);
  const rule = st.engine.safetyRule ? sc.roleplay.safety.find((r) => r.id === st.engine.safetyRule) : undefined;
  return {
    attemptId: a.id,
    attemptNo: a.attempt_no,
    scenarioId: a.scenario_id,
    stage: a.stage,
    stageLabel: STAGES[a.stage],
    status: a.status,
    screen: (a.status === "submitted" || a.status === "completed" ? "debrief" : a.status === "exited" ? "left" : st.engine.ended ? "close" : "talk") as
      "talk" | "close" | "debrief" | "left",
    caller: a.caller,
    retain: Boolean(a.retain),
    call: {
      turn: st.engine.turn,
      minTurns: sc.roleplay.minTurns,
      maxTurns: sc.roleplay.maxTurns,
      ended: st.engine.ended,
      safety: rule ? { label: rule.label, guidance: rule.guidance } : null,
    },
    transcript: transcriptOf(a),
    evidence: caseFile(eng, st.engine).map((x) => ({ id: x.id, label: x.label, opened: x.opened, facts: x.facts })),
    cues: st.engine.ended ? [] : cuesNow(eng, st.engine),
    notice:
      last?.fallback && a.caller === "bounded-ai"
        ? "The referrer’s last line comes from the reviewed script: the AI referrer couldn’t answer within the approved facts just then. Nothing you said was lost."
        : "",
    note: a.note ? cleanNote(JSON.parse(a.note)) : emptyNote(),
    debrief: a.debrief ? (JSON.parse(a.debrief) as StudioDebrief) : null,
    purged: Boolean(a.purged_at),
    earlierVersion: false,
  };
}
export type AttemptView = ReturnType<typeof attemptView>;

/** The claims as a learner may see them: the wording to use, and its standing. */
function claimsView(reg: ApprovedClaim[], now: Date) {
  return reg.map((c) => {
    const corr = claimCorrection(c, today(now));
    return {
      id: c.id,
      topic: c.topic,
      text: corr.usable ? corr.text : "",
      label: corr.label,
      state: claimState(c, today(now)),
      source: c.evidence,
      owner: c.owner,
    };
  });
}

function practiceView(db: Db, user: User, w: Where, now: Date) {
  const a = latest(db, user, w);
  const reg = claimRegister(db);
  return {
    place: w.place,
    scenarios: w.scenarios.map(scenarioCard),
    stages: STAGE_ORDER.map((s) => ({ stage: s, label: STAGES[s] })),
    ai: w.caller === "bounded-ai" && aiConnected(),
    claims: claimsView(reg, now),
    current: a ? { ...attemptView(db, a, now), earlierVersion: a.scenario_hash !== hashOf(w.scenarios.find((x) => x.id === a.scenario_id) ?? null) } : null,
    attempts: (
      db
        .prepare("SELECT COUNT(*) AS n FROM referral_practice WHERE user_id = ? AND place = ? AND guide_id = ? AND block_id = ?")
        .get(user.id, w.place, w.guideId, w.blockId) as {
        n: number;
      }
    ).n,
    toolAccess: Boolean(plannerAccess(db, user)),
    versions: { engine: STUDIO_ENGINE_VERSION, prompt: STUDIO_PROMPT_VERSION, rubric: STUDIO_RUBRIC_VERSION },
    referralJourney: REFERRAL_JOURNEY_HREF,
  };
}
export type PracticeView = ReturnType<typeof practiceView>;

/** The learner's own practice here. */
export function studioPractice(db: Db, user: User, input: { guideId?: string; blockId?: unknown }, now: Date) {
  const w = whereOf(db, user, input);
  purgeExpired(db, now);
  return practiceView(db, user, w, now);
}

function create(db: Db, user: User, w: Where, sc: StudioScenario, stage: Stage, attemptNo: number, input: Record<string, unknown>, now: Date) {
  const reg = claimRegister(db);
  const st = startStudio(sc, stage, reg, { cues: input.cues !== false });
  const id = `rs-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  const retain = input.retain !== false;
  // An unsaved practice keeps the words for a day at most, and only until the next attempt or the debrief is done.
  const expires = new Date(now.getTime() + (retain ? w.retention : 1) * 86_400_000).toISOString();
  const caller = w.caller === "bounded-ai" && aiConnected() ? "bounded-ai" : "script";
  db.prepare(
    `INSERT INTO referral_practice (id, user_id, org_id, place, guide_id, revision_id, block_id, scenario_id, persona, stage, attempt_no, scenario_version, scenario_hash,
       rubric_version, engine_version, prompt_version, claims, caller, channel, retain, scenario, register, state, status, started_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    id,
    user.id,
    w.orgId,
    w.place,
    w.guideId,
    w.revisionId,
    w.blockId,
    sc.id,
    sc.persona.role,
    stage,
    attemptNo,
    sc.version,
    hashOf(sc),
    sc.family.rubricVersion || STUDIO_RUBRIC_VERSION,
    STUDIO_ENGINE_VERSION,
    STUDIO_PROMPT_VERSION,
    reg.map((c) => `${c.id}@${c.version}:${claimState(c, today(now))}`).join(","),
    caller,
    input.channel === "voice" ? "voice" : "text",
    retain ? 1 : 0,
    JSON.stringify(sc),
    JSON.stringify(reg),
    JSON.stringify(st),
    at,
    at,
    expires,
  );
  const row = reread(db, id);
  attemptLog(db, row, "roleplay_started", { retain }, now);
  attemptLog(db, row, "stage_selected", { stage }, now);
  return row;
}

/** Start (or resume) a practice with a referrer, at a stage. A resent start returns the open attempt. */
export function startPractice(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  const sc = w.scenarios.find((x) => x.id === input.scenarioId);
  if (!sc) throw new HttpError(404, "That referrer isn’t here.");
  const stage = STAGE_ORDER.includes(input.stage as Stage) ? (input.stage as Stage) : null;
  if (!stage || !sc.variants.some((v) => v.stage === stage))
    throw new HttpError(400, "Choose one of the stages offered for this referrer. “Unknown” is a valid choice.");
  return tx(db, () => {
    const a = latest(db, user, w);
    if (a && a.status === "active" && a.scenario_id === sc.id && a.stage === stage) return practiceView(db, user, w, now);
    // Another practice in progress is left (nothing counted against them); an unsaved one loses its words now.
    if (a && a.status === "active") db.prepare("UPDATE referral_practice SET status = 'exited', updated_at = ? WHERE id = ?").run(now.toISOString(), a.id);
    if (a && !a.retain && !a.purged_at) purge(db, reread(db, a.id), now);
    const n = (
      db
        .prepare("SELECT MAX(attempt_no) AS n FROM referral_practice WHERE user_id = ? AND place = ? AND guide_id = ? AND block_id = ? AND scenario_id = ?")
        .get(user.id, w.place, w.guideId, w.blockId, sc.id) as { n: number | null }
    ).n;
    const row = create(db, user, w, sc, stage, (n ?? 0) + 1, input, now);
    if (a && a.scenario_id === sc.id) attemptLog(db, row, "roleplay_retried", { from: a.id }, now);
    return practiceView(db, user, w, now);
  });
}

function active(db: Db, user: User, w: Where) {
  const a = latest(db, user, w);
  if (!a) throw new HttpError(409, "Start a practice first.");
  return a;
}

function save(db: Db, a: Row, st: StudioState, now: Date, extra: { transcript?: TranscriptTurn[]; status?: Status; channel?: string } = {}) {
  db.prepare(
    "UPDATE referral_practice SET state = ?, transcript = COALESCE(?, transcript), status = COALESCE(?, status), channel = COALESCE(?, channel), turns = ?, fallbacks = ?, updated_at = ? WHERE id = ?",
  ).run(
    JSON.stringify(st),
    extra.transcript ? JSON.stringify(extra.transcript) : null,
    extra.status ?? null,
    extra.channel ?? null,
    st.engine.turn,
    st.engine.counters.fallbacks,
    now.toISOString(),
    a.id,
  );
}

/** Opens an evidence section (the stage guide, the approved claims, the escalation route) between replies. Once each. */
export function openEvidence(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  return tx(db, () => {
    const a = active(db, user, w);
    if (a.status !== "active") return practiceView(db, user, w, now);
    const st = stateOf(a);
    const eng = engineOf(scenarioOf(a), a.stage, registerOf(a));
    let engine;
    try {
      engine = openCheck(eng, st.engine, clean(input.section, 80));
    } catch {
      throw new HttpError(404, "That isn’t part of the evidence for this practice.");
    }
    if (engine !== st.engine) save(db, a, { ...st, engine }, now);
    return practiceView(db, user, w, now);
  });
}

/** The model adapter: Claude when connected, otherwise OpenAI, through the Hub's JSON helpers. Replaceable in tests. */
export type StudioModel = (prompt: string, check: (v: unknown) => string[]) => Promise<unknown>;
const defaultModel: StudioModel = async (prompt, check) =>
  claudeConfigured()
    ? (await askForJson<unknown>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase: () => {} }, "low")).value
    : await openaiJson<unknown>(prompt, check);
const MODEL_TIMEOUT_MS = 25_000;
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

/**
  A reply, typed or spoken (the same path). Real-looking personal details are refused before anything else. Resending
  a turn id returns the practice as it is. If the model is unavailable, its answer doesn't fit, or its line strays,
  the authored reply is used, the turn is kept, and the learner is told.
*/
export async function practiceTurn(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date, model: StudioModel = defaultModel) {
  const w = whereOf(db, user, input);
  const turnId = clean(input.turnId, 60);
  if (!turnId) throw new HttpError(400, "That reply can’t be sent. Try again.");
  const a0 = active(db, user, w);
  if (db.prepare("SELECT 1 FROM referral_practice_turns WHERE attempt_id = ? AND turn_id = ?").get(a0.id, turnId) || a0.status !== "active")
    return practiceView(db, user, w, now);
  const sc = scenarioOf(a0);
  const reg = registerOf(a0);
  const st0 = stateOf(a0);
  if (st0.engine.ended) throw new HttpError(409, "The conversation has ended. Write down the next step.");
  const text = clean(input.text, MAX_STUDIO_REPLY);
  if (text.length < 2) throw new HttpError(400, "Say or type something first.");
  const details = detailsProblem(text);
  if (details) {
    // Nothing of what was typed is kept, sent to a model or logged: only that a reply was refused.
    save(db, a0, { ...st0, blocked: st0.blocked + 1 }, now);
    attemptLog(db, a0, "details_refused", { turn: st0.engine.turn + 1 }, now, `${turnId}`);
    throw new HttpError(400, details);
  }
  const since = new Date(now.getTime() - 3600_000).toISOString();
  if (
    (db.prepare("SELECT COUNT(*) AS n FROM referral_practice_turns WHERE user_id = ? AND at >= ?").get(user.id, since) as { n: number }).n >=
    STUDIO_TURNS_PER_HOUR
  )
    throw new HttpError(429, "That’s a lot of practice for one hour. Take a break and come back to it.");
  const mode = input.mode === "voice" ? "voice" : "text";
  const heard = mode === "voice" ? clean(input.heard, MAX_STUDIO_REPLY) : "";
  const eng = engineOf(sc, a0.stage, reg);

  let proposal: Proposal | null = null;
  let fallback = "";
  if (a0.caller === "bounded-ai" && !safetyMatch(text, sc.roleplay.safety)) {
    try {
      const prompt = referrerPrompt(
        sc,
        eng,
        st0.engine,
        transcriptOf(a0).map((t) => ({ text: t.text, reply: t.reply })),
        text,
      );
      const value = await withTimeout(
        model(prompt, (v) => proposalIssues(v, eng)),
        MODEL_TIMEOUT_MS,
      );
      if (proposalIssues(value, eng).length) fallback = "invalid";
      else proposal = value as Proposal;
    } catch {
      fallback = "unavailable";
    }
  }

  return tx(db, () => {
    const a = reread(db, a0.id);
    if (
      db.prepare("SELECT 1 FROM referral_practice_turns WHERE attempt_id = ? AND turn_id = ?").get(a.id, turnId) ||
      a.status !== "active" ||
      a.turns !== a0.turns
    )
      return practiceView(db, user, w, now);
    const st = stateOf(a);
    const r = studioTurn(sc, reg, st, { text, mode, proposal });
    let reply = r.out.authored;
    let by: TranscriptTurn["by"] = r.out.safety ? "safety" : "script";
    if (proposal && !r.out.safety) {
      const problems = callerLineProblems(eng, proposal.reply, {
        allowed: r.out.allowed,
        heard: [...transcriptOf(a).flatMap((t) => [t.text, t.reply]), text],
        authored: r.out.authored,
      });
      if (problems.length) fallback = "strayed";
      else {
        reply = [proposal.reply.trim(), r.out.beat].filter(Boolean).join(" ");
        by = "ai";
      }
    }
    const next: StudioState = { ...r.state, engine: { ...r.state.engine } };
    if (fallback && !r.out.safety) {
      next.engine.counters = { ...next.engine.counters, fallbacks: next.engine.counters.fallbacks + 1 };
      next.engine.evals = next.engine.evals.map((e) => (e.n === r.out.eval.n ? { ...e, fallback } : e));
    }
    if (by === "ai") next.engine.evals = next.engine.evals.map((e) => (e.n === r.out.eval.n ? { ...e, by: "ai" } : e));
    const turn: TranscriptTurn = { n: r.out.eval.n, turnId, mode, text, heard: heard && heard !== text ? heard : "", reply, by, at: now.toISOString() };
    db.prepare("INSERT INTO referral_practice_turns (attempt_id, n, turn_id, user_id, at) VALUES (?, ?, ?, ?, ?)").run(
      a.id,
      turn.n,
      turnId,
      user.id,
      now.toISOString(),
    );
    save(db, a, next, now, { transcript: [...transcriptOf(a), turn], channel: mode });
    attemptLog(
      db,
      a,
      turn.n === 1 ? "pitch_submitted" : "objection_answered",
      { turn: turn.n, mode, intents: r.out.eval.intents.length, ended: next.engine.ended },
      now,
      `t${turn.n}`,
    );
    const flagged = next.claims.filter((c) => c.turn === turn.n).map((c) => c.claim);
    const critical = r.out.eval.risks.filter((t) => !t.hedged && sc.family.risks[t.id]?.critical).map((t) => t.id);
    if (flagged.length || critical.length) attemptLog(db, a, "critical_claim_flagged", { turn: turn.n, claims: flagged, risks: critical }, now, `t${turn.n}`);
    if (fallback && !r.out.safety) attemptLog(db, a, "caller_fallback_used", { turn: turn.n, reason: fallback }, now, `t${turn.n}`);
    return practiceView(db, user, w, now);
  });
}

/** Ends the conversation (to the close) or leaves the practice (no result, nothing counted against them). */
export function endPractice(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  return tx(db, () => {
    const a = active(db, user, w);
    if (a.status !== "active") return practiceView(db, user, w, now);
    const st = stateOf(a);
    const how = input.how === "exit" ? "exit" : "end";
    const engine = endCall({ roleplay: scenarioOf(a).roleplay }, st.engine, how);
    save(db, a, { ...st, engine }, now, how === "exit" ? { status: "exited" } : {});
    if (how === "exit" && !a.retain) purge(db, reread(db, a.id), now);
    return practiceView(db, user, w, now);
  });
}

/** Saves the close note as a draft, so a reload keeps it. */
export function draftPracticeNote(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  const a = active(db, user, w);
  if (a.status !== "active") return practiceView(db, user, w, now);
  const note = cleanNote(input.note);
  const bad = NOTE_ORDER.map((k) => detailsProblem(note[k])).find(Boolean);
  if (bad) throw new HttpError(400, bad);
  db.prepare("UPDATE referral_practice SET note = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(note), now.toISOString(), a.id);
  return practiceView(db, user, w, now);
}

/** Submits the close: the scorecard and debrief are built from the frozen scenario and register. A resent submit returns what's there. */
export function submitPractice(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  return tx(db, () => {
    const a = active(db, user, w);
    if (a.status !== "active") return practiceView(db, user, w, now);
    const st = stateOf(a);
    if (!st.engine.ended) throw new HttpError(409, "End the conversation first, then write down the next step.");
    const note = input.note === undefined && a.note ? cleanNote(JSON.parse(a.note)) : cleanNote(input.note);
    const bad = NOTE_ORDER.map((k) => detailsProblem(note[k])).find(Boolean);
    if (bad) throw new HttpError(400, bad);
    if (!NOTE_ORDER.some((k) => noteFilled(note, k)) && !note.actions.length)
      throw new HttpError(400, "Write down the next step, or choose at least one, before you see the debrief.");
    const deb = studioResult(scenarioOf(a), registerOf(a), st, note, today(now));
    const summary = studioSummary(deb);
    const at = now.toISOString();
    db.prepare("UPDATE referral_practice SET note = ?, result = ?, debrief = ?, status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(note),
      JSON.stringify(summary),
      JSON.stringify(deb),
      at,
      at,
      a.id,
    );
    attemptLog(
      db,
      a,
      "feedback_viewed",
      {
        levels: summary.levels,
        score: summary.score,
        critical: summary.critical,
        claims: summary.claims,
        ending: summary.ending,
        ready: summary.ready,
        turns: summary.turns,
      },
      now,
    );
    return practiceView(db, user, w, now);
  });
}

/** The debrief has been read: complete when the conversation was substantive. Once only. */
export function practiceViewed(db: Db, user: User, input: Record<string, unknown> & { guideId?: string }, now: Date) {
  const w = whereOf(db, user, input);
  return tx(db, () => {
    const a = latest(db, user, w);
    if (!a || a.status !== "submitted") return practiceView(db, user, w, now);
    const r = JSON.parse(a.result ?? "{}") as StudioSummary;
    db.prepare("UPDATE referral_practice SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
      r.substantive ? now.toISOString() : null,
      now.toISOString(),
      a.id,
    );
    if (r.substantive) attemptLog(db, a, "roleplay_completed", { score: r.score, ending: r.ending, ready: r.ready }, now);
    return practiceView(db, user, w, now);
  });
}

/** The learner removes one of their own attempts: their words go now. Events (which hold none) stay. */
export function deletePractice(db: Db, user: User, input: Record<string, unknown>) {
  ensureStudioTables(db);
  const a = db.prepare("SELECT id FROM referral_practice WHERE id = ? AND user_id = ?").get(String(input.attemptId ?? ""), user.id) as
    { id: string } | undefined;
  if (!a) throw new HttpError(404, "That practice isn’t here.");
  tx(db, () => {
    db.prepare("DELETE FROM referral_practice_turns WHERE attempt_id = ?").run(a.id);
    db.prepare("DELETE FROM referral_practice WHERE id = ?").run(a.id);
  });
  return { deleted: true };
}

// ---------------------------------------------------------------------------------------------
// The outreach kit, pitch cards and relationship notes: the Work Tool's, for one business
// ---------------------------------------------------------------------------------------------

type AssetRow = {
  id: string;
  org_id: string;
  user_id: string;
  idem: string;
  kind: "kit" | "pitchcard";
  template_version: string;
  claim_versions: string;
  stage: Stage;
  audience: string;
  fields: string;
  status: "approved" | "draft" | "blocked";
  scenario_id: string;
  created_at: string;
  downloaded_at: string | null;
  copied_at: string | null;
};
const idemOf = (v: unknown) => (typeof v === "string" && /^[\w-]{8,80}$/.test(v) ? v : null);

function assetView(db: Db, r: AssetRow, now: Date) {
  const t = kitTemplate(db);
  const standing = assetStanding(
    { templateVersion: r.template_version, claimVersions: JSON.parse(r.claim_versions), status: r.status },
    t,
    claimRegister(db),
    today(now),
  );
  return {
    id: r.id,
    kind: r.kind,
    stage: r.stage,
    stageLabel: STAGES[r.stage],
    audience: r.audience,
    audienceLabel: REFERRER_ROLES[r.audience as keyof typeof REFERRER_ROLES]?.label ?? r.audience,
    fields: cleanKitFields(JSON.parse(r.fields)),
    templateVersion: r.template_version,
    status: r.status,
    standing: standing.state,
    reasons: standing.reasons,
    createdAt: r.created_at,
    downloaded: Boolean(r.downloaded_at),
    copied: Boolean(r.copied_at),
  };
}

/** The Work Tool's home: whether this person has access, and if so, the practice, the kit and their business's own saved work. */
export function studioHome(db: Db, user: User, now: Date) {
  const a = plannerAccess(db, user);
  if (!a) return { access: null };
  ensureStudioTables(db);
  purgeExpired(db, now);
  const w = toolWhere(db, user);
  const t = kitTemplate(db);
  const reg = claimRegister(db);
  log(db, { user: user.id, org: a.orgId, place: "tool" }, "referral_studio_opened", {}, now, `${user.id}:opened:${today(now)}`);
  return {
    access: { orgName: a.orgName, role: a.role },
    practice: practiceView(db, user, w, now),
    kit: { template: t, register: reg, status: kitStatus(t, reg, today(now)), dependsOn: templateClaims(t), businessName: a.orgName, today: today(now) },
    assets: (db.prepare("SELECT * FROM referral_assets WHERE org_id = ? ORDER BY created_at DESC LIMIT 50").all(a.orgId) as AssetRow[]).map((r) =>
      assetView(db, r, now),
    ),
    activity: activityList(db, a.orgId),
    options: {
      categories: Object.entries(SOURCES)
        .filter(([k]) => k !== "self" && k !== "client" && k !== "unknown")
        .map(([id, label]) => ({ id, label })),
      themes: Object.entries(THEMES).map(([id, label]) => ({ id, label })),
      owners: OWNERS,
    },
  };
}
export type StudioHome = ReturnType<typeof studioHome>;

/** Saves a kit draft or a pitch card. Only the approved fields are kept; a field with an unapproved claim or personal details is refused. */
export function saveAsset(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const a = requireBusiness(db, user);
  const idem = idemOf(input.idem);
  if (!idem) throw new HttpError(400, "That save can’t be sent. Try again.");
  const kind = input.kind === "pitchcard" ? "pitchcard" : "kit";
  return tx(db, () => {
    const had = db.prepare("SELECT * FROM referral_assets WHERE org_id = ? AND idem = ?").get(a.orgId, idem) as AssetRow | undefined;
    if (had) return { asset: assetView(db, had, now), replayed: true };
    const t = kitTemplate(db);
    const reg = claimRegister(db);
    const fields = cleanKitFields(input.fields);
    const problems = kitFieldProblems(t, fields, reg);
    if (problems.length) throw Object.assign(new HttpError(400, problems[0]), { problems });
    const built = buildKit(t, reg, fields, { businessName: a.orgName, today: today(now) });
    const scenario = typeof input.scenarioId === "string" && STUDIO_SCENARIOS.some((x) => x.id === input.scenarioId) ? input.scenarioId : "";
    const id = `ra-${randomUUID().slice(0, 12)}`;
    db.prepare(
      `INSERT INTO referral_assets (id, org_id, user_id, idem, kind, template_version, claim_versions, stage, audience, fields, status, scenario_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      a.orgId,
      user.id,
      idem,
      kind,
      built.templateVersion,
      JSON.stringify(built.claimVersions),
      fields.stage,
      fields.audience,
      JSON.stringify(fields),
      built.status,
      scenario,
      now.toISOString(),
    );
    const base = { user: user.id, org: a.orgId, place: "tool" };
    const detail = { asset: id, kind, template: built.templateVersion, stage: fields.stage, audience: fields.audience, status: built.status };
    log(db, base, "asset_draft_generated", detail, now, `${id}:generated`);
    if (built.status === "approved") log(db, base, "asset_approved_for_use", detail, now, `${id}:approved`);
    return { asset: assetView(db, db.prepare("SELECT * FROM referral_assets WHERE id = ?").get(id) as AssetRow, now), replayed: false };
  });
}

const ownAsset = (db: Db, orgId: string, id: unknown) => {
  const r = db.prepare("SELECT * FROM referral_assets WHERE id = ? AND org_id = ?").get(String(id ?? ""), orgId) as AssetRow | undefined;
  if (!r) throw new HttpError(404, "That draft isn’t here.");
  return r;
};

/** A draft was downloaded (printed to PDF) or an email copied. Recorded as that, never as sent, an introduction or a referral. */
export function assetEvent(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const a = requireBusiness(db, user);
  const r = ownAsset(db, a.orgId, input.assetId);
  const what = input.event === "copied" ? "copied" : input.event === "downloaded" ? "downloaded" : null;
  if (!what) throw new HttpError(400, "Unknown event.");
  db.prepare(`UPDATE referral_assets SET ${what}_at = COALESCE(${what}_at, ?) WHERE id = ?`).run(now.toISOString(), r.id);
  const part = typeof input.part === "string" && /^[\w-]{1,40}$/.test(input.part) ? input.part : "";
  log(
    db,
    { user: user.id, org: a.orgId, place: "tool" },
    `asset_${what}`,
    { asset: r.id, kind: r.kind, part, template: r.template_version, status: r.status },
    now,
    `${r.id}:${what}:${part}:${now.toISOString()}`,
  );
  return { asset: assetView(db, db.prepare("SELECT * FROM referral_assets WHERE id = ?").get(r.id) as AssetRow, now) };
}

export const CARD_PREFIX = "referral-card:";
/** Saves a pitch card to the person's Favourites (and pins it, if asked), so it's there before a meeting. */
export function savePitchCard(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const a = requireBusiness(db, user);
  const r = ownAsset(db, a.orgId, input.assetId);
  if (r.kind !== "pitchcard") throw new HttpError(400, "Only a pitch card can be saved to Favourites.");
  const pinned =
    input.pin === true ? ((db.prepare("SELECT MAX(pinned) AS n FROM favourites WHERE user_id = ?").get(user.id) as { n: number | null }).n ?? 0) + 1 : 0;
  db.prepare("INSERT OR IGNORE INTO favourites (id, user_id, kind, target_id, title, pinned, saved_at) VALUES (?, ?, 'tool', ?, '', ?, ?)").run(
    `fav-${randomUUID().slice(0, 12)}`,
    user.id,
    `${CARD_PREFIX}${r.id}`,
    pinned,
    now.toISOString(),
  );
  log(db, { user: user.id, org: a.orgId, place: "tool" }, "pitch_card_saved", { asset: r.id, pinned: pinned > 0 }, now, `${user.id}:${r.id}:card`);
  return { saved: true };
}

/** A saved pitch card as Favourites shows it: its standing now, never a stale "approved". Someone outside the business gets nothing. */
export function referralCardFavourite(db: Db, user: User, targetId: string, now: Date) {
  const a = plannerAccess(db, user);
  ensureStudioTables(db);
  const r = a
    ? (db.prepare("SELECT * FROM referral_assets WHERE id = ? AND org_id = ? AND kind = 'pitchcard'").get(targetId.slice(CARD_PREFIX.length), a.orgId) as
        AssetRow | undefined)
    : undefined;
  if (!r)
    return {
      title: "A pitch card you can no longer open",
      detail: "",
      label: "Local Referral Studio pitch card",
      state: "unavailable" as const,
      note: "It isn’t available to you any more.",
      href: "/tools",
    };
  const v = assetView(db, r, now);
  return {
    title: `Pitch card: ${v.audienceLabel}, ${v.stageLabel.toLowerCase()}`,
    detail: "Use when: you’re about to meet a local referrer.",
    label: "Local Referral Studio pitch card",
    state: (v.standing === "outdated" ? "changed" : "current") as "changed" | "current",
    note:
      v.standing === "approved"
        ? "Current approved wording."
        : v.standing === "outdated"
          ? `Marked for review: ${v.reasons.join(" ")} Make a new one.`
          : "Draft: its claims are awaiting approval. Practice wording only.",
    href: `${TOOL_HREF}?card=${r.id}`,
  };
}

const OWNERS = [
  { id: "owner", label: "The business owner" },
  { id: "coordinator", label: "A coordinator" },
  { id: "other", label: "Someone else in the business" },
];
type ActivityRow = {
  id: string;
  met_on: string;
  category: string;
  area: string;
  asset_id: string;
  theme: string;
  follow_up_on: string;
  owner: string;
  created_at: string;
};
function activityList(db: Db, orgId: string) {
  const areas = kitTemplate(db).serviceAreas;
  return (db.prepare("SELECT * FROM referral_activity WHERE org_id = ? ORDER BY met_on DESC, created_at DESC LIMIT 50").all(orgId) as ActivityRow[]).map(
    (r) => ({
      id: r.id,
      metOn: r.met_on,
      category: SOURCES[r.category as Source] ?? r.category,
      area: areas.find((x) => x.id === r.area)?.label ?? r.area,
      asset: r.asset_id,
      theme: THEMES[r.theme as Theme] ?? r.theme,
      followUpOn: r.follow_up_on,
      owner: OWNERS.find((o) => o.id === r.owner)?.label ?? r.owner,
    }),
  );
}

/**
  A relationship note, entered by hand: when, what kind of organisation, the area, the asset version used, the broad
  question theme, the next follow-up and its owner. No free text, no organisation or person name, no patient detail.
  It's relationship activity, never an introduction or a referral.
*/
export function recordActivity(db: Db, user: User, input: Record<string, unknown>, now: Date) {
  const a = requireBusiness(db, user);
  const t = kitTemplate(db);
  const idem = idemOf(input.idem);
  if (!idem) throw new HttpError(400, "That save can’t be sent. Try again.");
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const metOn = day(input.metOn);
  if (!metOn || metOn > today(now)) throw new HttpError(400, "Give the date you met, today or earlier.");
  const category = typeof input.category === "string" && input.category in SOURCES ? input.category : "";
  if (!category) throw new HttpError(400, "Choose the kind of organisation.");
  if (!t.serviceAreas.some((x) => x.id === input.area)) throw new HttpError(400, "Choose the area from your verified list.");
  const theme = typeof input.theme === "string" && input.theme in THEMES ? input.theme : "";
  if (!theme) throw new HttpError(400, "Choose the broad question theme.");
  const owner = OWNERS.some((o) => o.id === input.owner) ? String(input.owner) : "";
  if (!owner) throw new HttpError(400, "Say who owns the follow-up.");
  const asset = input.assetId ? ownAsset(db, a.orgId, input.assetId).id : "";
  const followUp = day(input.followUpOn);
  return tx(db, () => {
    const had = db.prepare("SELECT id FROM referral_activity WHERE org_id = ? AND idem = ?").get(a.orgId, idem) as { id: string } | undefined;
    if (!had) {
      const id = `rr-${randomUUID().slice(0, 12)}`;
      db.prepare(
        "INSERT INTO referral_activity (id, org_id, user_id, idem, met_on, category, area, asset_id, theme, follow_up_on, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, a.orgId, user.id, idem, metOn, category, String(input.area), asset, theme, followUp, owner, now.toISOString());
      log(
        db,
        { user: user.id, org: a.orgId, place: "tool" },
        "relationship_activity_recorded",
        { activity: id, category, theme, asset },
        now,
        `${id}:recorded`,
      );
    }
    return { activity: activityList(db, a.orgId), replayed: Boolean(had) };
  });
}

// ---------------------------------------------------------------------------------------------
// Authors and Admin: aggregates only, three layers kept apart
// ---------------------------------------------------------------------------------------------

type SummaryRow = { user_id: string; scenario_id: string; persona: string; attempt_no: number; result: string | null; started_at: string; place: string };

function practiceAggregate(rows: SummaryRow[]) {
  const byScenario = new Map<string, SummaryRow[]>();
  for (const r of rows) byScenario.set(r.scenario_id, [...(byScenario.get(r.scenario_id) ?? []), r]);
  return [...byScenario.entries()].map(([scenario, rs]) => {
    const people = new Set(rs.map((r) => r.user_id)).size;
    const results = rs.filter((r) => r.result).map((r) => ({ ...r, s: JSON.parse(r.result!) as StudioSummary }));
    const firsts = new Map<string, StudioSummary>();
    const repeats = new Map<string, StudioSummary>();
    for (const r of [...results].sort((p, q) => p.attempt_no - q.attempt_no)) {
      if (!firsts.has(r.user_id)) firsts.set(r.user_id, r.s);
      else repeats.set(r.user_id, r.s);
    }
    const small = firsts.size < SMALL_COHORT;
    const mean = (m: Map<string, StudioSummary>, d: FamilyDim) =>
      m.size ? Math.round(([...m.values()].reduce((n, x) => n + (x.levels[d] ?? 0), 0) / m.size) * 10) / 10 : null;
    const critical = [...firsts.values()].filter((x) => x.critical.length || x.claims.length).length;
    return {
      scenario,
      persona: rs[0].persona,
      started: rs.length,
      people,
      submitted: results.length,
      retries: rs.filter((r) => r.attempt_no > 1).length,
      counted: firsts.size,
      suppressed: small,
      criticalFirst: small ? null : { numerator: critical, denominator: firsts.size },
      dims: small
        ? null
        : STUDIO_DIMS.map((d) => ({
            label: d.label,
            first: mean(firsts, d.dim),
            repeat: repeats.size >= SMALL_COHORT ? mean(repeats, d.dim) : null,
            repeatPeople: repeats.size,
          })),
      claims: small
        ? null
        : Object.entries([...firsts.values()].flatMap((x) => x.claims).reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).map(
            ([claim, n]) => ({ claim, people: n }),
          ),
    };
  });
}

/** Objections practised, by referrer and month: attempt counts, with the people behind each cell (small cells say so). */
function objectionHeatmap(rows: SummaryRow[], scenarios: StudioScenario[]) {
  const cells = new Map<string, { persona: string; theme: string; month: string; attempts: number; people: Set<string> }>();
  for (const r of rows) {
    const sc = scenarios.find((x) => x.id === r.scenario_id);
    const theme = sc ? THEMES[sc.theme] : "Unknown";
    const month = r.started_at.slice(0, 7);
    const k = `${r.persona}|${theme}|${month}`;
    const c = cells.get(k) ?? {
      persona: REFERRER_ROLES[r.persona as keyof typeof REFERRER_ROLES]?.label ?? r.persona,
      theme,
      month,
      attempts: 0,
      people: new Set(),
    };
    c.attempts += 1;
    c.people.add(r.user_id);
    cells.set(k, c);
  }
  return [...cells.values()].map((c) => ({
    persona: c.persona,
    theme: c.theme,
    month: c.month,
    attempts: c.attempts,
    people: c.people.size,
    small: c.people.size < SMALL_COHORT,
  }));
}

function materialAggregate(db: Db) {
  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return {
    generated: n("SELECT COUNT(*) AS n FROM referral_assets"),
    kits: n("SELECT COUNT(*) AS n FROM referral_assets WHERE kind = 'kit'"),
    pitchCards: n("SELECT COUNT(*) AS n FROM referral_assets WHERE kind = 'pitchcard'"),
    approvedAtGeneration: n("SELECT COUNT(*) AS n FROM referral_assets WHERE status = 'approved'"),
    draftAtGeneration: n("SELECT COUNT(*) AS n FROM referral_assets WHERE status != 'approved'"),
    downloaded: n("SELECT COUNT(*) AS n FROM referral_assets WHERE downloaded_at IS NOT NULL"),
    copied: n("SELECT COUNT(*) AS n FROM referral_assets WHERE copied_at IS NOT NULL"),
    cardsSaved: n("SELECT COUNT(*) AS n FROM referral_studio_events WHERE event = 'pitch_card_saved'"),
    activityNotes: n("SELECT COUNT(*) AS n FROM referral_activity"),
    businesses: n("SELECT COUNT(DISTINCT org_id) AS n FROM referral_assets"),
  };
}

const PATHWAY_NOTE =
  "Not connected. The referral pathway (introductions, agreements, services commenced) lives in the system authorised for it. No verified source is connected, so nothing is shown and no practice or download is counted as a referral.";

/** The Admin view: the register, the template, and the three layers, each with its own denominator. No learner's words, no partner's notes. */
export function studioAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureStudioTables(db);
  purgeExpired(db, now);
  const reg = claimRegister(db);
  const t = kitTemplate(db);
  const rows = db.prepare("SELECT user_id, scenario_id, persona, attempt_no, result, started_at, place FROM referral_practice").all() as SummaryRow[];
  const blocks = publishedStudios(db);
  const scenarios = [...STUDIO_SCENARIOS, ...blocks.flatMap((b) => b.block.scenarios)];
  return {
    register: reg.map((c) => ({ ...c, state: claimState(c, today(now)), stateLabel: CLAIM_STATE_LABELS[claimState(c, today(now))] })),
    template: { id: t.id, version: t.version, status: t.status, approval: t.approval, dependsOn: templateClaims(t), ...kitStatus(t, reg, today(now)) },
    layers: LAYERS,
    practice: {
      tool: practiceAggregate(rows.filter((r) => r.place === "tool")),
      magazine: practiceAggregate(rows.filter((r) => r.place === "magazine")),
      heatmap: objectionHeatmap(rows, scenarios),
    },
    material: materialAggregate(db),
    pathway: { connected: false, note: PATHWAY_NOTE, statuses: Object.values(PATHWAY_STATUSES).map((x) => x.label) },
    blocks: blocks.map(({ guide, block }) => ({
      guideId: guide.id,
      guide: guide.title,
      blockId: block.id,
      title: block.title,
      scenarios: block.scenarios.map((x) => `${x.id}@${x.version}`).join(", "),
      rationale: block.rationale,
      reviewers: [block.approval.owner, block.approval.pathway, block.approval.partnerships, block.approval.quality, block.approval.privacy].filter(Boolean),
      reviewBy: block.approval.reviewBy,
    })),
  };
}

type GuideRow = { id: string; title: string; doc: string };
function publishedStudios(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.title, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"referralstudio\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is ReferralStudioBlock => b.type === "referralstudio")
      .map((block) => ({ guide: g, block })),
  );
}

/**
  The Excel export: Definitions, Practice aggregate, Asset use, Referral funnel aggregate, Objection trends, Content and
  claim versions. Every row has its date range, scope, metric, numerator, denominator, source, data quality and the
  extraction time. No transcripts, patient identifiers or a partner's commercial data. Restricted to authors, and logged.
*/
export function studioWorkbook(db: Db, actor: User, now: Date) {
  const v = studioAdmin(db, actor, now);
  audit(db, { actor: actor.id, event: "referral_studio.exported", entity: "referral_studio:aggregate", at: now });
  const at = now.toISOString();
  const range = (() => {
    const r = db.prepare("SELECT MIN(started_at) AS a, MAX(started_at) AS b FROM referral_practice").get() as { a: string | null; b: string | null };
    return r.a ? `${r.a.slice(0, 10)} to ${(r.b ?? r.a).slice(0, 10)}` : "No attempts yet";
  })();
  const H = ["Date range", "Scope", "Metric", "Numerator", "Denominator", "Source system", "Data quality", "Extracted at"];
  const row = (scope: string, metric: string, num: number | string | null, den: number | string | null, source: string, quality: string) => [
    range,
    scope,
    metric,
    num ?? "Suppressed",
    den ?? "Suppressed",
    source,
    quality,
    at,
  ];
  const practiceRows = [
    ...v.practice.tool.map((p) => ({ ...p, where: "Work Tool" })),
    ...v.practice.magazine.map((p) => ({ ...p, where: "Magazine" })),
  ].flatMap((p) => [
    row(`${p.where}: ${p.scenario}`, "Attempts started", p.started, "", "Hub practice records", "Complete"),
    row(`${p.where}: ${p.scenario}`, "People who practised", p.people, "", "Hub practice records", "Complete"),
    row(
      `${p.where}: ${p.scenario}`,
      "First attempts with a critical claim flag",
      p.criticalFirst?.numerator ?? null,
      p.criticalFirst?.denominator ?? null,
      "Hub practice records",
      p.suppressed ? `Fewer than ${SMALL_COHORT} people: suppressed` : "Practice evidence, not proof of a real conversation",
    ),
    ...(p.dims ?? []).map((d) =>
      row(
        `${p.where}: ${p.scenario}`,
        `${d.label}: mean of 3, first attempt${d.repeat !== null ? `; repeat ${d.repeat}` : ""}`,
        d.first,
        p.counted,
        "Hub practice records",
        "A learning aid, not a credential or a predictor of referrals",
      ),
    ),
  ]);
  const m = v.material;
  const sheets: Sheet[] = [
    {
      name: "Definitions",
      header: ["Term", "Definition"],
      rows: [
        ["Practice", "Simulated conversations with fictional referrers. A score is a learning aid, not proof of a safe real-world conversation."],
        [
          "Critical claim flag",
          "A phrase the claim register or the scenario marks as unsupported (funding, queue priority, same-day care, a guaranteed start, discharge, patient information).",
        ],
        ["Asset generated", "A kit or pitch card made from the approved template. Not sent: the Hub never sends outreach."],
        ["Downloaded / copied", "The draft was printed to PDF or an email copied. Not evidence an email was sent or a referrer endorsed anything."],
        ["Relationship activity", "A manual note of a meeting or follow-up. Not an introduction or a referral."],
        ...Object.values(PATHWAY_STATUSES).map((x) => [x.label, x.hint]),
        ["Suppression", `Practice measures with fewer than ${SMALL_COHORT} people are suppressed.`],
      ],
      widths: [28, 120],
    },
    { name: "Practice aggregate", header: H, rows: practiceRows, widths: [24, 40, 50, 12, 12, 24, 50, 26] },
    {
      name: "Asset use",
      header: H,
      rows: [
        row("All businesses", "Assets generated", m.generated, "", "Hub asset records", "Complete"),
        row("All businesses", "Approved at generation", m.approvedAtGeneration, m.generated, "Hub asset records", "Complete"),
        row("All businesses", "Downloaded (printed)", m.downloaded, m.generated, "Hub asset records", "Use, not sending"),
        row("All businesses", "Email draft copied", m.copied, m.generated, "Hub asset records", "Use, not sending"),
        row("All businesses", "Pitch cards saved to Favourites", m.cardsSaved, m.pitchCards, "Hub events", "Complete"),
        row("All businesses", "Relationship notes recorded", m.activityNotes, "", "Hub activity records", "Manual entry"),
      ],
      widths: [24, 20, 40, 12, 12, 24, 30, 26],
    },
    {
      name: "Referral funnel aggregate",
      header: H,
      rows: Object.values(PATHWAY_STATUSES).map((x) =>
        row("Not connected", x.label, "Not connected", "Not connected", "None: no verified source", PATHWAY_NOTE),
      ),
      widths: [24, 16, 30, 16, 16, 24, 80, 26],
    },
    {
      name: "Objection trends",
      header: ["Month", "Referrer", "Objection theme", "Attempts", "People", "Note", "Extracted at"],
      rows: v.practice.heatmap.map((c) => [
        c.month,
        c.persona,
        c.theme,
        c.small ? "Suppressed" : c.attempts,
        c.small ? `Fewer than ${SMALL_COHORT}` : c.people,
        "Practised, not real objections",
        at,
      ]),
      widths: [10, 30, 20, 10, 14, 30, 26],
    },
    {
      name: "Content and claim versions",
      header: ["Kind", "ID", "Version", "Topic or title", "Status", "Owner", "Approved by", "Approved on", "Effective from", "Review by", "Source"],
      rows: [
        ...v.register.map((c) => [
          "Claim",
          c.id,
          c.version,
          c.topic,
          c.stateLabel,
          c.owner,
          c.approvedBy,
          c.approvedOn,
          c.effectiveFrom,
          c.reviewBy,
          c.evidence.url || c.evidence.title,
        ]),
        [
          "Template",
          v.template.id,
          v.template.version,
          "Local outreach kit",
          v.template.approved ? "Approved" : "Draft",
          "",
          "",
          v.template.approval.approvedOn,
          "",
          v.template.approval.reviewBy,
          "",
        ],
        ...STUDIO_SCENARIOS.map((s) => ["Scenario (Work Tool)", s.id, s.version, s.title, "Draft (fictional)", "Partner Enablement", "", "", "", "", ""]),
      ],
      widths: [18, 22, 8, 36, 24, 30, 20, 12, 12, 12, 50],
    },
  ];
  return { bytes: workbook(sheets), file: `local-referral-studio-${today(now)}.xlsx` };
}

/** The Problem desk register's "Local Referral Studio" sheet: each published block with its rationale, versions, reviewers and practice totals. */
export function studioRegister(db: Db) {
  ensureStudioTables(db);
  return publishedStudios(db).map(({ guide, block }) => {
    const rows = db
      .prepare("SELECT user_id, scenario_id, persona, attempt_no, result, started_at, place FROM referral_practice WHERE guide_id = ? AND block_id = ?")
      .all(guide.id, block.id) as SummaryRow[];
    const agg = practiceAggregate(rows);
    const people = new Set(rows.map((r) => r.user_id)).size;
    const counted = agg.reduce((n, x) => n + x.counted, 0);
    const suppressed = counted < SMALL_COHORT;
    const crit = agg.reduce((n, x) => n + (x.criticalFirst?.numerator ?? 0), 0);
    return {
      guideId: guide.id,
      guide: guide.title,
      blockId: block.id,
      title: block.title,
      scenarios: block.scenarios.map((x) => `${x.id}@${x.version}`).join(", "),
      evidence: block.rationale.evidence,
      decision: block.rationale.decision || "Not decided",
      measure: block.rationale.measure,
      reviewers:
        [block.approval.owner, block.approval.pathway, block.approval.partnerships, block.approval.quality, block.approval.privacy]
          .filter(Boolean)
          .join("; ") || "Not signed off",
      reviewBy: block.approval.reviewBy,
      started: rows.length,
      people,
      counted,
      suppressed,
      critical: suppressed ? "" : `${crit} of ${counted}`,
    };
  });
}
