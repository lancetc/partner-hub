import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type PhoneCallBlock } from "@/lib/magazine";
import {
  callerLineProblems,
  caseFile,
  cleanFamilyState,
  cleanNote,
  correctTurn,
  cuesNow,
  emptyNote,
  endCall,
  FAMILY_DIM_ORDER,
  FAMILY_ENGINE_VERSION,
  FAMILY_PROMPT_VERSION,
  FAMILY_TURNS_PER_HOUR,
  familyPrompt,
  familyResult,
  familyUsable,
  MAX_FAMILY_REPLY,
  noteFilled,
  NOTE_ORDER,
  openCheck,
  proposalIssues,
  redactDebrief,
  reviewText,
  startState,
  summaryOf,
  takeTurn,
  type FamilyBlock,
  type FamilyDebrief,
  type FamilyDim,
  type FamilyState,
  type FamilySummary,
  type Proposal,
} from "@/lib/familyCall";
import { safetyMatch } from "@/lib/roleplay";
import { PILOT_CHARACTERS } from "@/content/storyPilot";
import { audit, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { askForJson } from "./claudeJson";
import { claudeConfigured, openaiJson, openaiReady } from "./openaiText";
import { voiceOn } from "./roleplay";

/*
  The Tough Family Call on the server (docs/tough-phone-call.md, "Tough Family Call").

  - An attempt freezes the block it started on (the scene, phone case and family case, with its hash and versions), so
    a refresh resumes the same call and a later edit, character update or republish never changes a past attempt.
  - The state is replayed through the same pure engine the editor's preview uses (lib/familyCall). The model, when
    used, only proposes: its intents and evidence are checked against the authored lists and the learner's words, and
    its line is refused for the authored one if it claims anything the state doesn't allow. No model output reaches
    the stored state except validated ids and quotes.
  - Every write is idempotent: a turn has an id (resending it returns the same call), a start resumes the open
    attempt, a submit returns what was submitted, and completion is logged once.
  - Words are the learner's: the transcript and note are kept apart from the result, only for the retention days
    the case sets, then removed. Events and reports carry ids, codes, levels, counts and versions, never words.
  - Nothing here touches a real client record, phone, booking, complaint or message.
*/

export const FAMILY_SCHEMA = `
CREATE TABLE IF NOT EXISTS family_call_attempts (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, revision_id TEXT NOT NULL, block_id TEXT NOT NULL, user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL, scenario_id TEXT NOT NULL, scenario_version TEXT NOT NULL, scenario_hash TEXT NOT NULL,
  rubric_version TEXT NOT NULL, prompt_version TEXT NOT NULL, engine_version TEXT NOT NULL, characters TEXT NOT NULL, sources TEXT NOT NULL,
  mode TEXT NOT NULL, caller TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'text', place TEXT NOT NULL DEFAULT 'magazine', audience TEXT NOT NULL DEFAULT '',
  scenario TEXT NOT NULL, state TEXT NOT NULL, transcript TEXT NOT NULL DEFAULT '[]', note TEXT, result TEXT, debrief TEXT,
  status TEXT NOT NULL, review TEXT NOT NULL DEFAULT '', review_decision TEXT NOT NULL DEFAULT '',
  turns INTEGER NOT NULL DEFAULT 0, voice_turns INTEGER NOT NULL DEFAULT 0, fallbacks INTEGER NOT NULL DEFAULT 0, corrections INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, completed_at TEXT, expires_at TEXT NOT NULL, purged_at TEXT,
  UNIQUE (user_id, guide_id, revision_id, block_id, attempt_no)
);
CREATE INDEX IF NOT EXISTS family_call_attempts_guide ON family_call_attempts (guide_id, block_id);
CREATE INDEX IF NOT EXISTS family_call_attempts_expiry ON family_call_attempts (expires_at);
-- One row per turn, for idempotency and the hourly limit. No words: those are in the attempt's transcript.
CREATE TABLE IF NOT EXISTS family_call_turns (
  attempt_id TEXT NOT NULL, n INTEGER NOT NULL, turn_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (attempt_id, n), UNIQUE (attempt_id, turn_id)
);
CREATE INDEX IF NOT EXISTS family_call_turns_user ON family_call_turns (user_id, at);
`;
const ready = new WeakSet<object>();
export function ensureFamilyTables(db: Db) {
  if (ready.has(db)) return;
  db.exec(FAMILY_SCHEMA);
  ready.add(db);
}

type Status = "active" | "submitted" | "completed" | "exited";
type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  scenario_id: string;
  scenario_version: string;
  scenario_hash: string;
  rubric_version: string;
  prompt_version: string;
  engine_version: string;
  characters: string;
  sources: string;
  mode: string;
  caller: "bounded-ai" | "script";
  channel: "text" | "voice";
  place: string;
  audience: string;
  scenario: string;
  state: string;
  transcript: string;
  note: string | null;
  result: string | null;
  debrief: string | null;
  status: Status;
  review: "" | "needed" | "resolved";
  review_decision: string;
  turns: number;
  voice_turns: number;
  fallbacks: number;
  corrections: number;
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
  corrected: string;
  reply: string;
  by: string;
  at: string;
};

const today = (now: Date) => now.toISOString().slice(0, 10);
const placeOf = (v: unknown) => (typeof v === "string" && /^topic:[a-z0-9-]{1,80}$/.test(v) ? v : "magazine");
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const aiConnected = () => claudeConfigured() || openaiReady();
type FamilyCallBlock = PhoneCallBlock & { family: NonNullable<PhoneCallBlock["family"]> };

/** The call as data, without the block's id: what an attempt is frozen to. */
const frozenOf = (b: FamilyCallBlock): FamilyBlock => ({
  title: b.title,
  person: b.person,
  role: b.role,
  setting: b.setting,
  roleplay: b.roleplay,
  phone: b.phone,
  family: b.family,
});
export const familyHash = (d: FamilyBlock) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureFamilyTables(db);
  purgeExpired(db, new Date());
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "phonecall" || !block.family) throw new HttpError(404, "That family call isn’t here.");
  return { edition, block: block as FamilyCallBlock };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM family_call_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM family_call_attempts WHERE id = ?").get(id) as Row;
const frozen = (a: Row) => JSON.parse(a.scenario) as FamilyBlock;
const stateOf = (a: Row) => cleanFamilyState(frozen(a), JSON.parse(a.state));
const transcriptOf = (a: Row) => JSON.parse(a.transcript) as TranscriptTurn[];

/** One event: ids, codes, levels, counts and versions only, with a key so a consumer counts it once. Never what was said. */
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
      scenario: a.scenario_id,
      scenarioVersion: a.scenario_version,
      scenarioHash: a.scenario_hash,
      rubric: a.rubric_version,
      prompt: a.prompt_version,
      engine: a.engine_version,
      characters: a.characters,
      sources: a.sources,
      mode: a.mode,
      caller: a.caller,
      place: a.place,
      audience: a.audience,
      receivedAt: now.toISOString(),
      ...detail,
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Retention: the words go after the case's retention days; the levels and ending stay
// ---------------------------------------------------------------------------------------------

/** Removes transcripts, notes and quoted words from attempts past their retention date. */
export function purgeExpired(db: Db, now: Date) {
  ensureFamilyTables(db);
  const due = db.prepare("SELECT * FROM family_call_attempts WHERE purged_at IS NULL AND expires_at < ?").all(now.toISOString()) as Row[];
  for (const a of due) {
    const st = stateOf(a);
    const redacted: FamilyState = {
      ...st,
      evals: st.evals.map((e) => ({ ...e, moves: e.moves.map((m) => ({ ...m, quote: "" })), risks: e.risks.map((r) => ({ ...r, quote: "" })) })),
    };
    const note = a.note ? { ...emptyNote(), actions: cleanNote(JSON.parse(a.note)).actions } : null;
    db.prepare("UPDATE family_call_attempts SET transcript = '[]', note = ?, state = ?, debrief = ?, purged_at = ? WHERE id = ?").run(
      note ? JSON.stringify(note) : null,
      JSON.stringify(redacted),
      a.debrief ? JSON.stringify(redactDebrief(JSON.parse(a.debrief) as FamilyDebrief)) : null,
      now.toISOString(),
      a.id,
    );
  }
  return due.length;
}

// ---------------------------------------------------------------------------------------------
// The learner's view
// ---------------------------------------------------------------------------------------------

const voiceRecorded = (f: FamilyBlock["family"]) => Boolean(f.voice.id && f.voice.rights.licence && f.voice.rights.approvedUse && f.voice.rights.recordedOn);
const voiceReady = (id: string) => (id.startsWith("openai:") ? openaiReady() : Boolean(process.env.ELEVENLABS_API_KEY));

export type FamilyView = ReturnType<typeof view>;
function view(db: Db, a: Row | undefined, block: FamilyCallBlock, now: Date) {
  const f = block.family;
  const usable = familyUsable(f, today(now));
  const speak = block.roleplay.voice && voiceOn(db) && openaiReady();
  const base = {
    usable,
    ai: aiConnected() && f.caller === "bounded-ai",
    voice: { speak, listen: voiceRecorded(f) && voiceReady(f.voice.id) },
    versions: { scenario: f.version, rubric: f.rubricVersion, engine: FAMILY_ENGINE_VERSION, prompt: FAMILY_PROMPT_VERSION },
  };
  if (!a)
    return {
      ...base,
      attemptId: null as string | null,
      attemptNo: 0,
      status: "new" as const,
      stage: "brief" as "brief" | "call" | "wrap" | "debrief" | "left",
      caller: (base.ai ? "bounded-ai" : "script") as Row["caller"],
      channel: "text" as Row["channel"],
      call: null,
      transcript: [] as TranscriptTurn[],
      caseFile: caseFile(frozenOf(block), startState(frozenOf(block))),
      cues: [] as ReturnType<typeof cuesNow>,
      notice: "",
      note: emptyNote(),
      debrief: null as FamilyDebrief | null,
      attempts: 0,
      purged: false,
      earlierScenario: false,
    };
  const d = frozen(a);
  const st = stateOf(a);
  const transcript = transcriptOf(a);
  const last = st.evals.at(-1);
  const rule = st.safetyRule ? d.roleplay.safety.find((r) => r.id === st.safetyRule) : undefined;
  return {
    ...base,
    usable,
    attemptId: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    stage: (a.status === "submitted" || a.status === "completed" ? "debrief" : a.status === "exited" ? "left" : st.ended ? "wrap" : "call") as
      "brief" | "call" | "wrap" | "debrief" | "left",
    caller: a.caller,
    channel: a.channel,
    call: {
      turn: st.turn,
      minTurns: d.roleplay.minTurns,
      maxTurns: d.roleplay.maxTurns,
      paused: st.paused,
      ended: st.ended,
      lower: st.lower,
      cuesOn: st.cues,
      safety: rule ? { label: rule.label, guidance: rule.guidance } : null,
    },
    transcript,
    caseFile: caseFile(d, st),
    cues: st.ended ? [] : cuesNow(d, st),
    notice:
      last?.fallback && a.caller === "bounded-ai"
        ? "Fiona’s last line comes from the reviewed script: the AI caller couldn’t answer within the approved facts just then. Nothing you said was lost."
        : "",
    note: a.note ? cleanNote(JSON.parse(a.note)) : emptyNote(),
    debrief: a.debrief ? (JSON.parse(a.debrief) as FamilyDebrief) : null,
    attempts: (
      db
        .prepare("SELECT COUNT(*) AS n FROM family_call_attempts WHERE user_id = ? AND guide_id = ? AND block_id = ?")
        .get(a.user_id, a.guide_id, a.block_id) as {
        n: number;
      }
    ).n,
    purged: Boolean(a.purged_at),
    earlierScenario: a.scenario_hash !== familyHash(frozenOf(block)),
  };
}

/** The learner's own latest attempt at this call. */
export function familyState(db: Db, user: User, guideId: string, blockId: unknown, now = new Date()) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function create(
  db: Db,
  user: User,
  edition: ReturnType<typeof readerEdition>,
  block: FamilyCallBlock,
  attemptNo: number,
  now: Date,
  input: Record<string, unknown>,
) {
  const f = block.family;
  const usable = familyUsable(f, today(now));
  if (!usable.ok) throw new HttpError(410, usable.reason);
  const d = frozenOf(block);
  const st = startState(d, { lower: input.lower === true, cues: input.cues !== false });
  const id = `fc-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  const expires = new Date(now.getTime() + f.privacy.retentionDays * 86_400_000).toISOString();
  const caller: Row["caller"] = f.caller === "bounded-ai" && aiConnected() ? "bounded-ai" : "script";
  const channel: Row["channel"] = input.channel === "voice" ? "voice" : "text";
  db.prepare(
    `INSERT OR IGNORE INTO family_call_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, scenario_id, scenario_version, scenario_hash, rubric_version,
       prompt_version, engine_version, characters, sources, mode, caller, channel, place, audience, scenario, state, status, started_at, updated_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
  ).run(
    id,
    edition.guide.id,
    edition.revision.id,
    block.id,
    user.id,
    attemptNo,
    f.scenarioId,
    f.version,
    familyHash(d),
    f.rubricVersion,
    FAMILY_PROMPT_VERSION,
    FAMILY_ENGINE_VERSION,
    f.characters.map((c) => `${c.id}@${c.version}`).join(","),
    block.phone.sources.map((s) => `${s.id}@${s.version}`).join(","),
    f.mode,
    caller,
    channel,
    placeOf(input.place),
    user.service_role || user.audience,
    JSON.stringify(d),
    JSON.stringify(st),
    at,
    at,
    expires,
  );
  const row = latest(db, user, edition.guide.id, edition.revision.id, block.id)!;
  if (row.id === id) {
    log(db, row, "activity_started", { lower: st.lower, cues: st.cues }, now);
    log(db, row, "call_mode_selected", { channel }, now, "0");
  }
  return row;
}

/** Start (or resume) the call. A resent start returns the open attempt. */
export function startFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    const row = a ?? create(db, user, edition, block, 1, now, input);
    return view(db, row, block, now);
  });
}

function save(db: Db, a: Row, st: FamilyState, now: Date, extra: { transcript?: TranscriptTurn[]; channel?: string; status?: Status } = {}) {
  db.prepare(
    "UPDATE family_call_attempts SET state = ?, transcript = COALESCE(?, transcript), channel = COALESCE(?, channel), status = COALESCE(?, status), turns = ?, voice_turns = ?, fallbacks = ?, corrections = ?, updated_at = ? WHERE id = ?",
  ).run(
    JSON.stringify(st),
    extra.transcript ? JSON.stringify(extra.transcript) : null,
    extra.channel ?? null,
    extra.status ?? null,
    st.turn,
    st.counters.voice,
    st.counters.fallbacks,
    st.counters.corrections,
    now.toISOString(),
    a.id,
  );
}

function active(db: Db, user: User, edition: ReturnType<typeof readerEdition>, block: FamilyCallBlock) {
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (!a) throw new HttpError(409, "Start the call first.");
  return a;
}

/** Opens a case-file section: between replies, before or during the call. Once each. */
export function checkFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition, block);
    if (a.status !== "active") return view(db, a, block, now);
    const d = frozen(a);
    const st = stateOf(a);
    const id = clean(input.check, 80);
    let next: FamilyState;
    try {
      next = openCheck(d, st, id);
    } catch (e) {
      throw new HttpError(404, e instanceof Error ? e.message : "That isn’t part of the case file.");
    }
    if (next === st) return view(db, a, block, now);
    save(db, a, next, now);
    const kind = d.phone.actions.find((x) => x.id === id)?.kind ?? "record";
    log(db, a, "case_file_checked", { check: id, kind, afterTurn: st.turn }, now, id);
    if (id === d.family.sharingCheck) log(db, a, "boundary_checked", { via: "case-file", check: id }, now, `file:${id}`);
    return view(db, reread(db, a.id), block, now);
  });
}

// ---------------------------------------------------------------------------------------------
// One turn: the bounded caller, held to the state
// ---------------------------------------------------------------------------------------------

/** The model adapter: Claude when connected, otherwise OpenAI, through the Hub's existing JSON helpers. Replaceable in tests. */
export type FamilyModel = (prompt: string, check: (v: unknown) => string[]) => Promise<unknown>;
const defaultModel: FamilyModel = async (prompt, check) =>
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

const SPECIAL_FLAGS: Record<string, string> = { complaintOffered: "complaint_route_offered", boundaryExplained: "boundary_checked" };

/**
  A learner's turn, typed or spoken (the same path). Resending the same turn id returns the call as it is. If the model
  is unavailable, its answer doesn't fit the authored lists, or its line strays from the approved facts, the authored
  reply is used, the turn is kept, and the learner is told.
*/
export async function familyTurn(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date, model: FamilyModel = defaultModel) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const turnId = clean(input.turnId, 60);
  if (!turnId) throw new HttpError(400, "That reply can’t be sent. Try again.");
  const a0 = active(db, user, edition, block);
  const seen = db.prepare("SELECT 1 FROM family_call_turns WHERE attempt_id = ? AND turn_id = ?").get(a0.id, turnId);
  if (seen || a0.status !== "active") return view(db, a0, block, now);
  const d = frozen(a0);
  const st0 = stateOf(a0);
  if (st0.ended) throw new HttpError(409, "The call has ended. Write your follow-up note.");
  const text = clean(input.text, MAX_FAMILY_REPLY);
  if (text.length < 2) throw new HttpError(400, "Say or type something first.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (db.prepare("SELECT COUNT(*) AS n FROM family_call_turns WHERE user_id = ? AND at >= ?").get(user.id, since) as { n: number }).n;
  if (recent >= FAMILY_TURNS_PER_HOUR) throw new HttpError(429, "That’s a lot of practice for one hour. Take a break and come back to it.");
  const mode = input.mode === "voice" ? "voice" : "text";
  const heard = mode === "voice" ? clean(input.heard, MAX_FAMILY_REPLY) : "";
  const transcript0 = transcriptOf(a0);

  // The bounded caller, when this attempt uses it and no safety rule stops the turn first.
  let proposal: Proposal | null = null;
  let fallback = "";
  if (a0.caller === "bounded-ai" && !safetyMatch(text, d.roleplay.safety)) {
    try {
      const prompt = familyPrompt(
        d,
        st0,
        transcript0.map((t) => ({ text: t.corrected || t.text, reply: t.reply })),
        text,
      );
      const value = await withTimeout(
        model(prompt, (v) => proposalIssues(v, d)),
        MODEL_TIMEOUT_MS,
      );
      if (proposalIssues(value, d).length) fallback = "invalid";
      else proposal = value as Proposal;
    } catch {
      fallback = "unavailable";
    }
  }

  return tx(db, () => {
    // Re-read: another request may have taken this turn while the model was thinking.
    const a = reread(db, a0.id);
    if (db.prepare("SELECT 1 FROM family_call_turns WHERE attempt_id = ? AND turn_id = ?").get(a.id, turnId) || a.status !== "active" || a.turns !== a0.turns)
      return view(db, a, block, now);
    const st = stateOf(a);
    const out = takeTurn(d, st, { text, mode, proposal });
    let reply = out.authored;
    let by: TranscriptTurn["by"] = out.safety ? "safety" : "script";
    if (proposal && !out.safety) {
      const transcript = transcriptOf(a);
      const problems = callerLineProblems(d, proposal.reply, {
        allowed: out.allowed,
        heard: [...transcript.flatMap((t) => [t.text, t.reply]), text],
        authored: out.authored,
      });
      if (problems.length) fallback = "strayed";
      else {
        reply = [proposal.reply.trim(), out.beat].filter(Boolean).join(" ");
        by = "ai";
      }
    }
    const next: FamilyState = { ...out.state };
    if (fallback && !out.safety) {
      next.counters = { ...next.counters, fallbacks: next.counters.fallbacks + 1 };
      next.evals = next.evals.map((e) => (e.n === out.eval.n ? { ...e, fallback } : e));
    }
    if (by === "ai") next.evals = next.evals.map((e) => (e.n === out.eval.n ? { ...e, by: "ai" } : e));
    const turn: TranscriptTurn = {
      n: out.eval.n,
      turnId,
      mode,
      text,
      heard: heard && heard !== text ? heard : "",
      corrected: "",
      reply,
      by,
      at: now.toISOString(),
    };
    db.prepare("INSERT INTO family_call_turns (attempt_id, n, turn_id, user_id, at) VALUES (?, ?, ?, ?, ?)").run(
      a.id,
      turn.n,
      turnId,
      user.id,
      now.toISOString(),
    );
    save(db, a, next, now, { transcript: [...transcriptOf(a), turn], channel: mode });
    // Events: what changed, never what was said.
    const newFlags = next.flags.filter((x) => !st.flags.includes(x));
    const newBeats = next.fired.filter((x) => !st.fired.includes(x));
    if (newFlags.length || newBeats.length || next.ended)
      log(db, a, "scenario_state_reached", { turn: turn.n, flags: newFlags, beats: newBeats, ended: next.ended }, now, `t${turn.n}`);
    for (const fl of newFlags) if (SPECIAL_FLAGS[fl]) log(db, a, SPECIAL_FLAGS[fl], { via: "call", turn: turn.n }, now, `call:${fl}`);
    if (fallback && !out.safety) log(db, a, "caller_fallback_used", { turn: turn.n, reason: fallback }, now, `t${turn.n}`);
    if (out.safety) log(db, a, "call_paused", { turn: turn.n, reason: "safety", rule: out.safety.id }, now, `safety:${turn.n}`);
    if (mode !== a.channel) log(db, a, "call_mode_selected", { channel: mode, turn: turn.n }, now, `t${turn.n}`);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Pause or resume (no penalty, no timer). Switching between text and voice keeps everything. */
export function controlFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition, block);
    if (a.status !== "active") return view(db, a, block, now);
    const st = stateOf(a);
    if (input.action === "pause" || input.action === "resume") {
      const paused = input.action === "pause";
      if (st.paused === paused || st.ended) return view(db, a, block, now);
      const next = { ...st, paused, counters: { ...st.counters, pauses: st.counters.pauses + (paused ? 1 : 0) } };
      save(db, a, next, now);
      log(db, a, paused ? "call_paused" : "call_resumed", { turn: st.turn }, now, `${st.turn}:${st.counters.pauses}:${paused}`);
    } else if (input.action === "channel") {
      const channel = input.channel === "voice" ? "voice" : "text";
      if (channel === a.channel) return view(db, a, block, now);
      save(db, a, { ...st, counters: { ...st.counters, switches: st.counters.switches + 1 } }, now, { channel });
      log(db, a, "call_mode_selected", { channel, turn: st.turn }, now, `switch:${st.counters.switches + 1}`);
    } else if (input.action === "cues") {
      if (d0(a).family.mode !== "practice") return view(db, a, block, now);
      save(db, a, { ...st, cues: input.on === true }, now);
    }
    return view(db, reread(db, a.id), block, now);
  });
}
const d0 = (a: Row) => frozen(a);

/** Ends the call (to the wrap-up) or leaves the practice (no result, nothing counted against them). */
export function endFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition, block);
    if (a.status !== "active") return view(db, a, block, now);
    const st = stateOf(a);
    const how = input.how === "exit" ? "exit" : "end";
    const next = endCall(frozen(a), st, how);
    if (next === st && how === "end") return view(db, a, block, now);
    save(db, a, next, now, how === "exit" ? { status: "exited" } : {});
    log(db, a, "scenario_state_reached", { turn: st.turn, ended: next.ended }, now, `end:${next.ended}`);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Corrects a spoken line before the result: it's read again by rule; the call itself doesn't change. */
export function correctFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition, block);
    if (a.status !== "active") throw new HttpError(409, "The result is in: a transcript can be corrected only before you submit.");
    const n = Math.round(Number(input.n));
    const text = clean(input.text, MAX_FAMILY_REPLY);
    if (text.length < 2) throw new HttpError(400, "Write what you said.");
    const transcript = transcriptOf(a);
    const t = transcript.find((x) => x.n === n);
    if (!t) throw new HttpError(404, "That reply isn’t in this call.");
    if ((t.corrected || t.text) === text) return view(db, a, block, now);
    let next: FamilyState;
    try {
      next = correctTurn(frozen(a), stateOf(a), n, text);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "That reply can’t be corrected.");
    }
    save(db, a, next, now, { transcript: transcript.map((x) => (x.n === n ? { ...x, corrected: text } : x)) });
    log(db, a, "transcript_correction_requested", { turn: n }, now, `${n}:${next.counters.corrections}`);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Saves the note as a draft, so a reload keeps it. */
export function draftFamilyNote(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = active(db, user, edition, block);
  if (a.status !== "active") return view(db, a, block, now);
  db.prepare("UPDATE family_call_attempts SET note = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(cleanNote(input.note)), now.toISOString(), a.id);
  return view(db, reread(db, a.id), block, now);
}

/** Submits the note: the result and debrief are built from the frozen call and kept as given. A resent submit returns what's there. */
export function submitFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition, block);
    if (a.status !== "active") return view(db, a, block, now);
    const d = frozen(a);
    const st = stateOf(a);
    if (!st.ended) throw new HttpError(409, "End the call first, then write your follow-up note.");
    const note = input.note === undefined && a.note ? cleanNote(JSON.parse(a.note)) : cleanNote(input.note);
    if (!NOTE_ORDER.some((k) => noteFilled(note, k)) && !note.actions.length)
      throw new HttpError(400, "Write your follow-up note, or choose at least one follow-up action, before you see the debrief.");
    const deb = familyResult(d, st, note);
    const summary = summaryOf(deb);
    const at = now.toISOString();
    const needsReview = d.family.mode === "assessed" && summary.review.length > 0;
    db.prepare(
      "UPDATE family_call_attempts SET note = ?, result = ?, debrief = ?, status = 'submitted', review = ?, submitted_at = ?, updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(note), JSON.stringify(summary), JSON.stringify(deb), needsReview ? "needed" : "", at, at, a.id);
    log(db, a, "follow_up_recorded", { fields: NOTE_ORDER.filter((k) => noteFilled(note, k)), actions: note.actions }, now);
    log(
      db,
      a,
      "response_submitted",
      {
        levels: summary.levels,
        score: summary.score,
        codes: summary.codes,
        critical: summary.critical,
        ending: summary.ending,
        defensible: summary.defensible,
        review: summary.review.map((r) => r.split(":")[0]),
        turns: summary.turns,
        voiceTurns: summary.voiceTurns,
        fallbacks: summary.fallbacks,
        corrections: summary.corrections,
      },
      now,
    );
    if (d.family.mode === "assessed") log(db, a, "assessment_attempted", { score: summary.score, passMark: d.family.passMark, review: needsReview }, now);
    return view(db, reread(db, a.id), block, now);
  });
}

/** The debrief has been viewed: complete when there was a briefing, a substantive call, a note and feedback. Once only. */
export function viewedFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (!a || a.status !== "submitted") return view(db, a, block, now);
    const r = JSON.parse(a.result ?? "{}") as FamilySummary;
    const complete = r.substantive;
    db.prepare("UPDATE family_call_attempts SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(
      complete ? now.toISOString() : null,
      now.toISOString(),
      a.id,
    );
    log(db, a, "feedback_viewed", {}, now);
    if (complete) log(db, a, "activity_completed", { ending: r.ending, score: r.score }, now);
    if (a.mode === "assessed" && r.passed === true && a.review !== "needed") log(db, a, "assessment_passed", { score: r.score }, now);
    return view(db, reread(db, a.id), block, now);
  });
}

/** Try again: a fresh attempt. The finished one keeps its versions and debrief. */
export function retryFamily(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a && a.status === "active" && !stateOf(a).ended) return view(db, a, block, now);
    if (a && typeof input.from === "string" && input.from !== a.id) return view(db, a, block, now);
    const row = create(db, user, edition, block, (a?.attempt_no ?? 0) + 1, now, input);
    if (a) log(db, row, "retry_started", { from: a.id }, now);
    return view(db, reread(db, row.id), block, now);
  });
}

/** The learner removes one of their own attempts: their words go now. Events (which hold none) stay. */
export function deleteFamily(db: Db, user: User, input: Record<string, unknown>) {
  ensureFamilyTables(db);
  const a = db.prepare("SELECT id FROM family_call_attempts WHERE id = ? AND user_id = ?").get(String(input.attemptId ?? ""), user.id) as
    { id: string } | undefined;
  if (!a) throw new HttpError(404, "That call isn’t here.");
  tx(db, () => {
    db.prepare("DELETE FROM family_call_turns WHERE attempt_id = ?").run(a.id);
    db.prepare("DELETE FROM family_call_attempts WHERE id = ?").run(a.id);
  });
  return { deleted: true };
}

const ISSUE_KINDS = ["outdated", "incorrect", "unclear", "other"];
/** A learner reports a problem with the case or a source. Only the kind and the source id are kept. */
export function reportFamilySource(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (!a) throw new HttpError(409, "Start the call first.");
  const source = block.phone.sources.some((s) => s.id === input.source) ? String(input.source) : "case";
  const kind = ISSUE_KINDS.includes(String(input.kind)) ? String(input.kind) : "other";
  log(db, a, "source_issue_reported", { source, kind }, now, `${source}:${kind}:${now.getTime()}`);
  return { reported: true };
}

/** A line of the caller's to read aloud: only one already shown in this person's own call. */
export function familyLine(db: Db, user: User, guideId: string, blockId: unknown, n: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  const f = block.family;
  if (!voiceRecorded(f)) throw new HttpError(403, "The caller’s voice isn’t approved yet. The line is there to read.");
  const turn = Math.round(Number(n));
  const voice = { id: f.voice.id, style: f.voice.style };
  if (turn === 0) return { line: block.roleplay.opening, voice };
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  const t = a ? transcriptOf(a).find((x) => x.n === turn) : undefined;
  if (!t || t.by === "safety") throw new HttpError(404, "That line isn’t here.");
  return { line: t.reply, voice };
}

// ---------------------------------------------------------------------------------------------
// Authors, Quality and the Admin view: totals, content health, the review queue and the register
// ---------------------------------------------------------------------------------------------

export const SMALL_COHORT = 5;
type Pick1 = Pick<
  Row,
  "id" | "block_id" | "user_id" | "status" | "result" | "attempt_no" | "turns" | "voice_turns" | "fallbacks" | "corrections" | "review" | "completed_at"
>;

function totals(rows: Pick1[], f: FamilyBlock["family"]) {
  const firsts = new Map<string, FamilySummary>();
  for (const r of [...rows].sort((p, q) => p.attempt_no - q.attempt_no))
    if (r.result && !firsts.has(r.user_id)) firsts.set(r.user_id, JSON.parse(r.result) as FamilySummary);
  const small = firsts.size < SMALL_COHORT;
  const tally = (fn: (x: FamilySummary) => string[]) => {
    const out: Record<string, number> = {};
    for (const x of firsts.values()) for (const k of fn(x)) out[k] = (out[k] ?? 0) + 1;
    return out;
  };
  const turns = rows.reduce((n, r) => n + r.turns, 0);
  const voice = rows.reduce((n, r) => n + r.voice_turns, 0);
  // Only a critical error a reviewer has approved is shown as a pattern; others are counted as awaiting approval.
  const approved = new Set(
    Object.entries(f.risks)
      .filter(([, r]) => r.critical && r.approvedBy && r.approvedOn)
      .map(([k]) => k),
  );
  const crit = small ? null : tally((x) => x.critical);
  return {
    attempts: rows.length,
    people: new Set(rows.map((r) => r.user_id)).size,
    completed: rows.filter((r) => r.completed_at).length,
    retries: rows.filter((r) => r.attempt_no > 1).length,
    textOnly: rows.filter((r) => r.turns > 0 && r.voice_turns === 0).length,
    withVoice: rows.filter((r) => r.voice_turns > 0).length,
    counted: firsts.size,
    suppressed: small,
    levels: small
      ? null
      : (Object.fromEntries(
          FAMILY_DIM_ORDER.map((k) => {
            const l = [0, 0, 0, 0];
            for (const x of firsts.values()) l[x.levels[k] ?? 0] += 1;
            return [k, l];
          }),
        ) as Record<FamilyDim, number[]>),
    endings: small ? null : tally((x) => [x.ending]),
    codes: small ? null : tally((x) => x.codes),
    criticalPatterns: crit ? Object.fromEntries(Object.entries(crit).filter(([k]) => approved.has(k))) : null,
    criticalAwaitingApproval: crit ? Object.keys(crit).filter((k) => !approved.has(k)).length : null,
    practised: small ? null : [...firsts.values()].filter((x) => x.recommendation === "practised").length,
    passed: small || f.mode !== "assessed" ? null : [...firsts.values()].filter((x) => x.passed === true).length,
    health: {
      turns,
      fallbackRate: turns ? Math.round((rows.reduce((n, r) => n + r.fallbacks, 0) / turns) * 100) / 100 : 0,
      voiceTurns: voice,
      correctionRate: voice ? Math.round((rows.reduce((n, r) => n + r.corrections, 0) / voice) * 100) / 100 : 0,
      reviewQueue: rows.filter((r) => r.review === "needed").length,
      reviewFlags: [...firsts.values()].filter((x) => x.review.length).length,
    },
  };
}

/** Totals for a course's authors: counts, and with enough people the levels, endings and codes. Never who said what. */
export function familyStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureFamilyTables(db);
  const rows = db
    .prepare(
      "SELECT id, block_id, user_id, status, result, attempt_no, turns, voice_turns, fallbacks, corrections, review, completed_at, scenario FROM family_call_attempts WHERE guide_id = ?",
    )
    .all(guideId) as (Pick1 & { scenario: string })[];
  const blocks = new Map<string, typeof rows>();
  for (const r of rows) blocks.set(r.block_id, [...(blocks.get(r.block_id) ?? []), r]);
  return { blocks: [...blocks.entries()].map(([blockId, rs]) => ({ blockId, ...totals(rs, (JSON.parse(rs.at(-1)!.scenario) as FamilyBlock).family) })) };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string };
function publishedCalls(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"family\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is FamilyCallBlock => b.type === "phonecall" && Boolean(b.family))
      .map((b) => ({ guide: g, block: b })),
  );
}
const audienceOf = (g: GuideRow) => {
  try {
    return (JSON.parse(g.audience) as string[]).join(", ") || "Everyone signed in";
  } catch {
    return g.audience || "Everyone signed in";
  }
};
const sourceIssues = (db: Db, guideId: string, blockId: string) =>
  (
    db.prepare("SELECT COUNT(*) AS n FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'source_issue_reported'").get(guideId, blockId) as {
      n: number;
    }
  ).n;
/** Character continuity: details not yet in the library's canon, and canon references that don't resolve. */
function continuityIssues(f: FamilyBlock["family"]) {
  const out: string[] = [];
  for (const c of f.continuity) {
    const ch = PILOT_CHARACTERS.find((x) => x.id === c.character);
    if (!ch) out.push(`“${c.character}” isn’t in the character library.`);
    else if (!c.canon) out.push(`New detail for ${ch.name}’s story owner: ${c.text}`);
    else if (!ch.profile.facts.some((x) => x.id === c.canon)) out.push(`${ch.name}: the canon fact “${c.canon}” isn’t in the library.`);
  }
  return out;
}
const favouritesOf = (db: Db, snippetId: string) => {
  try {
    return (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE kind = 'job_aid' AND target_id = ?").get(snippetId) as { n: number }).n;
  } catch {
    return 0; // The Favourites tables aren't created until someone first uses Work Tools.
  }
};

/**
  The Admin view: every published family call with participation (text and voice treated alike), rubric levels with
  denominators (suppressed under five people), human-approved critical patterns only, content health, the learning-
  to-work trace and the review queue (reasons only: quoted words need `reviewDetail`, which is audited).
*/
export function familyCallsAdmin(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  ensureFamilyTables(db);
  purgeExpired(db, now);
  const calls = publishedCalls(db).map(({ guide, block }) => {
    const rows = db
      .prepare(
        "SELECT id, block_id, user_id, status, result, attempt_no, turns, voice_turns, fallbacks, corrections, review, completed_at FROM family_call_attempts WHERE guide_id = ? AND block_id = ?",
      )
      .all(guide.id, block.id) as Pick1[];
    const f = block.family;
    const queue = db
      .prepare("SELECT id, result, submitted_at FROM family_call_attempts WHERE guide_id = ? AND block_id = ? AND review = 'needed' ORDER BY submitted_at")
      .all(guide.id, block.id) as { id: string; result: string; submitted_at: string }[];
    return {
      guideId: guide.id,
      guide: guide.title,
      blockId: block.id,
      title: block.title,
      scenario: `${f.scenarioId} · ${f.version}`,
      rubric: f.rubricVersion,
      mode: f.mode,
      caller: f.caller,
      audience: audienceOf(guide),
      usable: familyUsable(f, today(now)),
      totals: totals(rows, f),
      health: {
        staleSources: block.phone.sources.filter((s) => s.reviewBy && s.reviewBy < today(now)).map((s) => s.title),
        sourceIssues: sourceIssues(db, guide.id, block.id),
        continuity: continuityIssues(f),
      },
      work: {
        theme: f.rationale.theme,
        decision: f.rationale.decision || "Not decided",
        register: f.rationale.register || "Not decided",
        measure: f.rationale.measure || "Not set: an owned gap, not evidence",
        jobAid: f.jobAid.snippetId,
        favourites: favouritesOf(db, f.jobAid.snippetId),
      },
      queue: queue.map((q) => ({
        attemptId: q.id,
        submitted: q.submitted_at,
        reasons: (JSON.parse(q.result) as FamilySummary).review.map((r) => ({ code: r, text: reviewText(r) })),
      })),
    };
  });
  return { calls };
}

/** A reviewer opens a flagged attempt's evidence: the flagged moments only. Every access is audited. */
export function reviewDetail(db: Db, actor: User, attemptId: unknown, now: Date) {
  requireAuthor(actor);
  ensureFamilyTables(db);
  const a = db.prepare("SELECT * FROM family_call_attempts WHERE id = ? AND review = 'needed'").get(String(attemptId ?? "")) as Row | undefined;
  if (!a) throw new HttpError(404, "That attempt isn’t waiting for review.");
  audit(db, { actor: actor.id, event: "family_call.transcript_viewed", entity: `family_call:${a.id}`, at: now });
  const deb = a.debrief ? (JSON.parse(a.debrief) as FamilyDebrief) : null;
  return {
    attemptId: a.id,
    review: deb?.review.map((r) => ({ code: r, text: reviewText(r) })) ?? [],
    moments: (deb?.moments ?? []).filter((m) => m.review || !m.good).map((m) => ({ turn: m.turn, quote: m.quote, behaviour: m.behaviour })),
    critical: (deb?.criticalFindings ?? []).map((c) => ({ risk: c.risk, text: c.text, by: c.by, approved: c.approved, turn: c.turn, quote: c.quote })),
    purged: Boolean(a.purged_at),
  };
}

const DECISIONS = ["passed", "not-passed", "formative-only"];
/** A reviewer settles a flagged assessed attempt. Audited; a pass is logged once. */
export function resolveReview(db: Db, actor: User, input: Record<string, unknown>, now: Date) {
  requireAuthor(actor);
  ensureFamilyTables(db);
  const decision = String(input.decision ?? "");
  if (!DECISIONS.includes(decision)) throw new HttpError(400, "Choose passed, not passed, or formative only.");
  return tx(db, () => {
    const a = db.prepare("SELECT * FROM family_call_attempts WHERE id = ? AND review = 'needed'").get(String(input.attemptId ?? "")) as Row | undefined;
    if (!a) throw new HttpError(404, "That attempt isn’t waiting for review.");
    db.prepare("UPDATE family_call_attempts SET review = 'resolved', review_decision = ?, updated_at = ? WHERE id = ?").run(decision, now.toISOString(), a.id);
    audit(db, { actor: actor.id, event: "family_call.review_resolved", entity: `family_call:${a.id}`, next: { decision }, at: now });
    log(db, a, "review_resolved", { decision }, now);
    if (decision === "passed" && a.mode === "assessed") log(db, a, "assessment_passed", { reviewed: true }, now);
    return { resolved: true, decision };
  });
}

/**
  The decision register's "Tough family calls" sheet (server/problemDesk export): each published call with its
  rationale, versions, audience, dates, reviewers, aggregate levels with denominators, Job Aid, work-measure link and
  the keep/revise/retarget/withdraw decision. No transcript, audio, note or per-worker reading; under five people,
  counts only.
*/
export function familyRegister(db: Db) {
  ensureFamilyTables(db);
  return publishedCalls(db).map(({ guide, block }) => {
    const rows = db
      .prepare(
        "SELECT id, block_id, user_id, status, result, attempt_no, turns, voice_turns, fallbacks, corrections, review, completed_at FROM family_call_attempts WHERE guide_id = ? AND block_id = ?",
      )
      .all(guide.id, block.id) as Pick1[];
    const f = block.family;
    const t = totals(rows, f);
    const firsts = new Map<string, FamilySummary>();
    for (const r of [...rows].sort((p, q) => p.attempt_no - q.attempt_no))
      if (r.result && !firsts.has(r.user_id)) firsts.set(r.user_id, JSON.parse(r.result) as FamilySummary);
    const mean = (k: FamilyDim) =>
      t.suppressed ? "" : `${Math.round(([...firsts.values()].reduce((n, x) => n + (x.levels[k] ?? 0), 0) / firsts.size) * 10) / 10} of 3 (n=${firsts.size})`;
    const ap = block.phone.approval;
    const fa = f.approval;
    return {
      responseId: `${f.scenarioId}:${block.id}`,
      guideId: guide.id,
      guide: guide.title,
      title: block.title,
      rationale: [f.rationale.theme, f.rationale.whyFit].filter(Boolean).join(" — "),
      rationaleDecision: f.rationale.decision || "Not decided",
      scenario: f.version,
      rubric: f.rubricVersion,
      sources: block.phone.sources.map((s) => `${s.id}@${s.version}`).join("; "),
      audience: audienceOf(guide),
      release: fa.effectiveFrom,
      reviewBy: fa.reviewBy,
      reviewers:
        [ap.owner, ap.operations, ap.quality, ap.privacy, fa.story, fa.complaints, fa.policy, fa.accessibility, fa.escalation].filter(Boolean).join("; ") ||
        "Not signed off",
      mode: f.mode,
      started: t.people,
      completed: t.completed,
      retries: t.retries,
      textOnly: t.textOnly,
      withVoice: t.withVoice,
      people: t.counted,
      suppressed: t.suppressed,
      dims: Object.fromEntries(FAMILY_DIM_ORDER.map((k) => [k, mean(k)])) as Record<FamilyDim, string>,
      critical: t.criticalPatterns
        ? Object.entries(t.criticalPatterns)
            .map(([k, n]) => `${k} ${n}`)
            .join("; ") || "None"
        : "",
      review: t.health.reviewQueue,
      fallbackRate: t.health.fallbackRate,
      corrections: t.health.correctionRate,
      jobAid: f.jobAid.snippetId,
      favourites: favouritesOf(db, f.jobAid.snippetId),
      measure: f.rationale.measure,
      decision: f.rationale.register || "Not decided",
    };
  });
}
