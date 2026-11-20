import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type AuditorBlock } from "@/lib/magazine";
import { applyChanges, buildDebrief, cleanState, emptyState, scoreAuditor, submitProblems, type AuditResult, type AuditState } from "@/lib/auditor";
import { ensureAuditor, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Document Auditor (docs/document-auditor.md): saving a learner's marks, and reading a submitted attempt against the
  authored answer key. The rules live in lib/auditor, so the learner's page, the editor's preview and this file all
  run the same ones.

  - The answer key stays here until the learner has submitted.
  - A submitted attempt is settled: its marks and decision never change. Trying again starts a new attempt.
  - Nothing here approves a supplier, rejects a real invoice or makes a claim.
  - A learner's marks and words are theirs. Authors see totals, never the words.
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

/** Changes when the documents, rules or answer key do, so an attempt says which version it was read against. */
export const auditorKeyHash = (b: Pick<AuditorBlock, "docs" | "missing" | "rules" | "findings" | "decisions" | "actions" | "engagementDate">) =>
  createHash("sha1")
    .update(JSON.stringify({ d: b.docs, m: b.missing, r: b.rules, e: b.findings, k: b.decisions, a: b.actions, g: b.engagementDate }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureAuditor(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "auditor") throw new HttpError(404, "That case isn’t here.");
  return { edition, block };
}

const attempts = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM auditor_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC")
    .all(user.id, guideId, revisionId, blockId) as AttemptRow[];

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

function view(rows: AttemptRow[], block: AuditorBlock) {
  const a = rows[0];
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as AuditResult) : null;
  // A hint on a fresh try, when an earlier one didn't reach a decision with full credit.
  const earlier = rows.find((r) => r.status === "finished" && r.result);
  const missed = earlier ? (JSON.parse(earlier.result!) as AuditResult).decisionCredit !== "full" : false;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    debrief: result ? buildDebrief(block, state, result) : null,
    hint: a?.status !== "finished" && missed && block.hint ? block.hint : null,
    tries: rows.filter((r) => r.status === "finished").length,
    earlierCase: Boolean(a && a.key_hash !== auditorKeyHash(block)),
  };
}

export function auditorState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: AuditorBlock, now: Date): AttemptRow {
  const a = attempts(db, user, guideId, revisionId, block.id)[0];
  if (a?.status === "active") return a;
  const id = `au-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO auditor_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, auditorKeyHash(block), JSON.stringify(emptyState()), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "auditor.retry" : "auditor.started", {}, now);
  return db.prepare("SELECT * FROM auditor_attempts WHERE id = ?").get(id) as AttemptRow;
}

const stored = (a: AttemptRow, block: AuditorBlock) => cleanState(block, JSON.parse(a.state));
const store = (db: Db, a: AttemptRow, state: AuditState, now: Date) =>
  db.prepare("UPDATE auditor_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);

/** Saves the learner's marks and draft decision as they go. A submitted attempt isn't changed. */
export function saveAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    if (a?.status === "finished") return { saved: false };
    const row = a ?? active(db, user, edition.guide.id, edition.revision.id, block, now);
    store(db, row, applyChanges(block, stored(row, block), input.state), now);
    return { saved: true };
  });
}

/** Submits the marks and decision, scores them against the answer key, and settles the attempt. */
export function submitAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyChanges(block, stored(a, block), input.state) : stored(a, block);
    const problems = submitProblems(s);
    if (problems.length) {
      store(db, a, s, now);
      return { problems };
    }
    const done: AuditState = { ...s, stage: 1 };
    const result = scoreAuditor(block, done);
    const at = now.toISOString();
    db.prepare("UPDATE auditor_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(done),
      JSON.stringify(result),
      auditorKeyHash(block),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "auditor.submitted",
      { decision: result.decision, credit: result.decisionCredit, critical: Boolean(result.critical), falsePositives: result.falsePositives },
      now,
    );
    return { problems: [] };
  });
  if (out.problems.length) throw new HttpError(400, `Not yet. ${out.problems.join(" ")}`);
  return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

/** After the debrief: the answer to the changed fact. The rest of the attempt stays as submitted. */
export function answerVariant(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const rows = attempts(db, user, edition.guide.id, edition.revision.id, block.id);
    const a = rows[0];
    if (!a || a.status !== "finished") throw new HttpError(400, "Submit your decision first.");
    if (!block.variant) throw new HttpError(400, "This case has no changed fact.");
    const s = stored(a, block);
    if (!s.variant) store(db, a, applyChanges(block, s, { ...s, variant: input.variant }), now);
    return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/** Try again: a new attempt, so the submitted one is kept as it was. */
export function restartAuditor(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = attempts(db, user, edition.guide.id, edition.revision.id, block.id)[0];
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(attempts(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/** For authors: totals for learning design. Decisions, missed evidence and false positives. No names, no words. */
export function auditorStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureAuditor(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result FROM auditor_attempts WHERE guide_id = ?").all(guideId) as Pick<
    AttemptRow,
    "block_id" | "user_id" | "status" | "result"
  >[];
  type Totals = {
    blockId: string;
    attempts: number;
    people: Set<string>;
    finished: number;
    critical: number;
    decisions: Record<string, number>;
    missed: Record<string, number>;
    falsePositives: Record<string, number>;
  };
  const blocks = new Map<string, Totals>();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set<string>(),
      finished: 0,
      critical: 0,
      decisions: {},
      missed: {},
      falsePositives: {},
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.status === "finished" && r.result) {
      const res = JSON.parse(r.result) as AuditResult;
      b.finished += 1;
      if (res.critical) b.critical += 1;
      if (res.decision) b.decisions[res.decision] = (b.decisions[res.decision] ?? 0) + 1;
      for (const i of res.items) {
        if (i.falsePositive) b.falsePositives[i.id] = (b.falsePositives[i.id] ?? 0) + 1;
        else if (i.finding && !i.found) b.missed[i.id] = (b.missed[i.id] ?? 0) + 1;
      }
    }
    blocks.set(r.block_id, b);
  }
  return { blocks: [...blocks.values()].map((b) => ({ ...b, people: b.people.size })) };
}
