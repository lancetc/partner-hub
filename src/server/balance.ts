import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type BalanceBlock } from "@/lib/magazine";
import {
  advance,
  applyChanges,
  buildDebrief,
  cleanState,
  emptyState,
  finishProblems,
  learnerView,
  scoreBalance,
  seeEvent,
  type BalanceResult,
  type BalanceState,
} from "@/lib/balance";
import { ensureBalance, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Dignity of Risk Balance Scale (docs/balance-scale.md): saving a learner's work on a case, and reading it
  against the authored criteria. The rules live in lib/balance, so the learner's page, the editor's preview
  and this file all run the same ones.

  - The criteria, what each card is worth and the new fact stay here until the learner has used them.
  - Nothing here changes a real care plan, incident register, supplier record or clinical task.
  - A learner's choices are theirs. Authors see totals, including patterns of over-control and under-response,
    never the words or the person.
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

/** Changes when the case or its rubric does, so an attempt says which version it was read against. */
const keyHash = (b: BalanceBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ q: b.questions, g: b.goals, r: b.risks, a: b.actions, c: b.criteria, s: b.sayings, e: b.event }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureBalance(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "balance") throw new HttpError(404, "That case isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM balance_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
    )
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

function view(a: AttemptRow | undefined, block: BalanceBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as BalanceResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    known: learnerView(block, state),
    debrief: result ? buildDebrief(block, state, result) : null,
    earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

/** Where this person is with a case. */
export function balanceState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: BalanceBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `bal-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO balance_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), JSON.stringify(emptyState()), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "balance.retry" : "balance.started", {}, now);
  return db.prepare("SELECT * FROM balance_attempts WHERE id = ?").get(id) as AttemptRow;
}

const stored = (a: AttemptRow, block: BalanceBlock) => cleanState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, state: BalanceState, now: Date) {
  db.prepare("UPDATE balance_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}

/**
  Saves what the learner owns (questions asked, the tension, the plan, what they'd say) and answers with the
  scale, what the person said to any card they were asked about, and what each question turned up.
*/
export function saveBalance(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const next = applyChanges(block, stored(a, block), input.state);
    store(db, a, next, now);
    return { state: next, known: learnerView(block, next) };
  });
}

/** The next step: checks the current one, and for naming the tension, says what fits the facts. */
export function advanceBalance(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const step = advance(block, s);
    // A tension that's tried and missed is kept: it's part of how risk recognition reads.
    const next = "state" in step && step.state ? step.state : s;
    store(db, a, next, now);
    return { step, next };
  });
  return {
    ok: !("problem" in out.step),
    problem: "problem" in out.step ? out.step.problem : null,
    tension: out.step.tension ?? null,
    state: out.next,
    known: learnerView(block, out.next),
  };
}

/** The new fact arrives once they've chosen what they'd say. */
export function eventBalance(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const out = seeEvent(block, s);
    if ("problem" in out) throw new HttpError(400, out.problem);
    store(db, a, out.state, now);
    return { state: out.state, known: learnerView(block, out.state) };
  });
}

/** Finishes, once nothing unsafe is in the plan and every must-do step after the new fact is there. */
export function finishBalance(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const problems = finishProblems(block, s);
    if (problems.length) {
      store(db, a, { ...s, blocked: s.blocked + 1 }, now);
      return { problems };
    }
    const result = scoreBalance(block, s);
    const at = now.toISOString();
    db.prepare("UPDATE balance_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(s),
      JSON.stringify(result),
      keyHash(block),
      at,
      at,
      a.id,
    );
    // Patterns for learning design, never the words.
    log(db, a, "balance.finished", { balanced: result.balanced, flags: result.flags }, now);
    return { id: a.id };
  });
  if (out.problems) throw new HttpError(400, `Not yet. ${out.problems.join(" ")}`);
  return view(db.prepare("SELECT * FROM balance_attempts WHERE id = ?").get(out.id) as AttemptRow, block);
}

/** Starts again. A finished attempt is kept. */
export function restartBalance(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/**
  For authors: totals by block, for learning design review. Not a leaderboard: no names, no words, no ranking.
*/
export function balanceStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureBalance(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result FROM balance_attempts WHERE guide_id = ?").all(guideId) as Pick<
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
      balanced: number;
      overControl: number;
      underResponse: number;
      retriedTension: number;
    }
  >();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set<string>(),
      finished: 0,
      balanced: 0,
      overControl: 0,
      underResponse: 0,
      retriedTension: 0,
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.status === "finished" && r.result) {
      const res = JSON.parse(r.result) as BalanceResult;
      b.finished += 1;
      if (res.balanced) b.balanced += 1;
      if (res.flags.overControl) b.overControl += 1;
      if (res.flags.underResponse) b.underResponse += 1;
      if (res.flags.tensionTries > 1) b.retriedTension += 1;
    }
    blocks.set(r.block_id, b);
  }
  return { blocks: [...blocks.values()].map((b) => ({ ...b, people: b.people.size })) };
}
