import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { allBlocks, type OneDayBlock } from "@/lib/magazine";
import {
  applyDayAction,
  buildDebrief,
  cleanAttempt,
  dayView,
  DIM_ORDER,
  emptyAttempt,
  FLAGS,
  replay,
  retryFrom,
  type Attempt,
  type DayAction,
  type Dim,
  type FlagId,
} from "@/lib/oneDay";
import { ensureOneDay, tx, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";

/*
  One Day, Five Perspectives (docs/one-day-five-perspectives.md): a learner's attempt, kept on the server and replayed
  against the published case. The browser only ever gets dayView: events that have arrived, the lenses the learner has
  opened and, once the day is closed, the debrief. Later events, other people's private facts and the rubric stay here.

  There's no model call anywhere in it. The activity log carries event ids, option ids, lens actors, flags and rubric
  levels: fictional choices only.
*/

type AttemptRow = {
  id: string;
  guide_id: string;
  revision_id: string;
  block_id: string;
  user_id: string;
  attempt_no: number;
  key_hash: string;
  story_version: string;
  state: string;
  result: string | null;
  status: "active" | "finished";
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

/** Changes when the case does, so an attempt says which version it was read against. */
export const dayHash = (b: OneDayBlock) =>
  createHash("sha1")
    .update(JSON.stringify({ ...b, id: "" }))
    .digest("hex")
    .slice(0, 12);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureOneDay(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "onedaymap") throw new HttpError(404, "That journey map isn’t here.");
  return { edition, block };
}

const latest = (db: Db, user: User, guideId: string, revisionId: string, blockId: string) =>
  db
    .prepare(
      "SELECT * FROM one_day_attempts WHERE user_id = ? AND guide_id = ? AND revision_id = ? AND block_id = ? ORDER BY attempt_no DESC, rowid DESC LIMIT 1",
    )
    .get(user.id, guideId, revisionId, blockId) as AttemptRow | undefined;
const reread = (db: Db, id: string) => db.prepare("SELECT * FROM one_day_attempts WHERE id = ?").get(id) as AttemptRow;
const stored = (a: AttemptRow, b: OneDayBlock) => cleanAttempt(b, JSON.parse(a.state));

/** One event in the Hub's activity log, with the attempt's id and version. Fictional choices only. */
function log(db: Db, a: AttemptRow, event: string, detail: object, now: Date) {
  db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    now.toISOString(),
    a.user_id,
    a.guide_id,
    a.revision_id,
    event,
    a.block_id,
    JSON.stringify({ attempt: a.id, story: a.story_version, ...detail }),
  );
}

function view(a: AttemptRow | undefined, b: OneDayBlock, refused?: { eventId: string; optionId: string; feedback: string; missing: number }) {
  const attempt = a ? stored(a, b) : emptyAttempt();
  return {
    attemptId: a?.id ?? null,
    attemptNo: a?.attempt_no ?? 0,
    status: a?.status ?? ("new" as const),
    day: dayView(b, attempt),
    /** A choice Leila couldn't make yet, with its feedback. Not stored as a decision. */
    refused: refused ?? null,
    earlierCase: Boolean(a && a.key_hash !== dayHash(b)),
  };
}
export type OneDayView = ReturnType<typeof view>;

export function oneDayState(db: Db, user: User, guideId: string, blockId: unknown) {
  const { edition, block } = load(db, user, guideId, blockId);
  return view(latest(db, user, edition.guide.id, edition.revision.id, block.id), block);
}

function create(db: Db, user: User, guideId: string, revisionId: string, b: OneDayBlock, attemptNo: number, attempt: Attempt, now: Date): AttemptRow {
  const id = `od-${randomUUID().slice(0, 12)}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO one_day_attempts (id, guide_id, revision_id, block_id, user_id, attempt_no, key_hash, story_version, state, status, started_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, guideId, revisionId, b.id, user.id, attemptNo, dayHash(b), b.version, JSON.stringify(attempt), at, at);
  return reread(db, id);
}

/** Logs the events that arrived between two states of the attempt, and finishes the attempt when the day closes. */
const arrivedIn = (b: OneDayBlock, a: Attempt) => new Set(replay(b, a).arrived.map((x) => x.event.id));
function settle(db: Db, a: AttemptRow, b: OneDayBlock, was: Set<string>, after: Attempt, now: Date) {
  const s = replay(b, after);
  for (const x of s.arrived.filter((y) => !was.has(y.event.id))) log(db, a, "event_arrived", { event: x.event.id, time: x.event.time }, now);
  const at = now.toISOString();
  if (!s.done) {
    db.prepare("UPDATE one_day_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(after), at, a.id);
    return;
  }
  const d = buildDebrief(b, after, s);
  const result = {
    version: d.version,
    total: d.total,
    dims: Object.fromEntries(d.dims.map((x) => [x.dim, x.level])) as Record<Dim, number | null>,
    flags: d.flags.map((f) => f.flag),
    closing: after.closing,
    lenses: after.lenses.length,
    misses: after.misses.length,
  };
  db.prepare("UPDATE one_day_attempts SET state = ?, result = ?, status = 'finished', updated_at = ?, finished_at = ? WHERE id = ?").run(
    JSON.stringify(after),
    JSON.stringify(result),
    at,
    at,
    a.id,
  );
  log(db, a, "journey_completed", { total: d.total, dims: result.dims, flags: result.flags }, now);
}

const asAction = (input: Record<string, unknown>): DayAction | null => {
  const s = (v: unknown) => (typeof v === "string" ? v.slice(0, 40) : "");
  if (input.action === "choose") return { action: "choose", eventId: s(input.eventId), optionId: s(input.optionId) };
  if (input.action === "lens") return { action: "lens", eventId: s(input.eventId), actorId: s(input.actorId) };
  if (input.action === "reply") return { action: "reply", eventId: s(input.eventId), actorId: s(input.actorId), replyId: s(input.replyId) };
  if (input.action === "close") {
    const c = input.closing && typeof input.closing === "object" ? (input.closing as Record<string, unknown>) : {};
    return { action: "close", closing: Object.fromEntries(Object.entries(c).map(([k, v]) => [k.slice(0, 40), s(v)])) };
  }
  return null;
};

/** Starts the day (the first attempt), or returns the one in progress. */
export function startDay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    return view(a ?? begin(db, user, edition.guide.id, edition.revision.id, block, now), block);
  });
}

function begin(db: Db, user: User, guideId: string, revisionId: string, b: OneDayBlock, now: Date) {
  const row = create(db, user, guideId, revisionId, b, 1, emptyAttempt(), now);
  log(db, row, "journey_started", { attemptNo: 1 }, now);
  settle(db, row, b, new Set(), emptyAttempt(), now);
  return reread(db, row.id);
}

/** A decision, a role lens, a lens reply or the close of the day. */
export function actOnDay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const x = asAction(input);
  if (!x) throw new HttpError(400, "That isn’t something you can do here.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id) ?? begin(db, user, edition.guide.id, edition.revision.id, block, now);
    if (a.status === "finished") return view(a, block);
    const before = stored(a, block);
    const out = applyDayAction(block, before, x);
    if (out.error) throw new HttpError(400, out.error);
    if (out.refused) {
      if (out.attempt !== before)
        db.prepare("UPDATE one_day_attempts SET state = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(out.attempt), now.toISOString(), a.id);
      log(db, a, "knowledge_gap_hit", { event: out.refused.eventId, option: out.refused.optionId, missing: out.refused.missing }, now);
      return view(reread(db, a.id), block, out.refused);
    }
    if (x.action === "lens" && out.attempt !== before) log(db, a, "role_lens_opened", { event: x.eventId, actor: x.actorId }, now);
    if (x.action === "reply") log(db, a, "lens_reply_chosen", { event: x.eventId, actor: x.actorId, reply: x.replyId }, now);
    if (x.action === "choose") {
      const o = block.events.find((e) => e.id === x.eventId)?.decision?.options.find((y) => y.id === x.optionId);
      log(db, a, "decision_made", { event: x.eventId, option: x.optionId, flags: (o?.effect.flag ?? []) as FlagId[] }, now);
    }
    if (x.action === "close") log(db, a, "day_closed", { closing: out.attempt.closing }, now);
    settle(db, a, block, arrivedIn(block, before), out.attempt, now);
    return view(reread(db, a.id), block);
  });
}

/**
  Retry from an event: a fresh attempt that keeps the choices before it, so the day replays from there. Without an
  event, Replay the day from the start. The earlier attempt is kept as it was.
*/
export function retryDay(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block } = load(db, user, guideId, input.blockId);
  const eventId = typeof input.eventId === "string" ? input.eventId : "";
  if (eventId && !block.events.some((e) => e.id === eventId)) throw new HttpError(400, "That event isn’t in this day.");
  return tx(db, () => {
    const a = latest(db, user, edition.guide.id, edition.revision.id, block.id);
    const prev = a ? stored(a, block) : emptyAttempt();
    const next = eventId ? retryFrom(block, prev, eventId) : emptyAttempt();
    const row = create(db, user, edition.guide.id, edition.revision.id, block, (a?.attempt_no ?? 0) + 1, next, now);
    log(db, row, "event_retried", { from: a?.id ?? null, event: eventId || null }, now);
    settle(db, row, block, new Set(), next, now);
    return view(reread(db, row.id), block);
  });
}

/** Under this many people, a breakdown could point to someone: only the counts are shown. */
export const SMALL_COHORT = 5;

/**
  Totals for the course's authors: attempts, people, finished days and (with enough people) rubric levels by
  dimension and critical-flag counts, from each person's first finished attempt. Never choices by person.
*/
export function oneDayStats(db: Db, actor: User, guideId: string) {
  requireAuthor(actor);
  ensureOneDay(db);
  const rows = db
    .prepare("SELECT block_id, user_id, attempt_no, status, result, story_version FROM one_day_attempts WHERE guide_id = ? ORDER BY attempt_no")
    .all(guideId) as Pick<AttemptRow, "block_id" | "user_id" | "attempt_no" | "status" | "result" | "story_version">[];
  type Totals = {
    blockId: string;
    attempts: number;
    people: Set<string>;
    finished: number;
    counted: Set<string>;
    dims: Record<Dim, number[]>;
    flags: Record<string, number>;
    lensVisits: number;
    gaps: number;
    versions: Set<string>;
  };
  const blocks = new Map<string, Totals>();
  for (const r of rows) {
    const b: Totals = blocks.get(r.block_id) ?? {
      blockId: r.block_id,
      attempts: 0,
      people: new Set(),
      finished: 0,
      counted: new Set(),
      dims: Object.fromEntries(DIM_ORDER.map((k) => [k, [0, 0, 0, 0]])) as Record<Dim, number[]>,
      flags: {},
      lensVisits: 0,
      gaps: 0,
      versions: new Set(),
    };
    b.attempts += 1;
    b.people.add(r.user_id);
    b.versions.add(r.story_version);
    if (r.status === "finished" && r.result) {
      b.finished += 1;
      if (!b.counted.has(r.user_id)) {
        b.counted.add(r.user_id);
        const res = JSON.parse(r.result) as { dims: Record<Dim, number | null>; flags: FlagId[]; lenses: number; misses: number };
        for (const k of DIM_ORDER) if (res.dims[k] !== null && res.dims[k] !== undefined) b.dims[k][res.dims[k]!] += 1;
        for (const f of res.flags) if (f in FLAGS) b.flags[f] = (b.flags[f] ?? 0) + 1;
        b.lensVisits += res.lenses;
        b.gaps += res.misses;
      }
    }
    blocks.set(r.block_id, b);
  }
  return {
    blocks: [...blocks.values()].map((b) => {
      const small = b.counted.size < SMALL_COHORT;
      return {
        blockId: b.blockId,
        attempts: b.attempts,
        people: b.people.size,
        finished: b.finished,
        counted: b.counted.size,
        suppressed: small,
        dims: small ? null : b.dims,
        flags: small ? null : b.flags,
        lensVisits: small ? null : b.lensVisits,
        gaps: small ? null : b.gaps,
        versions: [...b.versions],
      };
    }),
  };
}
