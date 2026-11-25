import "server-only";
import { randomUUID } from "node:crypto";
import { audit, type Db } from "./db";
import { HttpError, userById, type User } from "./auth";
import { requireGuide } from "./magazineDraft";
import { cleanVoice, hubSpeech, makeRecording, RECORDINGS_PER_HOUR, recordingsThisHour, speechTarget, type SpeechEngine } from "./magazineNarration";
import { openaiReady } from "./openaiText";
import { ttsConfig } from "./tts";
import type { NarrationAudio } from "@/lib/magazine";
import { DELIVERY_NOTES, SPEECH_PRICES_TO_VERIFY, speechCost, textHash, type DeliveryNote } from "@/lib/magazineNarration";

/*
  Audio Introductions are recorded in the background (docs/magazine-audio-guide.md). An author asks for audio; each
  script becomes a job (queued, running, done or failed) and is recorded in turn, one at a time, in this server. A
  finished recording is kept as a hub upload and with its job, and the editor attaches it to the draft for the author
  to listen to and approve. Nothing here touches a course: a failed job leaves the draft and every published edition as
  they were, and can be tried again. Asking again for the same words in the same voice reuses the recording already made.

  One queue for every introduction recorded in the Hub's voices (docs/discovery-exciter.md): each job has an owner,
  kept in the `guide_id` column. A Magazine course's id for its page introductions, or `learning_path:<id>` for a
  Discovery Path's Discovery Exciter. The owner's own module checks who may ask (requireGuide for a course); the
  functions taking an owner here assume that's been done.
*/

export type JobStatus = "queued" | "running" | "done" | "failed";
type JobRow = {
  id: string;
  guide_id: string;
  target: string;
  script: string;
  script_hash: string;
  voice: string;
  fresh: number;
  status: JobStatus;
  error: string | null;
  attempts: number;
  result: string | null;
  characters: number;
  provider: string;
  model: string;
  est_cost: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  attached_at: string | null;
  delivery: string | null;
};
export type NarrationJob = {
  id: string;
  target: string;
  scriptHash: string;
  voice: string;
  status: JobStatus;
  error: string | null;
  attempts: number;
  result: NarrationAudio | null;
  characters: number;
  provider: string;
  model: string;
  estCost: number | null;
  createdAt: string;
  finishedAt: string | null;
  /** The editor has put this recording with its script (so it isn't put back after the author discards it). */
  attached: boolean;
  /** A delivery note the voice took on (a Discovery Exciter's "curious"), when there was one. */
  delivery: DeliveryNote | null;
};

const ready = new WeakSet<Db>();
/** The table, made here so a database opened before it existed (a running server) has it as soon as it's needed. */
export function ensureNarrationJobs(db: Db) {
  if (ready.has(db)) return;
  db.exec(`CREATE TABLE IF NOT EXISTS magazine_narration_jobs (
    id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, target TEXT NOT NULL, script TEXT NOT NULL, script_hash TEXT NOT NULL, voice TEXT NOT NULL,
    fresh INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 1, result TEXT,
    characters INTEGER NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, est_cost REAL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS magazine_narration_jobs_guide ON magazine_narration_jobs (guide_id, created_at);`);
  // Added after the table first went in.
  const cols = (db.prepare("PRAGMA table_info(magazine_narration_jobs)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("attached_at")) db.exec("ALTER TABLE magazine_narration_jobs ADD COLUMN attached_at TEXT");
  // Discovery Exciters (Nov 2026): the delivery note the voice takes on. Empty for every Magazine recording.
  if (!cols.includes("delivery")) db.exec("ALTER TABLE magazine_narration_jobs ADD COLUMN delivery TEXT");
  ready.add(db);
}

const deliveryOf = (v: unknown): DeliveryNote | null => (typeof v === "string" && v in DELIVERY_NOTES ? (v as DeliveryNote) : null);

const view = (r: JobRow): NarrationJob => ({
  id: r.id,
  target: r.target,
  scriptHash: r.script_hash,
  voice: r.voice,
  status: r.status,
  error: r.error,
  attempts: r.attempts,
  result: r.result ? (JSON.parse(r.result) as NarrationAudio) : null,
  characters: r.characters,
  provider: r.provider,
  model: r.model,
  estCost: r.est_cost,
  createdAt: r.created_at,
  finishedAt: r.finished_at,
  attached: Boolean(r.attached_at),
  delivery: deliveryOf(r.delivery),
});

/** Who records, and whether the price is one to estimate from (SPEECH_PRICES_TO_VERIFY). */
export function speechInfo(voice: string) {
  const t = speechTarget(voice);
  const price = t.provider === "openai" ? (SPEECH_PRICES_TO_VERIFY[t.model] ?? null) : null;
  const configured = t.provider === "openai" ? openaiReady() : Boolean(ttsConfig().apiKey);
  return { provider: t.provider, model: t.model, profile: t.profile ?? null, pricePerMillionChars: price, configured };
}

// ---------------------------------------------------------------------------------------------
// The Magazine: a course's page introductions (the owner is the course)
// ---------------------------------------------------------------------------------------------

/** The course's recording jobs, newest first. A job stopped part-way by a restart is marked failed, and anything queued is picked up. */
export function narrationJobs(db: Db, actor: User, guideId: string, voice?: unknown, speech: SpeechEngine = hubSpeech) {
  requireGuide(db, actor, guideId);
  return ownerJobs(db, guideId, voice, speech);
}

/**
  Queues audio for approved scripts: one job each. Several at once is a paid bulk run, so it needs `confirmed` (the
  editor shows the estimated cost first). The same words in the same voice reuse a job that's waiting, running or
  done, unless `fresh` asks for a new take ("Regenerate audio").
*/
export function queueNarrationAudio(
  db: Db,
  actor: User,
  guideId: string,
  input: { items?: unknown; voice?: unknown; confirmed?: unknown; fresh?: unknown },
  now: Date,
  speech: SpeechEngine = hubSpeech,
) {
  requireGuide(db, actor, guideId);
  return queueOwnerAudio(db, actor, guideId, input, now, { event: "magazine.narration_queued" }, speech);
}

/** The editor has put these recordings with their scripts: they aren't offered again (an author who discards one keeps it discarded). */
export function markNarrationJobsAttached(db: Db, actor: User, guideId: string, jobIds: unknown, now: Date) {
  requireGuide(db, actor, guideId);
  return markOwnerJobsAttached(db, guideId, jobIds, now);
}

/** Tries a failed job again. What learners hear isn't affected either way. */
export function retryNarrationJob(db: Db, actor: User, guideId: string, jobId: unknown, now: Date, speech: SpeechEngine = hubSpeech) {
  requireGuide(db, actor, guideId);
  return retryOwnerJob(db, actor, guideId, jobId, now, speech);
}

// ---------------------------------------------------------------------------------------------
// Any owner (the caller has checked who may ask)
// ---------------------------------------------------------------------------------------------

/** An owner's recording jobs, newest first, with who records and the price to estimate from. Picks up anything queued. */
export function ownerJobs(db: Db, owner: string, voice?: unknown, speech: SpeechEngine = hubSpeech) {
  ensureNarrationJobs(db);
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  db.prepare(
    "UPDATE magazine_narration_jobs SET status = 'failed', error = 'It stopped part-way (the server restarted). Try again.', updated_at = ? WHERE guide_id = ? AND status = 'running' AND updated_at < ?",
  ).run(new Date().toISOString(), owner, stale);
  const rows = db.prepare("SELECT * FROM magazine_narration_jobs WHERE guide_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 300").all(owner) as JobRow[];
  if (rows.some((r) => r.status === "queued")) void drainNarrationJobs(db, speech);
  const v = cleanVoice(voice) ?? "profile:editorial";
  return { jobs: rows.map(view), speech: speechInfo(v), perHour: RECORDINGS_PER_HOUR };
}

/**
  Queues audio for an owner's scripts, one job each (the Magazine's rules above). `event` names the audit entry;
  `delivery` is a delivery note for the voice (it's part of what makes two recordings the same).
*/
export function queueOwnerAudio(
  db: Db,
  actor: User,
  owner: string,
  input: { items?: unknown; voice?: unknown; confirmed?: unknown; fresh?: unknown },
  now: Date,
  opts: { event: string; delivery?: DeliveryNote | null },
  speech: SpeechEngine = hubSpeech,
) {
  ensureNarrationJobs(db);
  const voice = cleanVoice(input.voice);
  if (!voice) throw new HttpError(400, "Choose one of the voices offered.");
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((x) => x as { target?: unknown; script?: unknown })
    .map((x) => ({ target: typeof x.target === "string" ? x.target.slice(0, 60) : "", script: typeof x.script === "string" ? x.script.trim() : "" }))
    .filter((x) => /^[\w-]{1,60}$/.test(x.target));
  if (!items.length) throw new HttpError(400, "There’s nothing to record.");
  if (items.length > 60) throw new HttpError(400, "Record up to 60 introductions at a time.");
  for (const x of items) {
    if (!x.script) throw new HttpError(400, "There’s no script to record.");
    if (x.script.length > 1200) throw new HttpError(400, "That script is too long to record. Keep it under 1,200 characters.");
  }
  if (items.length > 1 && input.confirmed !== true) throw new HttpError(400, "Confirm the estimated cost before recording several introductions.");
  const info = speechInfo(voice);
  // The hub's own speech needs its key; a stand-in (tests) doesn't.
  if (!info.configured && speech === hubSpeech)
    throw new HttpError(503, info.provider === "openai" ? "OpenAI isn’t connected. Add OPENAI_API_KEY to .env.local." : "ElevenLabs isn’t connected.");
  const fresh = input.fresh === true;
  const delivery = deliveryOf(opts.delivery);
  const at = now.toISOString();
  const waiting = (
    db
      .prepare("SELECT COUNT(*) AS n FROM magazine_narration_jobs WHERE created_by = ? AND created_at > ? AND status != 'failed'")
      .get(actor.id, new Date(now.getTime() - 3600_000).toISOString()) as { n: number }
  ).n;
  if (Math.max(waiting, recordingsThisHour(db, actor, now)) + items.length > RECORDINGS_PER_HOUR)
    throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  const out: NarrationJob[] = [];
  for (const x of items) {
    const hash = textHash(x.script);
    const same = fresh
      ? undefined
      : (db
          .prepare(
            "SELECT * FROM magazine_narration_jobs WHERE guide_id = ? AND target = ? AND script_hash = ? AND voice = ? AND coalesce(delivery, '') = ? AND status != 'failed' ORDER BY created_at DESC LIMIT 1",
          )
          .get(owner, x.target, hash, voice, delivery ?? "") as JobRow | undefined);
    if (same) {
      // Asked for again: the editor puts it with its script again.
      if (same.attached_at) db.prepare("UPDATE magazine_narration_jobs SET attached_at = NULL WHERE id = ?").run(same.id);
      same.attached_at = null;
      out.push(view(same));
      continue;
    }
    const id = `nj-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    db.prepare(
      `INSERT INTO magazine_narration_jobs (id, guide_id, target, script, script_hash, voice, fresh, status, characters, provider, model, est_cost, created_by, created_at, updated_at, delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      owner,
      x.target,
      x.script,
      hash,
      voice,
      fresh ? 1 : 0,
      x.script.length,
      info.provider,
      info.model,
      speechCost(x.script.length, info.provider, info.model),
      actor.id,
      at,
      at,
      delivery,
    );
    out.push(view(db.prepare("SELECT * FROM magazine_narration_jobs WHERE id = ?").get(id) as JobRow));
  }
  audit(db, {
    actor: actor.id,
    event: opts.event,
    entity: owner,
    next: {
      jobs: out.length,
      voice,
      characters: items.reduce((n, x) => n + x.script.length, 0),
      confirmed: input.confirmed === true,
      ...(delivery && { delivery }),
    },
    at: now,
  });
  void drainNarrationJobs(db, speech);
  return { jobs: out };
}

/** These recordings have been put with their scripts: they aren't offered again. */
export function markOwnerJobsAttached(db: Db, owner: string, jobIds: unknown, now: Date) {
  ensureNarrationJobs(db);
  const ids = (Array.isArray(jobIds) ? jobIds : []).map(String).slice(0, 100);
  for (const id of ids)
    db.prepare("UPDATE magazine_narration_jobs SET attached_at = ? WHERE id = ? AND guide_id = ? AND status = 'done'").run(now.toISOString(), id, owner);
  return { ok: true };
}

/** Tries an owner's failed job again. */
export function retryOwnerJob(db: Db, actor: User, owner: string, jobId: unknown, now: Date, speech: SpeechEngine = hubSpeech) {
  ensureNarrationJobs(db);
  const row = db.prepare("SELECT * FROM magazine_narration_jobs WHERE id = ? AND guide_id = ?").get(String(jobId), owner) as JobRow | undefined;
  if (!row) throw new HttpError(404, "That recording job isn’t here.");
  if (row.status !== "failed") throw new HttpError(400, "Only a failed recording can be tried again.");
  if (recordingsThisHour(db, actor, now) >= RECORDINGS_PER_HOUR)
    throw new HttpError(429, "That’s a lot of recordings in an hour. Take a short break, then try again.");
  db.prepare("UPDATE magazine_narration_jobs SET status = 'queued', error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?").run(
    now.toISOString(),
    row.id,
  );
  void drainNarrationJobs(db, speech);
  return { job: view(db.prepare("SELECT * FROM magazine_narration_jobs WHERE id = ?").get(row.id) as JobRow) };
}

const draining = new WeakMap<Db, Promise<void>>();
/** Records queued jobs one at a time. Returns when the queue is empty (tests wait on it). */
export function drainNarrationJobs(db: Db, speech: SpeechEngine = hubSpeech): Promise<void> {
  const running = draining.get(db);
  if (running) return running;
  ensureNarrationJobs(db);
  const self: { run?: Promise<void> } = {};
  self.run = (async () => {
    // Registered as running before the first look at the queue, so it's never left behind as finished.
    await Promise.resolve();
    try {
      for (;;) {
        const next = db.prepare("SELECT * FROM magazine_narration_jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1").get() as JobRow | undefined;
        if (!next) return;
        // Claimed by this run only (another copy of this module, after a reload, can't take it too).
        const claimed = db
          .prepare("UPDATE magazine_narration_jobs SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'")
          .run(new Date().toISOString(), next.id);
        if (Number(claimed.changes) !== 1) continue;
        await runJob(db, next, speech);
      }
    } finally {
      if (draining.get(db) === self.run) draining.delete(db);
    }
  })();
  draining.set(db, self.run);
  return self.run;
}

async function runJob(db: Db, job: JobRow, speech: SpeechEngine) {
  const now = new Date();
  try {
    const actor = userById(db, job.created_by);
    if (!actor) throw new HttpError(403, "The author who asked for this recording can’t record any more.");
    const delivery = deliveryOf(job.delivery);
    // The owner is the audit entity: a course's id, or learning_path:<id>.
    const rec = await makeRecording(
      db,
      actor,
      job.guide_id,
      { script: job.script, voice: job.voice, target: job.target, fresh: job.fresh === 1, ...(delivery && { delivery }) },
      now,
      speech,
    );
    const done = new Date().toISOString();
    db.prepare("UPDATE magazine_narration_jobs SET status = 'done', result = ?, provider = ?, model = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      JSON.stringify(rec),
      rec.provider ?? job.provider,
      rec.model ?? job.model,
      done,
      done,
      job.id,
    );
  } catch (e) {
    const at = new Date().toISOString();
    db.prepare("UPDATE magazine_narration_jobs SET status = 'failed', error = ?, updated_at = ?, finished_at = ? WHERE id = ?").run(
      (e instanceof Error ? e.message : "The recording didn’t work.").slice(0, 300),
      at,
      at,
      job.id,
    );
  }
}
