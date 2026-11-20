import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type RedPenBlock } from "@/lib/magazine";
import { cleanAttempt, cleanRedPenState, emptyRedPen, readAttempt, redPenStale, submit, type RedPenState } from "@/lib/redpen";
import { posts } from "@/content/community";
import { ensureRedPen, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { withdrawnPosts } from "./reset";

/*
  Red Pen (docs/red-pen.md): a learner's critique attempt, read against the authored rubric.

  - The draft autosaves. Every submission is kept; the first is never changed.
  - The reviewed rewrite, its notes and the Community link come only after the first submission.
  - Each attempt keeps a hash of the rubric and reviewed rewrite, so a changed rubric is never silently applied.
  - Nothing here creates a care record or posts to the Community.
*/

type Row = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  key_hash: string;
  state: string;
  status: "active" | "passed";
  started_at: string;
  updated_at: string;
};

const keyHash = (b: RedPenBlock) =>
  createHash("sha1")
    .update(
      JSON.stringify([
        b.document.map((s) => [s.id, s.text, s.expect, s.reasons]),
        b.checks,
        b.escalation?.options.map((x) => [x.id, x.verdict]),
        b.reviewed.text,
      ]),
    )
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureRedPen(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "redpen") throw new HttpError(404, "That critique isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM redpen_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as Row | undefined;

function view(db: Db, a: Row | undefined, block: RedPenBlock, now: Date) {
  const state = a ? cleanRedPenState(block, JSON.parse(a.state)) : emptyRedPen();
  const submitted = state.submissions.length > 0;
  const stale = redPenStale(block, now.toISOString().slice(0, 10));
  const post = posts.find((p) => p.id === block.communityPostId);
  return {
    attemptId: a?.id ?? null,
    state,
    feedback: submitted ? readAttempt(block, state.submissions[state.submissions.length - 1]) : null,
    first: submitted ? state.submissions[0] : null,
    // The reviewed rewrite comes only after the first private submission. Past its review date its endorsement is retired.
    reviewed: submitted ? { ...block.reviewed, endorsed: block.reviewed.endorsed && !stale } : null,
    thread: submitted && post && !withdrawnPosts(db).has(post.id) ? { id: post.id, title: post.title } : null,
    stale,
    earlierKey: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

export function redPenState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(db, latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: RedPenBlock, now: Date): Row {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a) return a;
  const id = `rp-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO redpen_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), at, at);
  return db.prepare("SELECT * FROM redpen_attempts WHERE id = ?").get(id) as Row;
}
const store = (db: Db, a: Row, s: RedPenState, now: Date) =>
  db.prepare("UPDATE redpen_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);
const log = (db: Db, a: Row, event: string, detail: object, now: Date) =>
  db
    .prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(now.toISOString(), a.user_id, a.guide_id, a.revision_id, event, a.block_id, JSON.stringify(detail));

/** Saves the draft, the reflection, or that the comparison was opened. Never a submission. */
export function saveRedPen(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    let s = cleanRedPenState(block, JSON.parse(a.state));
    if (input.draft !== undefined) s = { ...s, draft: cleanAttempt(block, input.draft) };
    if (typeof input.reflection === "string") {
      if (!s.submissions.length) throw new HttpError(400, "Submit your critique first.");
      s = { ...s, reflection: input.reflection.slice(0, 600) };
    }
    if (input.compared === true && s.submissions.length && !s.compared) {
      s = { ...s, compared: true };
      log(db, a, "redpen.compared", {}, now);
    }
    store(db, a, s, now);
    return { saved: true };
  });
}

/** Submits privately. Every submission is kept; feedback, the reviewed rewrite and the thread link follow. */
export function submitRedPen(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = cleanRedPenState(block, JSON.parse(a.state));
    const r = submit(block, s, cleanAttempt(block, input.attempt));
    if ("problem" in r) return { problem: r.problem };
    store(db, a, r.state, now);
    const passedNow = r.feedback.pass && a.status !== "passed";
    if (passedNow) db.prepare("UPDATE redpen_attempts SET status = 'passed', key_hash = ? WHERE id = ?").run(keyHash(block), a.id);
    // Results only: never the learner's words or marks.
    log(
      db,
      a,
      "redpen.submitted",
      { n: r.state.submissions.length, pass: r.feedback.pass, result: r.feedback.result, dims: r.feedback.dims.map((d) => [d.dim, d.result]) },
      now,
    );
    return { passedNow, row: db.prepare("SELECT * FROM redpen_attempts WHERE id = ?").get(a.id) as Row };
  });
  if ("problem" in out) throw new HttpError(400, out.problem as string);
  return { ...view(db, out.row, block, now), passedNow: out.passedNow };
}

/** For authors: submissions, passes, and how each dimension came out. Counts only: no names, no words. */
export function redPenStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureRedPen(db);
  const rows = db.prepare("SELECT detail FROM magazine_events WHERE guide_id = ? AND event = 'redpen.submitted'").all(guideId) as { detail: string }[];
  const dims: Record<string, { strong: number; revision: number; critical: number }> = {};
  let submissions = 0;
  let passes = 0;
  let firstTry = 0;
  for (const r of rows) {
    const d = JSON.parse(r.detail);
    submissions += 1;
    if (d.pass) passes += 1;
    if (d.pass && d.n === 1) firstTry += 1;
    for (const [dim, res] of d.dims as [string, "strong" | "revision" | "critical"][]) (dims[dim] ??= { strong: 0, revision: 0, critical: 0 })[res] += 1;
  }
  const compared = (db.prepare("SELECT COUNT(*) AS n FROM magazine_events WHERE guide_id = ? AND event = 'redpen.compared'").get(guideId) as { n: number }).n;
  return { submissions, passes, passedFirstTry: firstTry, compared, dims };
}
