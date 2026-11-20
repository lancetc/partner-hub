import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type MissionBlock } from "@/lib/magazine";
import {
  advance,
  applyBoard,
  buildDebrief,
  cleanState,
  decide,
  finishProblems,
  initialState,
  learnerView,
  checkDecision,
  scoreMission,
  type MissionResult,
  type MissionState,
} from "@/lib/mission";
import { ensureMission, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  First 30 Days Mission Board (docs/mission-board.md): saving a learner's work on a case as they go, and
  reading it against the reviewed answers. The rules themselves live in lib/mission, so the learner's page,
  the editor's preview and this file all run the same ones.

  - What marks a choice right stays here until the learner has made it.
  - Nothing here rosters a worker, starts care, issues a statement or contacts anyone. It's a training record.
  - A learner's board, choices and messages are theirs. Authors see totals, never the words.
  - Nothing measures whether the participant stays.
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

/** Changes when the case or its answers do, so an attempt says which version it was read against. */
const keyHash = (b: MissionBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ d: b.dates, f: b.firstServiceDay, s: b.statementIssuedDay, t: b.tasks, c: b.checkpoints }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureMission(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "mission") throw new HttpError(404, "That case isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM mission_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
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

function view(a: AttemptRow | undefined, block: MissionBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : initialState(block);
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as MissionResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    /** What the participant has been told so far, and the promises made: worked out here from the full case. */
    known: learnerView(block, state),
    debrief: result ? buildDebrief(block, state, result) : null,
    /** The case has been revised since this attempt: it's kept as it was, and starting again uses the new one. */
    earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

/** Where this person is with a case: their saved board and choices, and the debrief if they've finished. */
export function missionState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: MissionBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `mis-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO mission_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, state, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), JSON.stringify(initialState(block)), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "mission.retry" : "mission.started", {}, now);
  return db.prepare("SELECT * FROM mission_attempts WHERE id = ?").get(id) as AttemptRow;
}

const stored = (a: AttemptRow, block: MissionBlock) => cleanState(block, JSON.parse(a.state));
function store(db: Db, a: AttemptRow, state: MissionState, now: Date) {
  db.prepare("UPDATE mission_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM mission_attempts WHERE id = ?").get(id) as AttemptRow;

/**
  Saves the parts of the work the learner owns: the board, its order, owners, drafts and the close-the-loop
  answers. A board move the rules don't allow (Done before what it depends on) is ignored, so the saved board
  is always one the rules could reach. Decisions and the day the case is on only change through decide and advance.
*/
export function saveMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const next = applyBoard(block, stored(a, block), cleanState(block, input.state));
    store(db, a, next, now);
    return { saved: true, attemptId: a.id, state: next };
  });
}

/** The learner decides at the current point. Feedback on what they chose, and the board after it. */
export function decideMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    // The learner's latest board comes with the decision, so a move made just before it isn't lost to the autosave.
    const s = input.state ? applyBoard(block, stored(a, block), cleanState(block, input.state)) : stored(a, block);
    const out = decide(block, s, { checkpoint: input.checkpoint, actions: input.actions, message: input.message, covered: input.covered });
    if ("problem" in out) throw new HttpError(400, out.problem);
    store(db, a, out.state, now);
    // What went wrong, for the totals. Never the learner's words.
    log(db, a, "mission.decided", { checkpoint: input.checkpoint, critical: out.feedback.critical.length > 0 }, now);
    return { feedback: out.feedback, state: out.state, known: learnerView(block, out.state) };
  });
}

/** On to the next point in the case, if the board has what it needs. A refusal counts towards sequencing. */
export function advanceMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const out = tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = input.state ? applyBoard(block, stored(a, block), cleanState(block, input.state)) : stored(a, block);
    const next = advance(block, s);
    // The refusal is kept (it's part of how sequencing reads), so it's saved before the learner is told.
    if ("problem" in next) {
      if (next.missing.length) store(db, a, { ...s, refusals: s.refusals + 1 }, now);
      return next;
    }
    store(db, a, next.state, now);
    return next;
  });
  if ("problem" in out) throw new HttpError(400, out.missing.length ? `${out.problem} Still to do: ${out.missing.join("; ")}.` : out.problem);
  return { state: out.state, known: learnerView(block, out.state) };
}

/** Closes the loop and gives the debrief, once every open task and promise has an owner and a date or is resolved. */
export function finishMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const s = applyBoard(block, stored(a, block), cleanState(block, input.state));
    const problems = finishProblems(block, s);
    if (problems.length) {
      store(db, a, s, now);
      throw new HttpError(400, problems.join(" "));
    }
    const result = scoreMission(block, s);
    const at = now.toISOString();
    db.prepare("UPDATE mission_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(s),
      JSON.stringify(result),
      keyHash(block),
      at,
      at,
      a.id,
    );
    log(db, a, "mission.finished", { total: result.total, flags: result.flags }, now);
    return view(reread(db, a.id), block);
  });
}

/** After the debrief: try one decision point again. The finished record doesn't change; the retry is shown beside it. */
export function redoMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status !== "finished") throw new HttpError(400, "Finish the case first, then try a moment again.");
    const c = block.checkpoints.find((x) => x.id === input.checkpoint);
    if (!c) throw new HttpError(404, "That moment isn’t in this case.");
    const s = stored(a, block);
    const chosen = (Array.isArray(input.actions) ? input.actions : []).filter((x): x is string => typeof x === "string" && c.actions.some((y) => y.id === x));
    if (!chosen.length) throw new HttpError(400, "Choose what you’d do.");
    store(db, a, { ...s, redo: { checkpoint: c.id, actions: chosen } }, now);
    return { feedback: { ...checkDecision(block, c, chosen, s), message: c.message } };
  });
}

/** Starts the case again. A finished attempt is kept. */
export function restartMission(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, initialState(block), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/**
  For authors: how a course's boards are going, as totals. How many finished, how often people had to change
  course, how many promises were kept within the case, how often the board stopped a move. No one's words, and
  nothing about whether a participant stayed.
*/
export function missionStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureMission(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result FROM mission_attempts WHERE guide_id = ?").all(guideId) as Pick<
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
      changedCourse: number;
      refusals: number;
      promisesKept: number;
      promisesHandedOn: number;
    }
  >();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set<string>(),
      finished: 0,
      changedCourse: 0,
      refusals: 0,
      promisesKept: 0,
      promisesHandedOn: 0,
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.status === "finished" && r.result) {
      const f = (JSON.parse(r.result) as MissionResult).flags;
      b.finished += 1;
      b.changedCourse += f.changedCourse;
      b.refusals += f.refusals;
      b.promisesKept += f.promisesKept;
      b.promisesHandedOn += f.promisesOpen;
    }
    blocks.set(r.block_id, b);
  }
  return { blocks: [...blocks.values()].map((b) => ({ ...b, people: b.people.size })) };
}
