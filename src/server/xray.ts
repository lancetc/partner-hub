import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type XRayBlock } from "@/lib/magazine";
import { applyChanges, buildDebrief, cleanState, emptyState, finishProblems, scoreXRay, submitLines, type XRayResult, type XRayState } from "@/lib/xray";
import { ensureXRay, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Invoice X-Ray (docs/invoice-xray.md): saving a learner's work on a document, and reading it against the
  reviewed answer key. The rules and the arithmetic live in lib/xray, so the learner's page, the editor's preview
  and this file all run the same ones.

  - The answer key and the model script stay here until the learner has submitted.
  - Nothing here creates a claim, payment, reimbursement, supplier approval or message.
  - A learner's choices and words are theirs. Authors see totals, never the words.
*/

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

/** Changes when the document or its answer key does, so an attempt says which version it was read against. */
const keyHash = (b: XRayBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ l: b.lines, r: b.rate, n: b.next, e: b.explain, p: b.phase, d: b.decisionDate }))
    .digest("hex")
    .slice(0, 12);

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

function log(db: Db, a: Pick<AttemptRow, "user_id" | "guide_id" | "revision_id" | "block_id">, event: string, detail: object, now: Date) {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify(detail),
  );
}

function view(a: AttemptRow | undefined, block: XRayBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as XRayResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    /** Once the lines are in: the starting draft for the explanation, which is reviewed text. */
    draft: state.stage >= 1 ? block.explain.draft : null,
    debrief: result ? buildDebrief(block, state, result) : null,
    earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

export function xrayState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: XRayBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `xr-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO xray_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), JSON.stringify(emptyState()), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "xray.retry" : "xray.started", {}, now);
  return db.prepare("SELECT * FROM xray_attempts WHERE id = ?").get(id) as AttemptRow;
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

/** Submits the sorted lines. A critical mistake comes back with why; otherwise the explanation step opens. */
export function submitXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const step = submitLines(block, s);
    if ("problem" in step) return { problem: step.problem };
    store(db, a, step.state, now);
    log(db, a, "xray.submitted", { critical: step.critical.length, tries: step.state.tries }, now);
    return { step, id: a.id };
  });
  if ("problem" in out) throw new HttpError(400, out.problem ?? "Not yet.");
  return { critical: out.step.critical, ...view(reread(db, out.id), block) };
}

/** Finishes, once each part of the explanation is there and none of it says something that makes it wrong. */
export function finishXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const problems = finishProblems(block, s);
    if (problems.length) {
      // A phrase that makes it wrong counts against the explanation, even once it's fixed.
      const tried = s.stage === 1 && problems.some((p) => p.startsWith("“")) ? { ...s, scriptTries: s.scriptTries + 1 } : s;
      store(db, a, tried, now);
      return { problems };
    }
    const result = scoreXRay(block, s);
    const at = now.toISOString();
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
  return view(reread(db, out.id!), block);
}

export function restartXRay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/** For authors: totals for learning design. Which lines people miss, how often a critical shortcut was taken. No names, no words. */
export function xrayStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureXRay(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result FROM xray_attempts WHERE guide_id = ?").all(guideId) as Pick<
    AttemptRow,
    "block_id" | "user_id" | "status" | "result"
  >[];
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
      const res = JSON.parse(r.result) as XRayResult;
      b.finished += 1;
      if (res.flags.criticalFirstTry) b.criticalFirstTry += 1;
      if (res.flags.splitRight) b.splitRight += 1;
      for (const l of res.lines) if (!l.outcomeRight) b.missedByLine[l.id] = (b.missedByLine[l.id] ?? 0) + 1;
    }
    blocks.set(r.block_id, b);
  }
  return { blocks: [...blocks.values()].map((b) => ({ ...b, people: b.people.size })) };
}
