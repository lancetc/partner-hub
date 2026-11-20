import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type JourneyBlock } from "@/lib/magazine";
import {
  buildDebrief,
  cleanState,
  emptyState,
  finishProblems,
  readTry,
  scoreJourney,
  tryTension,
  type Attempt,
  type JourneyResult,
  type JourneyState,
  type TensionFeedback,
} from "@/lib/journey";
import { ensureJourney, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  The SaH Journey (docs/sah-journey.md): a learner's attempt, read against the reviewed decision keys.

  - Where they are and which lenses they've opened are theirs to save as they go.
  - A decision point's feedback comes only once they've tried it; every try is kept, the first is never erased.
  - Each attempt keeps a hash of the decision keys, so a changed key is never silently applied to a past attempt.
  - Nothing here contacts anyone, books anything or changes any real record. Decisions change the story, never a
    government allocation date.
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

const keyHash = (b: JourneyBlock) =>
  createHash("sha1")
    .update(
      JSON.stringify(b.tensions.map((t) => [t.id, t.areas.map((a) => a.options.map((o) => [o.id, o.role, o.dim])), t.sayings.map((s) => [s.id, s.good])])),
    )
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureJourney(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "journey") throw new HttpError(404, "That journey isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM journey_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
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

function view(a: AttemptRow | undefined, block: JourneyBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  // The latest try at each decision point the learner has made: already revealed to them.
  const decided: Record<string, TensionFeedback> = Object.fromEntries(
    block.tensions.filter((t) => state.tries[t.id]?.length).map((t) => [t.id, readTry(t, state.tries[t.id][state.tries[t.id].length - 1])]),
  );
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as JourneyResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    decided,
    debrief: result ? buildDebrief(block, state, result) : null,
    earlierKey: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

export function journeyState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: JourneyBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `jy-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO journey_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '{}', 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "journey.retry" : "journey.started", {}, now);
  return db.prepare("SELECT * FROM journey_attempts WHERE id = ?").get(id) as AttemptRow;
}

const stored = (a: AttemptRow, block: JourneyBlock) => cleanState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, s: JourneyState, now: Date) {
  db.prepare("UPDATE journey_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(s), now.toISOString(), a.id);
}

/** Saves where the learner is and the lenses they've opened. Decisions only change through a try. */
export function saveJourney(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const prev = stored(a, block);
    const mine = cleanState(block, input.state);
    // Lenses only ever add up; the place in the journey is the learner's.
    const lenses = { ...prev.lenses };
    for (const [k, v] of Object.entries(mine.lenses)) lenses[k] = [...new Set([...(lenses[k] ?? []), ...v])];
    store(db, a, { ...prev, at: mine.at, lenses }, now);
    return { saved: true };
  });
}

/** A try at a decision point. Every try is kept; a path to debrief means the learner looks again. */
export function tryJourney(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const attempt: Attempt = {
      options: Array.isArray(input.options) ? input.options.filter((x): x is string => typeof x === "string") : [],
      saying: typeof input.saying === "string" ? input.saying : "",
    };
    const out = tryTension(block, stored(a, block), input.tensionId, attempt);
    if ("problem" in out) throw new HttpError(400, out.problem);
    store(db, a, out.state, now);
    log(
      db,
      a,
      "journey.decided",
      { tensionId: out.feedback.tensionId, stands: out.feedback.stands, critical: out.feedback.critical.length, gaps: out.feedback.gaps.length },
      now,
    );
    return { feedback: out.feedback, state: out.state };
  });
}

/** The final map and debrief, once every core lens has been opened and every decision settled. */
export function finishJourney(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    const problems = finishProblems(block, s);
    if (problems.length) return { problems };
    const result = scoreJourney(block, s);
    const at = now.toISOString();
    db.prepare("UPDATE journey_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify({ ...s, finished: true }),
      JSON.stringify(result),
      keyHash(block),
      at,
      at,
      a.id,
    );
    log(db, a, "journey.finished", { flags: result.flags }, now);
    return { id: a.id };
  });
  if (out.problems) throw new HttpError(400, `Not yet. ${out.problems.join(" ")}`);
  return view(db.prepare("SELECT * FROM journey_attempts WHERE id = ?").get(out.id) as AttemptRow, block);
}

export function restartJourney(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/** For authors: how decisions go, as totals. How many stood first time, how many needed a debrief. No names, no words. */
export function journeyStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureJourney(db);
  const rows = db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event IN ('journey.decided', 'journey.finished')").all(guideId) as {
    event: string;
    detail: string;
  }[];
  const byTension: Record<string, { tries: number; stood: number; critical: number }> = {};
  let finished = 0;
  for (const r of rows) {
    const d = JSON.parse(r.detail);
    if (r.event === "journey.finished") {
      finished += 1;
      continue;
    }
    const t = (byTension[d.tensionId] ??= { tries: 0, stood: 0, critical: 0 });
    t.tries += 1;
    if (d.stands) t.stood += 1;
    if (d.critical) t.critical += 1;
  }
  return { finished, byTension };
}
