import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, readGuideDoc, type XRayBlock } from "@/lib/magazine";
import { applyChanges, buildDebrief, cleanState, emptyState, finishProblems, scoreXRay, submitLines, type XRayResult, type XRayState } from "@/lib/xray";
import {
  ASK_ORDER,
  ASK_WHO,
  codeLabel,
  coachFacts,
  coachIssues,
  coachPrompt,
  fundingDebrief,
  fundingScriptCheck,
  PRICE_CONTEXTS,
  reviewedCoach,
  ROUTES,
  scoreFunding,
  staleSources,
  type AskWho,
  type CoachPoint,
  type FundingResult,
} from "@/lib/xrayFunding";
import { audit, ensureXRay, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { askForJson } from "./claudeJson";
import { claudeConfigured, openaiJson, openaiReady } from "./openaiText";

/*
  Invoice X-Ray (docs/invoice-xray.md): saving a learner's work on a document, and reading it against the
  reviewed answer key. The rules and the arithmetic live in lib/xray and lib/xrayFunding, so the learner's page, the
  editor's preview and this file all run the same ones.

  - The answer key and the model script stay here until the learner has submitted.
  - Nothing here creates a claim, payment, reimbursement, supplier approval or message.
  - A learner's choices and words are theirs. Authors see totals, never the words.

  Quote and invoice review mode (lib/xrayFunding) adds:
  - the Hub's common events (activity_started, response_submitted, feedback_viewed, activity_completed, and in assessed
    mode assessment_attempted and assessment_passed) and the specialist ones, each with an idempotency key and the
    block, scenario, source and rubric versions, and never a learner's words;
  - a submitted or finished attempt that a resent request can't change, score twice or duplicate;
  - each finished attempt keeps its result with its versions, so a later rule change never rescores it;
  - optional coaching on the explanation, bound to the approved facts; without a model, or when its reply fails the
    checks, the reviewed coaching stands and the verdict never moves.
*/

export const ENGINE_VERSION = "xray-review-engine-1";
export const RUBRIC_VERSION = "xray-review-rubric-1";
/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

type AttemptRow = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  key_hash: string;
  state: string;
  result: string | null;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};
type Versions = { engine: string; rubric: string; scenario: string; ruleSet: string; sources: string[]; keyHash: string };
type StoredFunding = FundingResult & { versions?: Versions };

/** Changes when the document or its answer key does, so an attempt says which version it was read against. A classic case hashes as it always did. */
const keyHash = (b: XRayBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ l: b.lines, r: b.rate, n: b.next, e: b.explain, p: b.phase, d: b.decisionDate, f: b.funding }))
    .digest("hex")
    .slice(0, 12);

const today = (now: Date) => now.toISOString().slice(0, 10);
const versionsOf = (b: XRayBlock): Versions => ({
  engine: ENGINE_VERSION,
  rubric: RUBRIC_VERSION,
  scenario: b.funding?.version ?? "",
  ruleSet: b.funding?.ruleSet ?? "",
  sources: (b.funding?.sources ?? []).map((s) => `${s.id}@${s.version || "unversioned"}`),
  keyHash: keyHash(b),
});

/** Whether new attempts can start: an assessed review case resting on a source past its review date is held, and isn't served as current. */
export function xrayUsable(b: XRayBlock, day: string) {
  if (b.funding?.mode === "assessed" && staleSources(b.funding, day).length)
    return { ok: false, reason: "This assessed case rests on a source that’s due for review. It’s held until its owner approves the new version." };
  return { ok: true, reason: "" };
}

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureXRay(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "xray") throw new HttpError(404, "That document isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM xray_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1")
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;

type Who = Pick<AttemptRow, "user_id" | "guide_id" | "revision_id" | "block_id"> & { id?: string; key_hash?: string };
const eventKey = (a: Who, event: string, sub: string) => `${a.id ?? ""}:${event}${sub ? `:${sub}` : ""}`;

/** A classic case's events keep their names and shape. A review case's carry its key, versions and the learner's role, and never their words. */
function log(db: Db, a: Who, event: string, detail: object, now: Date, block?: XRayBlock, user?: User, sub = "") {
  const review = block?.funding
    ? {
        key: eventKey(a, event, sub),
        attempt: a.id,
        keyHash: a.key_hash,
        scenario: block.funding.version,
        ruleSet: block.funding.ruleSet,
        rubric: RUBRIC_VERSION,
        engine: ENGINE_VERSION,
        mode: block.funding.mode,
        documentMode: block.phase === "quote" ? "quote" : "invoice",
        documentRole: block.funding.documentRole,
        role: user?.service_role ?? "",
        place: "magazine",
      }
    : {};
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({ ...review, ...detail }),
  );
}
/** The same, once per key: a resent signal, a double click or a refreshed page doesn't count twice. */
function logOnce(db: Db, a: Who, event: string, detail: object, now: Date, block: XRayBlock, user: User, sub = "") {
  const seen = db
    .prepare("SELECT 1 FROM magazine_events WHERE user_id = ? AND guide_id = ? AND block_id = ? AND event = ? AND json_extract(detail, '$.key') = ?")
    .get(a.user_id, a.guide_id, a.block_id, event, eventKey(a, event, sub));
  if (!seen) log(db, a, event, detail, now, block, user, sub);
  return !seen;
}

/** The authored answers a learner has asked for so far: what they'd hear back. */
function repliesFor(block: XRayBlock, state: XRayState) {
  const f = block.funding;
  if (!f) return [];
  return block.lines.flatMap((l) => (state.picks[l.id]?.ask ?? []).map((who) => ({ lineId: l.id, who, text: replyOf(block, l.id, who) })));
}
const replyOf = (block: XRayBlock, lineId: string, who: AskWho) =>
  block.funding?.asks.find((x) => x.who === who && x.lineId === lineId)?.reply ??
  block.funding?.asks.find((x) => x.who === who && !x.lineId)?.reply ??
  `${ASK_WHO[who]} can’t add anything about this line.`;

function view(a: AttemptRow | undefined, block: XRayBlock, now = new Date()) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  if (block.funding) {
    const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as StoredFunding) : null;
    return {
      attemptId: a?.id ?? null,
      status: a?.status ?? ("new" as const),
      state,
      draft: state.stage >= 1 ? block.explain.draft : null,
      debrief: null,
      review: result ? fundingDebrief(block, state, result) : null,
      replies: repliesFor(block, state),
      earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
      usable: xrayUsable(block, today(now)),
      versions: result?.versions ?? versionsOf(block),
    };
  }
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as XRayResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    /** Once the lines are in: the starting draft for the explanation, which is reviewed text. */
    draft: state.stage >= 1 ? block.explain.draft : null,
    debrief: result ? buildDebrief(block, state, result) : null,
    review: null,
    replies: [] as ReturnType<typeof repliesFor>,
    earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
    usable: { ok: true, reason: "" },
    versions: null,
  };
}

export function xrayState(db: Db, user: User, guideId: string, blockId: unknown, now = new Date()) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: XRayBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const usable = xrayUsable(block, today(now));
  if (!usable.ok) throw new HttpError(409, usable.reason);
  const id = `xr-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO xray_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), JSON.stringify(emptyState()), at, at);
  const row = db.prepare("SELECT * FROM xray_attempts WHERE id = ?").get(id) as AttemptRow;
  if (block.funding) log(db, row, a ? "retry_started" : "activity_started", a ? { from: a.id } : {}, now, block, user);
  else log(db, row, a ? "xray.retry" : "xray.started", {}, now);
  return row;
}

const stored = (a: AttemptRow, block: XRayBlock) => cleanState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, state: XRayState, now: Date) {
  db.prepare("UPDATE xray_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM xray_attempts WHERE id = ?").get(id) as AttemptRow;

/** Saves the learner's choices and script as they go. After the debrief, it also takes the changed-fact retry. */
export function saveXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    const row = a ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const next = applyChanges(block, stored(row, block), input.state);
    store(db, row, next, now);
    return { saved: true };
  });
}

/**
  Submits the sorted lines. A critical mistake comes back with why; otherwise the explanation step opens. Idempotent:
  once the lines are in (or the attempt is finished), a resent submit returns the attempt as it is, with no new try,
  score or event.
*/
export function submitXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const last = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (last && (last.status === "finished" || stored(last, block).stage >= 1))
      return { step: { critical: [] as { lineId: string | null; text: string }[] }, id: last.id };
    const a = last ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const step = submitLines(block, s);
    if ("problem" in step) return { problem: step.problem };
    store(db, a, step.state, now);
    if (block.funding) {
      const r = scoreFunding(block, step.state);
      // Each try that reaches the server is one response; the decisions and routes are codes, never words.
      log(
        db,
        a,
        "classification_selected",
        { try: step.state.tries, decisions: Object.fromEntries(block.lines.map((l) => [l.id, step.state.picks[l.id]?.decision ?? ""])) },
        now,
        block,
        user,
      );
      log(
        db,
        a,
        "funding_route_selected",
        { try: step.state.tries, routes: Object.fromEntries(block.lines.map((l) => [l.id, step.state.picks[l.id]?.route ?? ""])) },
        now,
        block,
        user,
      );
      log(
        db,
        a,
        "response_submitted",
        {
          try: step.state.tries,
          critical: step.critical.length,
          overall: step.state.overall ?? "",
          next: step.state.next,
          codes: [...new Set(r.lines.flatMap((x) => x.codes))],
          decisionsRight: r.lines.filter((x) => x.decisionRight).length,
          lines: r.lines.length,
        },
        now,
        block,
        user,
      );
    } else log(db, a, "xray.submitted", { critical: step.critical.length, tries: step.state.tries }, now);
    return { step, id: a.id };
  });
  if ("problem" in out) throw new HttpError(400, out.problem ?? "Not yet.");
  return { critical: out.step.critical, ...view(reread(db, out.id), block, now) };
}

/** Finishes, once each part of the explanation is there and none of it says something that makes it wrong. A resent finish returns the finished attempt. */
export function finishXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const last = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (last?.status === "finished") return { id: last.id };
    const a = last ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const problems = finishProblems(block, s);
    if (problems.length) {
      // A phrase that makes it wrong counts against the explanation, even once it's fixed.
      const tried = s.stage === 1 && problems.some((p) => p.startsWith("“")) ? { ...s, scriptTries: s.scriptTries + 1 } : s;
      store(db, a, tried, now);
      return { problems };
    }
    const at = now.toISOString();
    if (block.funding) {
      const result: StoredFunding = { ...scoreFunding(block, s), versions: versionsOf(block) };
      db.prepare("UPDATE xray_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
        JSON.stringify(s),
        JSON.stringify(result),
        keyHash(block),
        at,
        at,
        a.id,
      );
      const row = { ...a, key_hash: keyHash(block) };
      const check = fundingScriptCheck(block, s.script);
      // Which parts the explanation covers, whether its source supports it, and where coaching came from: never the explanation.
      logOnce(
        db,
        row,
        "explanation_submitted",
        {
          covered: check.covered.filter((c) => c.met).map((c) => c.id),
          of: check.covered.length,
          citeValid: result.explanation.citeValid,
          avoidedTries: s.scriptTries,
          coach: s.coach?.source ?? null,
        },
        now,
        block,
        user,
      );
      if (block.funding.mode === "assessed")
        logOnce(db, row, "assessment_attempted", { passed: result.passed, critical: result.criticalFirstTry }, now, block, user);
      return { id: a.id };
    }
    const result = scoreXRay(block, s);
    db.prepare("UPDATE xray_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(s),
      JSON.stringify(result),
      keyHash(block),
      at,
      at,
      a.id,
    );
    log(db, a, "xray.finished", { flags: result.flags }, now);
    return { id: a.id };
  });
  if (out.problems) throw new HttpError(400, `Not yet. ${out.problems.join(" ")}`);
  return view(reread(db, out.id!), block, now);
}

export function restartXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  });
}

// ---------------------------------------------------------------------------------------------
// Quote and invoice review: what was opened, who was asked, the debrief seen, and coaching
// ---------------------------------------------------------------------------------------------

const SIGNALS = ["document_line_opened", "source_checked", "source_issue_reported"] as const;
/** What the learner opened (a line, a source, a piece of evidence) or flagged. Ids only, once each per attempt. Opening is recorded so the debrief can say what was checked. */
export function signalXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const f = block.funding;
  if (!f) throw new HttpError(400, "This document doesn’t record that.");
  const name = SIGNALS.find((x) => x === input.name);
  const ref = typeof input.ref === "string" ? input.ref : "";
  if (!name) throw new HttpError(400, "That isn’t a signal this document records.");
  const isLine = block.lines.some((l) => l.id === ref);
  const isSource = f.sources.some((s) => s.id === ref);
  const isEvidence = f.evidence.some((e) => e.id === ref);
  const valid = name === "document_line_opened" ? isLine : name === "source_checked" ? isSource || isEvidence : isSource;
  if (!valid) throw new HttpError(400, "That isn’t part of this document.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id) ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "active" && name !== "source_issue_reported") {
      const s = stored(a, block);
      const id = isLine ? `line:${ref}` : ref;
      if (!(s.opened ?? []).includes(id)) store(db, a, { ...s, opened: [...(s.opened ?? []), id] }, now);
    }
    const logged = logOnce(
      db,
      a,
      name,
      isLine ? { line: ref } : isSource ? { source: ref, version: f.sources.find((s) => s.id === ref)?.version ?? "" } : { evidence: ref },
      now,
      block,
      user,
      ref,
    );
    return { logged };
  });
}

/** Asking someone for what's missing: the authored answer, recorded once per line and person. It narrows what's known; it never decides. */
export function askXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  if (!block.funding) throw new HttpError(400, "This document doesn’t have anyone to ask.");
  const who = ASK_ORDER.find((x) => x === input.who);
  const lineId = typeof input.lineId === "string" && block.lines.some((l) => l.id === input.lineId) ? input.lineId : "";
  if (!who || !lineId) throw new HttpError(400, "Choose a line and who to ask.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id) ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    // Before the lines are in, asking is part of the answer: it's recorded on the line.
    if (a.status === "active" && s.stage === 0) {
      const p = s.picks[lineId] ?? { outcome: "", account: "", reason: "", evidence: [], decision: "", route: "", ask: [], cite: "" };
      if (!(p.ask ?? []).includes(who)) store(db, a, { ...s, picks: { ...s.picks, [lineId]: { ...p, ask: [...(p.ask ?? []), who] } } }, now);
    }
    logOnce(db, a, "missing_information_requested", { line: lineId, who }, now, block, user, `${lineId}:${who}`);
    return { lineId, who, reply: replyOf(block, lineId, who) };
  });
}

/** The debrief has been seen: the activity is complete (and, in assessed mode, passed if it was). Once per attempt. */
export function viewedXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "finished" && a.result && block.funding) {
      const r = JSON.parse(a.result) as StoredFunding;
      if (logOnce(db, a, "feedback_viewed", {}, now, block, user)) {
        logOnce(db, a, "activity_completed", { overall: r.overall.chosen, pendingRight: r.pendingRight }, now, block, user);
        if (block.funding.mode === "assessed" && r.passed) logOnce(db, a, "assessment_passed", {}, now, block, user);
      }
    }
    return view(a, block, now);
  });
}

const COACH_PER_HOUR = 20;
/**
  Coaching on the explanation. A model is asked only when the author has turned coaching on and one is connected; its
  reply has to cite the approved facts, keep to the fixed verdict and add no figure or source. Otherwise the reviewed
  coaching stands. Either way the verdict, the scores and the stored answer don't change.
*/
export async function coachXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  if (!block.funding) throw new HttpError(400, "This document has no explanation coaching.");
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  if (!a) throw new HttpError(400, "Decide the lines first.");
  const s0 = stored(a, block);
  if (s0.stage < 1) throw new HttpError(400, "Decide the lines first.");
  // Coaching reads the latest words, but only stores them while the attempt is open.
  const s = a.status === "active" && input.state ? applyChanges(block, s0, input.state) : s0;
  const facts = coachFacts(block, s);
  let result: { source: "ai" | "reviewed"; points: CoachPoint[] } = { source: "reviewed", points: reviewedCoach(block, s) };
  const text = [s.script.ack, s.script.rule, s.script.split, s.script.next].join(" ").trim();
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'xray.coached' AND at >= ?").get(user.id, since) as { n: number }).n;
  let fallback = "";
  if (block.funding.aiCoach && text.length >= 40 && recent < COACH_PER_HOUR && (claudeConfigured() || openaiReady())) {
    const check = (v: unknown) => coachIssues(v, block, facts);
    try {
      const prompt = coachPrompt(block, s, facts);
      const v = claudeConfigured()
        ? (await askForJson<{ points: CoachPoint[] }>([{ type: "text", text: prompt }], check, { onText: () => {}, onPhase: () => {} }, "low")).value
        : await openaiJson<{ points: CoachPoint[] }>(prompt, check);
      if (!check(v).length) result = { source: "ai", points: v.points.map((p) => ({ kind: p.kind, text: p.text.trim(), facts: p.facts })) };
      else fallback = "The coaching didn’t keep to the approved facts, so the reviewed feedback is shown instead.";
    } catch {
      fallback = "Coaching isn’t available right now. The reviewed feedback is shown instead.";
    }
    audit(db, { actor: user.id, event: "xray.coached", entity: `magazine:${guideId}`, next: { source: result.source }, at: now });
  }
  if (a.status === "active") store(db, a, { ...s, coach: result }, now);
  return {
    ...result,
    fallback,
    /** The fixed verdict: coaching never moves it. */
    verdict: block.funding.lines.find((l) => l.lineId === block.explain.lineId)?.decision ?? "",
    facts: facts.filter((x) => result.points.some((p) => p.facts.includes(x.id))).map((x) => ({ id: x.id, text: x.text })),
  };
}

// ---------------------------------------------------------------------------------------------
// Authors: totals, the misconception view and the decision register
// ---------------------------------------------------------------------------------------------

type Totals = ReturnType<typeof reviewTotals>;
/** A review block's totals from its attempts: first and latest finished attempts per person; breakdowns need five people. */
function reviewTotals(db: Db, guideId: string, block: XRayBlock, rows: Pick<AttemptRow, "user_id" | "status" | "result" | "started_at">[]) {
  const f = block.funding!;
  const finished = rows.filter((r) => r.status === "finished" && r.result).sort((p, q) => p.started_at.localeCompare(q.started_at));
  const firsts = new Map<string, StoredFunding>();
  const lasts = new Map<string, StoredFunding>();
  for (const r of finished) {
    const res = JSON.parse(r.result!) as StoredFunding;
    if (res.kind !== "funding") continue;
    if (!firsts.has(r.user_id)) firsts.set(r.user_id, res);
    lasts.set(r.user_id, res);
  }
  const small = firsts.size < SMALL_COHORT;
  const tally = (fn: (x: StoredFunding) => string[]) => {
    const out: Record<string, number> = {};
    for (const x of firsts.values()) for (const k of new Set(fn(x))) out[k] = (out[k] ?? 0) + 1;
    return out;
  };
  const lineOf = (id: string) => f.lines.find((l) => l.lineId === id);
  const count = (event: string) =>
    (
      db
        .prepare("SELECT COUNT(DISTINCT json_extract(detail, '$.attempt')) AS n FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = ?")
        .get(guideId, block.id, event) as { n: number }
    ).n;
  const sourceIssues = Object.fromEntries(
    (
      db
        .prepare(
          "SELECT json_extract(detail, '$.source') AS source, COUNT(*) AS n FROM magazine_events WHERE guide_id = ? AND block_id = ? AND event = 'source_issue_reported' GROUP BY source",
        )
        .all(guideId, block.id) as { source: string; n: number }[]
    ).map((r) => [r.source, r.n]),
  ) as Record<string, number>;
  const openReviewed = f.lines.filter((l) => l.decision && l.decision !== "ready" && l.decision !== "out_of_scope" && l.decision !== "other_route");
  const retried = [...lasts.keys()].filter((u) => finished.filter((r) => r.user_id === u).length > 1);
  const people = new Set(rows.map((r) => r.user_id)).size;
  return {
    blockId: block.id,
    mode: f.mode,
    attempts: rows.length,
    people,
    finished: finished.length,
    completed: count("activity_completed"),
    retries: rows.length - people,
    counted: firsts.size,
    suppressed: small,
    critical: small ? null : [...firsts.values()].filter((x) => x.criticalFirstTry > 0).length,
    /** Misconceptions by code, at each person's first finished attempt. */
    codes: small ? null : tally((x) => x.codes),
    /** Lines decided wrongly, by the line's price context (its "line type") and its funding route. */
    byLineType: small ? null : tally((x) => x.lines.filter((l) => !l.decisionRight).map((l) => PRICE_CONTEXTS[lineOf(l.id)?.priceContext ?? "unknown"].label)),
    byRoute: small ? null : tally((x) => x.lines.filter((l) => !l.routeRight).map((l) => ROUTES[lineOf(l.id)?.route || "unknown"])),
    byRuleVersion: small ? null : tally((x) => (x.codes.length ? [x.versions?.ruleSet || "unversioned"] : [])),
    /** Correct use of "needs more information": open lines kept open, and pending clarification chosen when warranted. */
    neededMore: small
      ? null
      : {
          openLinesKeptOpen: [...firsts.values()].reduce(
            (n, x) => n + x.lines.filter((l) => openReviewed.some((o) => o.lineId === l.id) && l.decisionRight).length,
            0,
          ),
          openLines: openReviewed.length * firsts.size,
          pendingRight: [...firsts.values()].filter((x) => x.pendingRight).length,
        },
    explain: small ? null : tally((x) => [`Explains with care: ${x.dims.explain.rating}`, ...(x.explanation.citeValid ? [] : ["Cited an unsupported source"])]),
    improved: small ? null : { retried: retried.length, better: retried.filter((u) => lasts.get(u)!.finalCodes.length < firsts.get(u)!.codes.length).length },
    sourceIssues,
    versions: [
      ...new Set([...firsts.values(), ...lasts.values()].map((x) => [x.versions?.scenario, x.versions?.ruleSet].filter(Boolean).join(" · ") || "unversioned")),
    ],
  };
}

/** For authors: totals for learning design. Which lines people miss, how often a critical shortcut was taken. No names, no words. */
export function xrayStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureXRay(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result, started_at FROM xray_attempts WHERE guide_id = ?").all(guideId) as Pick<
    AttemptRow,
    "block_id" | "user_id" | "status" | "result" | "started_at"
  >[];
  // The course's draft is read for its review blocks' answer keys: the breakdowns are by line type and route.
  const g = db.prepare("SELECT r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.id = ?").get(guideId) as
    { doc: string } | undefined;
  const reviewBlocks = new Map(
    g
      ? allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
          .filter((b): b is XRayBlock => b.type === "xray" && Boolean(b.funding))
          .map((b) => [b.id, b] as const)
      : [],
  );
  const blocks = new Map<
    string,
    {
      blockId: string;
      attempts: number;
      people: Set<string>;
      finished: number;
      criticalFirstTry: number;
      splitRight: number;
      missedByLine: Record<string, number>;
    }
  >();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set<string>(),
      finished: 0,
      criticalFirstTry: 0,
      splitRight: 0,
      missedByLine: {},
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.status === "finished" && r.result) {
      const res = JSON.parse(r.result) as XRayResult | StoredFunding;
      b.finished += 1;
      if ("kind" in res && res.kind === "funding") {
        if (res.criticalFirstTry) b.criticalFirstTry += 1;
        for (const l of res.lines) if (!l.decisionRight) b.missedByLine[l.id] = (b.missedByLine[l.id] ?? 0) + 1;
      } else {
        const c = res as XRayResult;
        if (c.flags.criticalFirstTry) b.criticalFirstTry += 1;
        if (c.flags.splitRight) b.splitRight += 1;
        for (const l of c.lines) if (!l.outcomeRight) b.missedByLine[l.id] = (b.missedByLine[l.id] ?? 0) + 1;
      }
    }
    blocks.set(r.block_id, b);
  }
  return {
    blocks: [...blocks.values()].map((b) => {
      const rb = reviewBlocks.get(b.blockId);
      return {
        ...b,
        people: b.people.size,
        review: rb
          ? reviewTotals(
              db,
              guideId,
              rb,
              rows.filter((r) => r.block_id === b.blockId),
            )
          : null,
      };
    }),
  };
}

type GuideRow = { id: string; slug: string; title: string; audience: string; doc: string; published_at: string | null };
/** Every published Quote/Invoice X-Ray in review mode. */
function publishedReviews(db: Db) {
  const rows = db
    .prepare(
      "SELECT g.id, g.slug, g.title, g.audience, r.doc, r.published_at FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id WHERE g.status = 'published' AND r.doc LIKE '%\"xray\"%' AND r.doc LIKE '%\"funding\"%'",
    )
    .all() as GuideRow[];
  return rows.flatMap((g) =>
    allBlocks(readGuideDoc(JSON.parse(g.doc), { draft: true }))
      .filter((b): b is XRayBlock => b.type === "xray" && Boolean(b.funding))
      .map((b) => ({ guide: g, block: b })),
  );
}

/**
  The decision register's "Quote and invoice X-Rays" sheet (server/problemDesk export): each published review case with
  its block, scenario and source versions, placement, theme and rationale decision, audience, release and review
  dates, reviewers, practice results, misconceptions over their denominator, the Job Aid's use, and the separately
  owned work measure. Aggregate learning data only: no quote, invoice, participant narrative or learner's words, and
  fewer than five people show counts only.
*/
export function xrayRegister(db: Db, now: Date) {
  ensureXRay(db);
  return publishedReviews(db).map(({ guide, block }) => {
    const f = block.funding!;
    const rows = db
      .prepare("SELECT user_id, status, result, started_at FROM xray_attempts WHERE guide_id = ? AND block_id = ?")
      .all(guide.id, block.id) as Pick<AttemptRow, "user_id" | "status" | "result" | "started_at">[];
    const t: Totals = reviewTotals(db, guide.id, block, rows);
    const counts = (o: Record<string, number> | null, label: (k: string) => string = (k) => k) =>
      o
        ? Object.entries(o)
            .sort((p, q) => q[1] - p[1])
            .map(([k, n]) => `${label(k)} ${n}/${t.counted}`)
            .join("; ")
        : "";
    // How many people have the Job Aid in their Favourites: use evidence, never proof an invoice was right.
    let saves: number | null = null;
    if (f.jobAid.snippetId)
      try {
        saves = (db.prepare("SELECT COUNT(*) AS n FROM favourites WHERE kind = 'job_aid' AND target_id = ?").get(f.jobAid.snippetId) as { n: number }).n;
      } catch {
        saves = 0; // The Favourites tables aren't created until someone first uses Work Tools.
      }
    const a = block.approval;
    let audience = "Everyone signed in";
    try {
      audience = (JSON.parse(guide.audience) as string[]).join(", ") || audience;
    } catch {
      audience = guide.audience || audience;
    }
    const stale = staleSources(f, today(now));
    return {
      responseId: `${guide.id}:${block.id}`,
      blockId: block.id,
      guideId: guide.id,
      guide: guide.title,
      title: block.title,
      kind: block.phase === "quote" ? "Quote review" : "Invoice review",
      version: [f.version, f.ruleSet && `rules ${f.ruleSet}`, ENGINE_VERSION, RUBRIC_VERSION].filter(Boolean).join(" · "),
      sources: f.sources
        .map((s) => `${s.title} (${s.version || "no version"}, effective ${s.effectiveDate || "no date"}${s.reviewed ? "" : ", not reviewed"})`)
        .join("; "),
      placement: `Magazine: ${guide.title}`,
      theme: [f.rationale.themeId, f.rationale.theme].filter(Boolean).join(": "),
      rationaleDecision: f.rationale.decision || "Not decided",
      audience,
      released: guide.published_at?.slice(0, 10) ?? "",
      reviewBy:
        f.sources
          .map((s) => s.reviewBy)
          .filter(Boolean)
          .sort()[0] ?? "",
      stale: stale.length > 0,
      reviewers: [a.owner, f.reviewers.policy, a.finance, f.reviewers.clinical, a.operations, a.quality].filter(Boolean).join("; ") || "Not signed off",
      mode: f.mode,
      jobAid: f.jobAid.snippetId,
      jobAidSaves: saves,
      started: t.people,
      submitted: t.finished,
      completed: t.completed,
      retries: t.retries,
      people: t.counted,
      suppressed: t.suppressed,
      critical: t.critical ?? "",
      codes: counts(t.codes, codeLabel),
      byLineType: counts(t.byLineType),
      byRoute: counts(t.byRoute),
      neededMore: t.neededMore
        ? `Open lines kept open ${t.neededMore.openLinesKeptOpen}/${t.neededMore.openLines}; pending clarification when warranted ${t.neededMore.pendingRight}/${t.counted}`
        : "",
      improved: t.improved ? `${t.improved.better} of ${t.improved.retried} who retried` : "",
      sourceIssues: Object.entries(t.sourceIssues)
        .map(([k, n]) => `${f.sources.find((s) => s.id === k)?.title ?? k}: ${n}`)
        .join("; "),
      measure: f.rationale.measure,
      owner: f.rationale.owner || a.owner || "",
      review: f.rationale.review || "Not decided",
    };
  });
}
