import "server-only";
import { randomUUID } from "node:crypto";
import { allBlocks, type BenchmarkBlock } from "@/lib/magazine";
import {
  aggregate,
  batchCutoff,
  benchmarkStale,
  CONFIDENCE,
  cohortOf,
  KINDS,
  peerReasoning,
  readChoice,
  versionKey,
  type Confidence,
  type Vote,
} from "@/lib/benchmark";
import { members, posts } from "@/content/community";
import { ensureBenchmark, tx, type Db } from "./db";
import { canAuthor, HttpError, requireAuthor, type User } from "./auth";
import { readerEdition } from "./magazine";
import { withdrawnPosts } from "./reset";

/*
  Peer benchmark poll (docs/peer-benchmark-poll.md).

  - One vote per person per case version, whatever the course edition or how often they retake it. Locking twice
    returns the first lock: it never changes it, and never adds a vote.
  - The cohort is the person's verified Hub role when they lock, not something they pick.
  - Authors' votes are kept as their own decision but never counted, and the editor's preview stores nothing.
  - Results are served only to someone who has locked, only in batches, and only disclosure-checked. Nobody
    else sees who chose what, their confidence, their reason or their reflection.
*/

type VoteRow = {
  id: string;
  guide_id: string;
  block_id: string;
  version_key: string;
  user_id: string;
  revision_id: string;
  audience: string;
  cohort: string;
  eligible: number;
  choice: string;
  confidence: string;
  reason: string;
  reflection: string;
  locked_at: string;
  viewed_at: string | null;
};

const today = (now: Date) => now.toISOString().slice(0, 10);

function load(db: Db, user: User, guideId: string, blockId: unknown) {
  ensureBenchmark(db);
  const edition = readerEdition(db, user, guideId);
  const block = allBlocks(edition.doc).find((b) => b.id === blockId);
  if (!block || block.type !== "benchmark") throw new HttpError(404, "That poll isn’t here.");
  return { edition, block, vk: versionKey(block) };
}

const mine = (db: Db, user: User, guideId: string, blockId: string, vk: string) =>
  db.prepare("SELECT * FROM benchmark_votes WHERE guide_id = ? AND block_id = ? AND version_key = ? AND user_id = ?").get(guideId, blockId, vk, user.id) as
    VoteRow | undefined;

function view(db: Db, block: BenchmarkBlock, v: VoteRow | undefined, now: Date) {
  const paused = benchmarkStale(block, today(now));
  const peers = peerReasoning(block, posts, members, withdrawnPosts(db));
  return {
    locked: v ? { choice: v.choice, confidence: v.confidence, reason: v.reason, reflection: v.reflection, lockedAt: v.locked_at } : null,
    paused,
    // The reviewed reading of the choice and the perspective come only after the lock, and pause with the policy.
    reading: v && !paused ? readChoice(block, v.choice) : null,
    perspective: v && !paused ? block.perspective : null,
    // How every choice reads, by the reviewed key (never by the vote), once theirs is locked.
    readings: v && !paused ? block.choices.map((c) => ({ id: c.id, label: KINDS[c.kind] as string })) : null,
    peers: v ? peers : { thread: peers.thread, reasons: [] },
  };
}

export function benchmarkState(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block, vk } = load(db, user, guideId, blockId);
  return view(db, block, mine(db, user, edition.guide.id, block.id, vk), now);
}

/** Locks the learner's first decision for this version. Idempotent: a second lock returns the first. */
export function lockBenchmark(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, vk } = load(db, user, guideId, input.blockId);
  const choice = typeof input.choice === "string" ? input.choice : "";
  if (!block.choices.some((c) => c.id === choice)) throw new HttpError(400, "Choose one of the options.");
  const confidence = block.askConfidence && typeof input.confidence === "string" && input.confidence in CONFIDENCE ? (input.confidence as Confidence) : "";
  const reason = block.askReason && typeof input.reason === "string" ? input.reason.trim().slice(0, 200) : "";
  const out = tx(db, () => {
    const had = mine(db, user, edition.guide.id, block.id, vk);
    if (had) return { row: had, already: true };
    const eligible = canAuthor(user) ? 0 : 1;
    db.prepare(
      `INSERT OR IGNORE INTO benchmark_votes (id, guide_id, block_id, version_key, user_id, revision_id, audience, cohort, eligible, choice, confidence, reason, reflection, locked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)`,
    ).run(
      `pv-${randomUUID().slice(0, 12)}`,
      edition.guide.id,
      block.id,
      vk,
      user.id,
      edition.revision.id,
      user.audience,
      cohortOf(block, user.audience),
      eligible,
      choice,
      confidence,
      reason,
      now.toISOString(),
    );
    // Counts only: never which option, how confident, or why.
    db.prepare("INSERT INTO magazine_events (at, user_id, guide_id, revision_id, event, block_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      now.toISOString(),
      user.id,
      edition.guide.id,
      edition.revision.id,
      "benchmark.locked",
      block.id,
      JSON.stringify({ versionKey: vk, counted: Boolean(eligible) }),
    );
    return { row: mine(db, user, edition.guide.id, block.id, vk)!, already: false };
  });
  return { ...view(db, block, out.row, now), already: out.already };
}

/** "What fact would make you change your mind?": private to the learner. It never changes the locked decision. */
export function reflectBenchmark(db: Db, user: User, guideId: string, input: Record<string, unknown>, now: Date) {
  const { edition, block, vk } = load(db, user, guideId, input.blockId);
  const v = mine(db, user, edition.guide.id, block.id, vk);
  if (!v) throw new HttpError(400, "Lock in your decision first.");
  const text = typeof input.reflection === "string" ? input.reflection.trim().slice(0, 500) : "";
  db.prepare("UPDATE benchmark_votes SET reflection = ? WHERE id = ?").run(text, v.id);
  return view(db, block, { ...v, reflection: text }, now);
}

const counted = (db: Db, guideId: string, blockId: string, vk: string, before: string) =>
  db
    .prepare("SELECT choice, cohort FROM benchmark_votes WHERE guide_id = ? AND block_id = ? AND version_key = ? AND eligible = 1 AND locked_at < ?")
    .all(guideId, blockId, vk, before) as Vote[];

/** The latest batch of results, disclosure-checked. Only for someone who has locked their own decision. */
export function benchmarkResults(db: Db, user: User, guideId: string, blockId: unknown, now: Date) {
  const { edition, block, vk } = load(db, user, guideId, blockId);
  const v = mine(db, user, edition.guide.id, block.id, vk);
  if (!v) throw new HttpError(403, "Lock in your decision to see how others chose.");
  if (benchmarkStale(block, today(now))) return { paused: true as const, results: null, batchMinutes: block.batchMinutes };
  if (!v.viewed_at) db.prepare("UPDATE benchmark_votes SET viewed_at = ? WHERE id = ?").run(now.toISOString(), v.id);
  const cutoff = batchCutoff(now, block.batchMinutes).toISOString();
  return { paused: false as const, results: aggregate(block, counted(db, edition.guide.id, block.id, vk, cutoff), cutoff), batchMinutes: block.batchMinutes };
}

/**
  For authors: the current version's results under the same disclosure rules, and how many decisions sit under
  earlier versions (kept apart, never blended). No names, choices by person, confidence or reasons.
*/
export function benchmarkStats(db: Db, actor: User, guideId: string, blockId: unknown, now: Date) {
  requireAuthor(actor);
  const { edition, block, vk } = load(db, actor, guideId, blockId);
  const cutoff = batchCutoff(now, block.batchMinutes).toISOString();
  const versions = db
    .prepare("SELECT version_key AS key, COUNT(*) AS n FROM benchmark_votes WHERE guide_id = ? AND block_id = ? AND eligible = 1 GROUP BY version_key")
    .all(edition.guide.id, block.id) as { key: string; n: number }[];
  const min = Math.max(10, block.minCohort);
  const reflected = (
    db
      .prepare("SELECT COUNT(*) AS n FROM benchmark_votes WHERE guide_id = ? AND block_id = ? AND version_key = ? AND eligible = 1 AND reflection != ''")
      .get(edition.guide.id, block.id, vk) as { n: number }
  ).n;
  const current = counted(db, edition.guide.id, block.id, vk, cutoff);
  return {
    versionKey: vk,
    results: aggregate(block, current, cutoff),
    reflected: current.length >= min ? reflected : null,
    earlier: versions.filter((x) => x.key !== vk).map((x) => ({ key: x.key, n: x.n >= min ? x.n : null })),
  };
}
