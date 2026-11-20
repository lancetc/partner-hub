import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type LineBlock } from "@/lib/magazine";
import {
  answerCard,
  cleanState,
  feedbackFor,
  initialState,
  replayCard,
  summarise,
  twistCard,
  type Answer,
  type Feedback,
  type LineState,
  type LineSummary,
} from "@/lib/line";
import { ensureLine, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  "Where Is the Line?" (docs/line-drawer.md): a learner's attempt at a deck, read against the reviewed keys.

  - A card's answer is sent only once the learner has chosen its lane, reason and action.
  - Only approved cards within their review date are served; the order is fixed per attempt.
  - Each attempt keeps a hash of the deck's keys, so a changed key is never silently applied to a past attempt.
  - Nothing here approves funding, rosters a worker, creates an incident or contacts anyone.
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

const today = (now: Date) => now.toISOString().slice(0, 10);
const keyHash = (b: LineBlock) =>
  createHash("sha1")
    .update(JSON.stringify(b.cases.map((c) => [c.id, c.lane, c.accepted, c.acceptedActions, c.twist?.lane ?? null, c.status, c.source.reviewOn])))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureLine(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "line") throw new HttpError(404, "That deck isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare("SELECT * FROM line_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1")
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

function view(a: AttemptRow | undefined, block: LineBlock, now: Date) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : initialState(block, today(now));
  // The answers already given are already revealed; nothing about cards still to come is.
  const answered: Record<string, Feedback> = Object.fromEntries(
    Object.entries(state.answers).map(([id, ans]) => [
      id,
      feedbackFor(
        block.cases.find((c) => c.id === id)!,
        ans,
      ),
    ]),
  );
  const replayed: Record<string, Feedback> = Object.fromEntries(
    Object.entries(state.replays).map(([id, ans]) => [
      id,
      feedbackFor(
        block.cases.find((c) => c.id === id)!,
        ans,
      ),
    ]),
  );
  const twists = Object.fromEntries(
    Object.keys(state.twists).map((id) => {
      const r = twistCard(block, state, id, state.twists[id]);
      return [id, "result" in r ? r.result : null];
    }),
  );
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    answered,
    replayed,
    twists,
    summary: a?.status === "finished" && a.result ? (JSON.parse(a.result) as LineSummary) : null,
    /** Cards held back because they aren't approved or are past their review date. */
    held: block.cases.length - (state.order.length || initialState(block, today(now)).order.length),
    earlierDeck: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

export function lineState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: LineBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `ln-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  const seed = parseInt(id.slice(3, 11), 16) || 0;
  db.prepare(
    "INSERT INTO line_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), JSON.stringify(initialState(block, today(now), seed)), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "line.retry" : "line.started", {}, now);
  return db.prepare("SELECT * FROM line_attempts WHERE id = ?").get(id) as AttemptRow;
}

const stored = (a: AttemptRow, block: LineBlock) => cleanState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, state: LineState, now: Date) {
  db.prepare("UPDATE line_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}
const asAnswer = (v: unknown): Answer => {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    lane: (typeof o.lane === "string" ? o.lane : "") as Answer["lane"],
    reason: typeof o.reason === "string" ? o.reason : "",
    action: typeof o.action === "string" ? o.action : "",
  };
};

/** Submits the card in front of the learner, and gives its feedback. */
export function answerLine(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const out = answerCard(block, stored(a, block), input.caseId, asAnswer(input.answer));
    if ("problem" in out) throw new HttpError(400, out.problem);
    store(db, a, out.state, now);
    log(
      db,
      a,
      "line.answered",
      {
        caseId: out.feedback.caseId,
        lane: out.feedback.laneRight,
        reason: out.feedback.reasonRight,
        action: out.feedback.actionRight,
        debrief: Boolean(out.feedback.debrief),
      },
      now,
    );
    return { feedback: out.feedback, state: out.state };
  });
}

/** The line map, once every card is answered. */
export function finishLine(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = stored(a, block);
    if (s.at < s.order.length) throw new HttpError(400, "Answer every card first.");
    const summary = summarise(block, s);
    const at = now.toISOString();
    db.prepare("UPDATE line_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify({ ...s, finished: true }),
      JSON.stringify(summary),
      keyHash(block),
      at,
      at,
      a.id,
    );
    log(
      db,
      a,
      "line.finished",
      {
        lane: summary.lane,
        reason: summary.reason,
        action: summary.action,
        overControl: summary.overControl,
        premature: summary.premature,
        total: summary.total,
      },
      now,
    );
    return view(db.prepare("SELECT * FROM line_attempts WHERE id = ?").get(a.id) as AttemptRow, block, now);
  });
}

/** After the line map: a missed card tried again, or the second pass on a card with a new fact. The first answers stay on the record. */
export function revisitLine(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status !== "finished") throw new HttpError(400, "Finish the deck first.");
    const s = stored(a, block);
    if (input.kind === "twist") {
      const out = twistCard(block, s, input.caseId, input.lane);
      if ("problem" in out) throw new HttpError(400, out.problem ?? "Not available.");
      store(db, a, out.state, now);
      return { twist: out.result };
    }
    const out = replayCard(block, s, input.caseId, asAnswer(input.answer));
    if ("problem" in out) throw new HttpError(400, out.problem);
    store(db, a, out.state, now);
    return { feedback: out.feedback };
  });
}

export function restartLine(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, initialState(block, today(now), Date.now() % 100000), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block, now);
  });
}

/** For authors: lane, reason and next-action accuracy, each on its own, by card; and patterns of over-control and approving before checks. */
export function lineStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureLine(db);
  const rows = db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event IN ('line.answered', 'line.finished')").all(guideId) as {
    event: string;
    detail: string;
  }[];
  const byCase: Record<string, { answered: number; lane: number; reason: number; action: number; debriefs: number }> = {};
  let finished = 0;
  let overControl = 0;
  let premature = 0;
  for (const r of rows) {
    const d = JSON.parse(r.detail);
    if (r.event === "line.finished") {
      finished += 1;
      if (d.overControl) overControl += 1;
      if (d.premature) premature += 1;
      continue;
    }
    const c = (byCase[d.caseId] ??= { answered: 0, lane: 0, reason: 0, action: 0, debriefs: 0 });
    c.answered += 1;
    if (d.lane) c.lane += 1;
    if (d.reason) c.reason += 1;
    if (d.action) c.action += 1;
    if (d.debrief) c.debriefs += 1;
  }
  return { finished, withOverControl: overControl, withPremature: premature, byCase };
}
