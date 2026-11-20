import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type SignalBlock } from "@/lib/magazine";
import {
  actionFeedback,
  cleanState,
  DIMENSIONS,
  emptyState,
  notificationWindow,
  ratingOf,
  scoreSignal,
  STAGES,
  type Dim,
  type SignalResult,
  type SignalState,
} from "@/lib/signal";
import { ensureSignal, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  Spot the Signal (docs/spot-the-signal.md): saving a learner's work on a case as they go, and reading it
  against the reviewed answers.

  - The answers never leave the server until the learner has made the decision they bear on: feedback on
    their first actions comes after they've chosen them, and the classification, the reviewer's handover
    and what each clue was come only once the case is finished.
  - Nothing here contacts anyone or creates an incident. It is a training record.
  - A learner's highlights, reasoning and handover are theirs. Authors see totals of where people went
    wrong, never the words.
  - Speed isn't recorded or scored.
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
  retries: number;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

/** Changes when the case or its answers do, so an attempt can say which version it was read against. */
const keyHash = (b: SignalBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ a: b.artefacts, x: b.actions, k: b.key, w: b.awareAt }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureSignal(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "signal") throw new HttpError(404, "That case isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM signal_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1",
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

/** Everything the learner is shown once the case is finished: how it read, and the reviewed answers behind it. */
function debrief(block: SignalBlock, result: SignalResult) {
  const window = notificationWindow(block);
  return {
    dims: (Object.keys(DIMENSIONS) as Dim[]).map((d) => ({
      id: d,
      label: DIMENSIONS[d].label,
      rating: ratingOf(result.dims[d].score),
      notes: result.dims[d].notes,
    })),
    flags: result.flags,
    clues: Object.fromEntries(
      block.artefacts.flatMap((a) => a.passages.filter((p) => p.signal !== "none").map((p) => [p.id, { signal: p.signal, kind: p.kind, why: p.why }])),
    ),
    actions: block.actions.map(({ id, label, role, feedback }) => ({ id, label, role, feedback })),
    key: {
      connection: block.key.connection,
      typeId: block.key.typeId,
      priority: block.key.priority,
      why: block.key.why,
      anchor: block.key.anchor,
      handover: block.key.handover,
      needed: block.key.needed,
    },
    /** The provider's notification window, as a reference. Null when there's no reportable priority or no confident awareness time. */
    window,
    awareNote: block.awareNote,
    source: block.source,
  };
}
export type SignalDebrief = ReturnType<typeof debrief>;

function view(a: AttemptRow | undefined, block: SignalBlock) {
  const state = a ? cleanState(block, JSON.parse(a.state)) : emptyState();
  const result = a?.status === "finished" && a.result ? (JSON.parse(a.result) as SignalResult) : null;
  return {
    attemptId: a?.id ?? null,
    status: a?.status ?? ("new" as const),
    state,
    retries: a?.retries ?? 0,
    debrief: result ? debrief(block, result) : null,
    /** The case has been revised since this attempt: it's kept as it was, and starting again uses the new one. */
    earlierCase: Boolean(a && a.key_hash !== keyHash(block)),
  };
}

/** Where this person is with a case: their saved work, and the debrief if they've finished. */
export function signalState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function active(db: Db, user: User, guideId: string, revisionId: string, block: SignalBlock, now: Date): AttemptRow {
  const a = latest(db, user, guideId, revisionId, block.id);
  if (a?.status === "active") return a;
  const id = `sig-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO signal_attempts (id, guide_id, revision_id, block_id, user_id, key_hash, status, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
  ).run(id, guideId, revisionId, block.id, user.id, keyHash(block), at, at);
  log(db, { user_id: user.id, guide_id: guideId, revision_id: revisionId, block_id: block.id }, a ? "signal.retry" : "signal.started", {}, now);
  return db.prepare("SELECT * FROM signal_attempts WHERE id = ?").get(id) as AttemptRow;
}

function store(db: Db, a: AttemptRow, state: SignalState, now: Date) {
  db.prepare("UPDATE signal_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(state), now.toISOString(), a.id);
}

/** Saves the learner's work as they go, so leaving and coming back picks up in the same place. */
export function saveSignal(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    store(db, a, cleanState(block, input.state), now);
    return { saved: true, attemptId: a.id };
  });
}

/**
  The learner has chosen what to do first. They're told what each choice does in this case, shown the
  made-up timeline for a choice that delays, and stopped if their choices leave the concern with no one.
  What they should have chosen instead isn't given away while they still have to think again.
*/
export function checkActions(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const state = cleanState(block, input.state);
    if (!state.actions.length) throw new HttpError(400, "Choose what you’d do first.");
    const fb = actionFeedback(block, state.actions);
    // Triage comes before classification: they can't move on to it while their actions leave the person unprotected.
    store(db, a, { ...state, stage: fb.critical.length ? 3 : Math.max(state.stage, 3) }, now);
    if (fb.critical.length) db.prepare("UPDATE signal_attempts SET retries = retries + 1 WHERE id = ?").run(a.id);
    log(db, a, "signal.actions", { actions: state.actions, critical: fb.critical.length > 0 }, now);
    return { feedback: fb };
  });
}

/**
  Finishes the case. An attempt whose first actions still leave the concern unattended isn't finished: the
  learner is sent back to that step. Otherwise it's read against the reviewed answers and the debrief is given.
*/
export function submitSignal(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = active(db, user, edition.guide.id, edition.revision.id, block, now);
    const state = cleanState(block, input.state);
    if (!state.actions.length) throw new HttpError(400, "Say what you’d do first before the assessment.");
    if (!state.connection || state.typeId === null || !state.priority) throw new HttpError(400, "Answer the three assessment questions first.");
    const result = scoreSignal(block, state);
    if (result.critical.length) {
      store(db, a, { ...state, stage: 3 }, now);
      db.prepare("UPDATE signal_attempts SET retries = retries + 1 WHERE id = ?").run(a.id);
      return {
        finished: false as const,
        critical: result.critical,
        ...view(db.prepare("SELECT * FROM signal_attempts WHERE id = ?").get(a.id) as AttemptRow, block),
      };
    }
    const at = now.toISOString();
    db.prepare("UPDATE signal_attempts SET state = ?, result = ?, status = 'finished', key_hash = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify({ ...state, stage: STAGES.length - 1 }),
      JSON.stringify(result),
      keyHash(block),
      at,
      at,
      a.id,
    );
    // Where people went wrong, for the totals. Never what they wrote.
    log(db, a, "signal.finished", { total: result.total, flags: result.flags, retries: a.retries }, now);
    return {
      finished: true as const,
      critical: [] as string[],
      ...view(db.prepare("SELECT * FROM signal_attempts WHERE id = ?").get(a.id) as AttemptRow, block),
    };
  });
}

/** Starts the case again. The finished attempt is kept. */
export function restartSignal(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    if (a?.status === "active") store(db, a, emptyState(), now);
    else active(db, user, edition.guide.id, edition.revision.id, block, now);
    return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
  });
}

/**
  For authors: how a course's cases are going, as totals. Which misunderstandings are common, how often
  people had to rethink their first actions. No one's highlights, reasoning or handover, and nothing by speed.
*/
export function signalStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureSignal(db);
  const rows = db.prepare("SELECT block_id, user_id, status, result, retries FROM signal_attempts WHERE guide_id = ?").all(guideId) as Pick<
    AttemptRow,
    "block_id" | "user_id" | "status" | "result" | "retries"
  >[];
  const blocks = new Map<
    string,
    {
      blockId: string;
      attempts: number;
      people: Set<string>;
      finished: number;
      rethought: number;
      missedSignals: number;
      unwarrantedCertainty: number;
      careConnection: number;
      strongHandover: number;
    }
  >();
  for (const r of rows) {
    const b = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set<string>(),
      finished: 0,
      rethought: 0,
      missedSignals: 0,
      unwarrantedCertainty: 0,
      careConnection: 0,
      strongHandover: 0,
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    if (r.retries > 0) b.rethought += 1;
    if (r.status === "finished" && r.result) {
      const f = (JSON.parse(r.result) as SignalResult).flags;
      b.finished += 1;
      if (f.missedSignals) b.missedSignals += 1;
      if (f.unwarrantedCertainty) b.unwarrantedCertainty += 1;
      if (f.careConnection) b.careConnection += 1;
      if (f.strongHandover) b.strongHandover += 1;
    }
    blocks.set(r.block_id, b);
  }
  return { blocks: [...blocks.values()].map((b) => ({ ...b, people: b.people.size })) };
}
