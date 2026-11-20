import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type BatonBlock } from "@/lib/magazine";
import {
  batonStale,
  chooseRole,
  cleanBatonState,
  cleanDecision,
  emptyBaton,
  finishBatonProblems,
  readHandoff,
  relayMap,
  sendHandoff,
  stageFor,
  type BatonState,
  type StageFeedback,
} from "@/lib/baton";
import { ensureBaton, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Pass the Baton (docs/pass-the-baton.md): a learner's relay attempt, read against the authored rules.

  - The learner's role, unsent drafts and every send are kept. Choosing another role starts it clean.
  - Feedback comes only for a handoff they've sent. A follow-up completes the latest send.
  - Each attempt keeps a hash of the rules, so a changed rule is never silently applied to a past attempt.
  - Nothing here sends a message, assigns work or changes a record.
*/

type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  key_hash: string;
  state: string;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

const keyHash = (b: BatonBlock) =>
  createHash("sha1")
    .update(
      JSON.stringify(
        b.stages.map((s) => [
          s.id,
          s.factRules,
          [s.recipients, s.urgency, s.channels, s.owners, s.acks, s.actions, s.followUps, s.redFlag?.options ?? []].map((g) => g.map((x) => [x.id, x.verdict])),
          s.responds,
        ]),
      ),
    )
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureBaton(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "baton") throw new HttpError(404, "That relay isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM baton_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;

function log(db: Db, a: Pick<Row, "user_id" | "guide_id" | "revision_id" | "block_id">, event: string, detail: object, now: Date) {
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

function view(a: Row | undefined, block: BatonBlock, now: Date) {
  const state = a ? cleanBatonState(block, JSON.parse(a.state)) : emptyBaton();
  // The latest send at each stage the learner has played: already revealed to them.
  const sent: Record<string, StageFeedback> = {};
  for (const s of block.stages) if (state.tries[s.id]?.length) sent[s.id] = readHandoff(block, s, state.tries[s.id][state.tries[s.id].length - 1]);
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    sent,
    map: relayMap(block, state),
    stale: batonStale(block, now.toISOString().slice(0, 10)),
    earlierKey: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

export function batonState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: BatonBlock, now: Date): Row {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a) return a;
  const id = `bt-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO baton_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, "baton.started", {}, now);
  return db.prepare("SELECT * FROM baton_attempts WHERE id = ?").get(id) as Row;
}
const stored = (a: Row, block: BatonBlock) => cleanBatonState(block, JSON.parse(a.state));
const store = (db: Db, a: Row, s: BatonState, now: Date) =>
  db.prepare("UPDATE baton_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);

/** Chooses a role (it starts from the clean authored state) or saves an unsent draft. Only a send changes a result. */
export function saveBaton(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    let s = stored(a, block);
    if (input.role !== undefined && input.role !== s.role) {
      const next = chooseRole(block, s, input.role);
      if ("problem" in next) return { problem: next.problem };
      s = next;
    }
    const stage = stageFor(block, s.role);
    if (stage && input.draft !== undefined) s = { ...s, drafts: { ...s.drafts, [stage.id]: cleanDecision(stage, input.draft) } };
    store(db, a, s, now);
    return { row: db.prepare("SELECT * FROM baton_attempts WHERE id = ?").get(a.id) as Row };
  });
  if ("problem" in out) throw new HttpError(400, out.problem as string);
  return view(out.row, block, now);
}

/** Sends the simulated handoff, or completes it with a follow-up. Every send is kept. */
export function sendBaton(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    const stage = stageFor(block, s.role);
    if (!stage) return { problem: "Choose a role first." };
    const r = sendHandoff(block, s, cleanDecision(stage, input.decision));
    if ("problem" in r) return { problem: r.problem };
    const finished = r.state.passed.length >= block.rolesToComplete;
    const next = { ...r.state, finished: finished || r.state.finished };
    store(db, a, next, now);
    if (finished && a.status !== "finished")
      db.prepare("UPDATE baton_attempts SET status = 'finished', key_hash = ?, finished_at = ? WHERE id = ?").run(keyHash(block), now.toISOString(), a.id);
    // Counts and results only: never which facts or recipients were chosen.
    log(db, a, "baton.sent", { stageId: stage.id, role: s.role, result: r.feedback.needsFollowUp ? "open" : r.feedback.result }, now);
    return {
      feedback: r.feedback,
      finishedNow: finished && a.status !== "finished",
      row: db.prepare("SELECT * FROM baton_attempts WHERE id = ?").get(a.id) as Row,
    };
  });
  if ("problem" in out) throw new HttpError(400, out.problem as string);
  return { ...view(out.row, block, now), feedback: out.feedback, finishedNow: out.finishedNow };
}

/** Starts the whole relay again from the authored story. Earlier attempts are kept. */
export function restartBaton(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
  const id = `bt-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO baton_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?)",
  ).run(id, edition.guide.id, edition.revision.id, block.id, user.id, keyHash(block), at, at);
  if (a) log(db, a, "baton.restarted", {}, now);
  return view(db.prepare("SELECT * FROM baton_attempts WHERE id = ?").get(id) as Row, block, now);
}

export { finishBatonProblems };

/** For authors, per stage: sends, and how they came out (on track, needs follow-up, critical gap, still open). No names, no choices. */
export function batonStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureBaton(db);
  const rows = db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event = 'baton.sent'").all(guideId) as {
    event: string;
    detail: string;
  }[];
  const byStage: Record<string, { sends: number; ontrack: number; followup: number; critical: number; open: number }> = {};
  for (const r of rows) {
    const d = JSON.parse(r.detail);
    const t = (byStage[d.stageId] ??= { sends: 0, ontrack: 0, followup: 0, critical: 0, open: 0 });
    t.sends += 1;
    if (d.result in t) t[d.result as "ontrack" | "followup" | "critical" | "open"] += 1;
  }
  const finished = (db.prepare("SELECT COUNT(*) AS n FROM baton_attempts WHERE guide_id = ? AND status = 'finished'").get(guideId) as { n: number }).n;
  return { finished, byStage };
}
