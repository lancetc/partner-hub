import "server-only";
import sharp from "sharp";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { guideIdentity, guideVoiceRef } from "./learningGuide";
import { avaSpeaks, narration, scriptFor, ttsConfig } from "./tts";
import { AVATAR_MODEL, portraitBytes, scriptHash } from "./avatar";
import { flowsCall } from "./imageGen";
import { readUpload, saveUpload } from "./uploads";
import { estimateWords, retimeWords, wordsFromAlignment, wordsFromSpeech, type HeardToken, type WordTiming } from "@/lib/wordTimings";

/*
  Ava's voice (docs/ai-learning-guide.md, "Ava 2.0"). The guide's identity names it: an ElevenLabs voice id,
  "openai:<voice>", or a voice's name ("Addison 2.0") that's looked up among the account's voices, so nobody
  has to hard-code an id. AVA_VOICE_ID in the environment wins over all of these. When the named voice isn't
  in the account (it has to be added from the ElevenLabs voice library first), Ava speaks in the Hub's
  narrator's voice, so nothing stops working.
*/

const VOICE_ID = /^[A-Za-z0-9]{16,40}$/;
let listed: { at: number; voices: { id: string; name: string }[] } | null = null;

async function accountVoices(now: number) {
  if (listed && now - listed.at < 3600_000) return listed.voices;
  const { apiKey } = ttsConfig();
  let voices: { id: string; name: string }[] = [];
  if (apiKey) {
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.ok)
        voices = ((await res.json()) as { voices?: { voice_id: string; name: string }[] }).voices?.map((v) => ({ id: v.voice_id, name: v.name })) ?? [];
    } catch {
      // Unreachable: the narrator's voice for now, and another look in a minute.
      listed = { at: now - 3600_000 + 60_000, voices: [] };
      return [];
    }
  }
  listed = { at: now, voices };
  return voices;
}

/** Finds a voice by the name it's given: an exact match first, then one whose name starts with it ("Addison 2.0 - Warm ..."). */
export function voiceByName(voices: { id: string; name: string }[], name: string) {
  const want = name.trim().toLowerCase();
  if (!want) return undefined;
  return (
    voices.find((v) => v.name.trim().toLowerCase() === want) ??
    voices.find((v) => v.name.trim().toLowerCase().startsWith(want)) ??
    voices.find(
      (v) =>
        v.name
          .trim()
          .toLowerCase()
          .split(/\s+-\s+/)[0] === want,
    )
  )?.id;
}

/** The voice id Ava speaks in, or undefined for the Hub's narrator. */
export async function avaVoice(db: Db, now = Date.now()): Promise<string | undefined> {
  if (process.env.AVA_VOICE_ID) return process.env.AVA_VOICE_ID;
  const ref = guideVoiceRef(db).trim();
  if (!ref) return undefined;
  if (ref.startsWith("openai:") || VOICE_ID.test(ref)) return ref;
  return voiceByName(await accountVoices(now), ref);
}

/**
  Who learners see in Ava's window: her name and her portrait. Until an administrator sets a portrait (Admin →
  AI Learning Guide), the still of the Topic presenter, the face Ava already has in Topics.
*/
export const AVA_FALLBACK_PORTRAIT = "/images/presenter-intro.jpg";
export function avaForLearners(db: Db) {
  const who = guideIdentity(db);
  return { name: who.name || "Ava", portrait: who.portrait ?? AVA_FALLBACK_PORTRAIT };
}

// ---------------------------------------------------------------------------------------------
// Ava's talking videos: her portrait and her voice, made into a video by ElevenLabs' lip-sync model
// ---------------------------------------------------------------------------------------------

/*
  Each line Ava speaks (keyed like the narration: path:<id>, magazine:<guideId>:intro, lesson:<slug>:<card>) can have a
  talking video, made from her portrait (Admin → AI Learning Guide: a still of the Laura avatar, or any face; the Topic
  presenter's still until one is set) and her voice. ElevenLabs' API can't play an avatar by its id, so this is how a
  chosen avatar reaches the Hub. An author makes them (each is a paid generation); learners get one only while it still
  matches the script, the voice and the portrait, and otherwise see the portrait with her voice, so nothing plays out of date.
*/

const VIDEO_API = "https://api.elevenlabs.io/v1/flows/video";
const VIDEOS_PER_HOUR = 12;

type VideoRow = {
  key: string;
  script_hash: string;
  voice: string;
  portrait: string;
  generation_id: string | null;
  status: "pending" | "completed" | "failed";
  video_src: string | null;
  seconds: number | null;
  error: string | null;
  created_by: string;
  created_at: string;
  finished_at: string | null;
  transcript: string | null;
  /** JSON word timings (lib/wordTimings), for following along. */
  words: string | null;
  /** How the words were timed: "aligned" by ElevenLabs' forced alignment, or "estimated" from the video's length. */
  timing: string | null;
};

/** The table, made here too, so a database opened before it existed (a running server) has it as soon as it's needed. */
const ready = new WeakSet<Db>();
function videos(db: Db) {
  if (!ready.has(db)) {
    db.exec(`CREATE TABLE IF NOT EXISTS ava_videos (
      key TEXT PRIMARY KEY, script_hash TEXT NOT NULL, voice TEXT NOT NULL, portrait TEXT NOT NULL, generation_id TEXT,
      status TEXT NOT NULL, video_src TEXT, seconds REAL, error TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
      transcript TEXT, words TEXT, timing TEXT)`);
    // A table made before uploads could carry their own words and timings.
    const cols = db.prepare("PRAGMA table_info(ava_videos)").all() as { name: string }[];
    for (const c of ["transcript", "words", "timing"]) if (!cols.some((x) => x.name === c)) db.exec(`ALTER TABLE ava_videos ADD COLUMN ${c} TEXT`);
    ready.add(db);
  }
  return db;
}
const videoRow = (db: Db, key: string) => videos(db).prepare("SELECT * FROM ava_videos WHERE key = ?").get(key) as VideoRow | undefined;
/** The voice a video is made in, as it's recorded: Ava's voice, or the Hub narrator's when she has none of her own. */
const voiceFor = async (db: Db) => (await avaVoice(db)) ?? ttsConfig().voiceId;

/** How an uploaded video is marked in the voice column: its face and voice are its own. */
const UPLOADED = "upload";

export type AvaVideoState = "none" | "pending" | "ready" | "stale" | "failed";

/** Where one line's video is: none yet, being made, ready, out of date (script, voice or portrait changed), or failed. */
async function stateOf(db: Db, key: string, row = videoRow(db, key), drafts = false): Promise<{ state: AvaVideoState; error?: string }> {
  if (!row) return { state: "none" };
  if (row.status === "pending") return { state: "pending" };
  if (row.status === "failed") return { state: "failed", error: row.error ?? "The video couldn’t be made." };
  // An uploaded video (made in ElevenLabs, say, with the Laura avatar) has its own face and voice. With its own words (an
  // interrupted transmission) it stands as it is, Audio Guide script or not; otherwise it says the line's script, and has
  // to keep matching it.
  if (row.voice === UPLOADED && row.transcript) return { state: "ready" };
  // For an author (drafts), the line's script as saved in the editor; learners only ever get what's published.
  let script = "";
  try {
    script = scriptFor(db, key, drafts);
  } catch {
    return { state: "stale" };
  }
  if (row.voice === UPLOADED) return { state: row.script_hash === scriptHash(script) ? "ready" : "stale" };
  const same = row.script_hash === scriptHash(script) && row.voice === (await voiceFor(db)) && row.portrait === avaForLearners(db).portrait;
  return { state: same ? "ready" : "stale" };
}

/** A learner's copy: the video for this line, only when it's ready and still matches. */
export async function avaVideoFor(
  db: Db,
  key: string,
): Promise<{ src: string; poster: string | null; transcript: string | null; words: WordTiming[] | null } | null> {
  const row = videoRow(db, key);
  if (!row?.video_src || (await stateOf(db, key, row)).state !== "ready") return null;
  // An uploaded video shows its own first frame rather than Ava's portrait, and its own words when it has them, timed so
  // the word she's saying can be highlighted.
  return { src: row.video_src, poster: row.portrait || null, transcript: row.transcript || null, words: wordsOf(row) };
}

export type AvaVideo = NonNullable<Awaited<ReturnType<typeof avaVideoFor>>>;
/** Ava as a Magazine course's reader gets her, with the page: her name and portrait, and her videos for its introduction and pages. */
export type ReaderAva = { name: string; portrait: string; videos: Record<string, AvaVideo> };

/**
  Sent with the course itself, so the page knows from the start whether Ava introduces it: her window (and its "Incoming
  transmission") is there as the page appears, rather than a picture first that then gives way to her.
*/
export async function avaForCourse(db: Db, guideId: string, pageIds: string[]): Promise<ReaderAva> {
  const videos: Record<string, AvaVideo> = {};
  for (const key of [`magazine:${guideId}:intro`, ...pageIds.map((p) => `magazine:${guideId}:page:${p}`)]) {
    const video = await avaVideoFor(db, key);
    if (video) videos[key] = video;
  }
  return { ...avaForLearners(db), videos };
}

const wordsOf = (row: VideoRow): WordTiming[] | null => {
  try {
    return row.words ? (JSON.parse(row.words) as WordTiming[]) : null;
  } catch {
    return null;
  }
};

/**
  When each word of a video is said. ElevenLabs' forced alignment listens to the file against its script (it needs the
  Forced alignment permission on the key); without it, or if it fails, the words are spread across the video's length by
  their size and the pauses after punctuation, which is close enough to read along with.
*/
async function timeWords(body: Buffer | null, mime: string, text: string, seconds: number | null): Promise<{ words: WordTiming[] | null; timing: string }> {
  const { apiKey } = ttsConfig();
  if (apiKey && body && text) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(body)], { type: mime }), mime.includes("webm") ? "video.webm" : "video.mp4");
      form.append("text", text);
      const res = await fetch("https://api.elevenlabs.io/v1/forced-alignment", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const d = (await res.json()) as { characters?: { text: string; start: number; end: number }[] };
        const chars = d.characters ?? [];
        const words = wordsFromAlignment(text, {
          characters: chars.map((c) => c.text),
          character_start_times_seconds: chars.map((c) => c.start),
          character_end_times_seconds: chars.map((c) => c.end),
        });
        if (words) return { words, timing: "aligned" };
      }
    } catch {
      // Unreachable or refused: estimated below.
    }
  }
  return { words: seconds ? estimateWords(text, seconds) : null, timing: "estimated" };
}

type LessonJson = {
  title?: string;
  nodes?: Record<string, { id: string; type: string; heading?: string; visual?: { kind?: string; synthetic?: boolean; video?: { src?: string } } }>;
};

/** Every line Ava speaks to learners, with its video's state, for the admin list. */
export async function avaLines(db: Db, actor: User) {
  requireAuthor(actor);
  const lines: { key: string; kind: "path" | "course" | "page" | "topic"; title: string }[] = [];
  const paths = db.prepare("SELECT id, name FROM learning_paths WHERE archived = 0 AND trim(coalesce(description, '')) != '' ORDER BY name").all() as {
    id: string;
    name: string;
  }[];
  for (const p of paths) lines.push({ key: `path:${p.id}`, kind: "path", title: p.name });
  const courses = db.prepare("SELECT g.id, g.title, r.doc FROM magazine_guides g JOIN magazine_revisions r ON r.id = g.revision_id ORDER BY g.title").all() as {
    id: string;
    title: string;
    doc: string;
  }[];
  for (const g of courses) {
    lines.push({ key: `magazine:${g.id}:intro`, kind: "course", title: g.title });
    // Each page's introduction too: with a video, it plays at the top of the page before the page's picture.
    let pages: { id: string; title?: string }[] = [];
    try {
      pages = (JSON.parse(g.doc) as { pages?: { id: string; title?: string }[] }).pages ?? [];
    } catch {}
    pages.forEach((p, i) => lines.push({ key: `magazine:${g.id}:page:${p.id}`, kind: "page", title: `${g.title}: page ${i + 1}, ${p.title || p.id}` }));
  }
  const topics = db.prepare("SELECT slug, published FROM authored_lessons WHERE published IS NOT NULL ORDER BY slug").all() as {
    slug: string;
    published: string;
  }[];
  for (const l of topics) {
    let lesson: LessonJson = {};
    try {
      lesson = JSON.parse(l.published) as LessonJson;
    } catch {
      continue;
    }
    for (const n of Object.values(lesson.nodes ?? {})) {
      const v = n.visual;
      // Ava's presenter cards that don't already have a recorded video of their own.
      if (n.type === "presenter" && v?.kind === "presenter" && v.synthetic && !v.video?.src)
        lines.push({ key: `lesson:${l.slug}:${n.id}`, kind: "topic", title: `${lesson.title ?? l.slug}: ${n.heading ?? n.id}` });
    }
  }
  // Only lines with a script learners can hear (a course without an approved introduction has none).
  const out = [];
  for (const line of lines) {
    let script: string;
    try {
      script = scriptFor(db, line.key);
    } catch {
      continue;
    }
    const row = videoRow(db, line.key);
    // The whole script: it's what a video made elsewhere has to say, word for word.
    out.push({ ...line, script, transcript: row?.transcript ?? null, uploaded: row?.voice === UPLOADED, ...(await stateOf(db, line.key, row)) });
  }
  return { portrait: avaForLearners(db).portrait, configured: Boolean(process.env.ELEVENLABS_API_KEY), lines: out };
}

/** Starts the talking video for one of Ava's lines. */
export async function makeAvaVideo(db: Db, actor: User, key: string, now: Date) {
  requireAuthor(actor);
  if (!avaSpeaks(db, key)) throw new HttpError(400, "That isn’t one of Ava’s lines.");
  const portrait = avaForLearners(db).portrait;
  const script = scriptFor(db, key);
  if (script.length > 2000) throw new HttpError(400, "That script is too long for one video (about two minutes at most).");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = (videos(db).prepare("SELECT COUNT(*) AS n FROM ava_videos WHERE created_by = ? AND created_at > ?").get(actor.id, since) as { n: number }).n;
  if (recent >= VIDEOS_PER_HOUR) throw new HttpError(429, "That’s a lot of videos in an hour. Take a short break, then try again.");
  const voice = await voiceFor(db);
  // The voice first (cached, so making the video again with the same words doesn't pay for it twice).
  const spoken = await narration(script, voice);
  const face = portraitBytes(db, portrait);
  const d = await flowsCall(
    VIDEO_API,
    {
      method: "POST",
      body: JSON.stringify({
        model_id: AVATAR_MODEL,
        image: { type: "inline_base64", content_base64: face.body.toString("base64"), mime_type: face.mime },
        audio: { type: "inline_base64", content_base64: spoken.audio.toString("base64"), mime_type: "audio/mpeg" },
        resolution: "720p",
      }),
    },
    60_000,
  );
  const id = String(d.id ?? "");
  if (!/^[\w-]{4,100}$/.test(id)) throw new HttpError(502, "ElevenLabs didn’t start the video. Try again.");
  const seconds = spoken.words?.length ? Math.ceil(spoken.words[spoken.words.length - 1].end) : null;
  db.prepare(
    `INSERT INTO ava_videos (key, script_hash, voice, portrait, generation_id, status, video_src, seconds, error, created_by, created_at, finished_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, ?, ?, NULL)
     ON CONFLICT (key) DO UPDATE SET script_hash = excluded.script_hash, voice = excluded.voice, portrait = excluded.portrait,
       generation_id = excluded.generation_id, status = 'pending', video_src = NULL, seconds = excluded.seconds, error = NULL,
       created_by = excluded.created_by, created_at = excluded.created_at, finished_at = NULL`,
  ).run(key, scriptHash(script), voice, portrait, id, seconds, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "ava.video_started", entity: key, next: { id }, at: now });
  return { key, state: "pending" as const };
}

/** Where a video is up to; once ElevenLabs has finished it, it's copied into the Hub (once). */
export async function checkAvaVideo(db: Db, actor: User, key: string, now: Date) {
  requireAuthor(actor);
  const row = videoRow(db, key);
  if (!row) throw new HttpError(404, "No video has been started for that line.");
  if (row.status !== "pending" || !row.generation_id) return { key, ...(await stateOf(db, key, row)) };
  const d = await flowsCall(`${VIDEO_API}/${encodeURIComponent(row.generation_id)}`);
  const status = String(d.status ?? "");
  if (status === "failed") {
    const reason = String(d.failure_reason ?? "");
    const error =
      reason === "moderated"
        ? "ElevenLabs wouldn’t make that video because of its content rules. Try another portrait or script."
        : reason === "timeout"
          ? "The video took too long. Try again."
          : `The video couldn’t be made${d.error_message ? `: ${String(d.error_message)}` : ""}.`;
    db.prepare("UPDATE ava_videos SET status = 'failed', error = ?, finished_at = ? WHERE key = ?").run(error, now.toISOString(), key);
    return { key, state: "failed" as const, error };
  }
  if (status !== "completed") return { key, state: "pending" as const };
  const url = new URL(String(d.content_url ?? ""));
  if (url.protocol !== "https:") throw new HttpError(502, "ElevenLabs sent an unexpected video address.");
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) throw new HttpError(502, "Couldn’t download the video from ElevenLabs. Try again in a moment.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const meta = await sharp(portraitBytes(db, row.portrait).body)
    .metadata()
    .catch(() => ({ width: 1280, height: 720 }));
  const saved = await saveUpload(
    db,
    actor,
    new File([bytes], `Ava – ${key.replace(/[^\w:-]/g, "").slice(0, 60)}.mp4`, { type: "video/mp4" }),
    { width: meta.width ?? 1280, height: meta.height ?? 720 },
    now,
  );
  db.prepare("UPDATE ava_videos SET status = 'completed', video_src = ?, finished_at = ? WHERE key = ?").run(saved.src, now.toISOString(), key);
  audit(db, { actor: actor.id, event: "ava.video_ready", entity: key, next: { src: saved.src }, at: now });
  return { key, ...(await stateOf(db, key)) };
}

/**
  Uses a video made elsewhere (in ElevenLabs with the Laura avatar, for one) as the line's video. It's uploaded to the
  image library first; here it's tied to the line's script as it is now, so it falls out of use if the words change.
*/
export async function attachAvaVideo(db: Db, actor: User, key: string, src: unknown, now: Date, said?: unknown, length?: unknown) {
  requireAuthor(actor);
  if (!avaSpeaks(db, key, true)) throw new HttpError(400, NOT_A_LINE);
  const file = typeof src === "string" ? /^\/api\/uploads\/([0-9a-f-]{36}\.(mp4|webm|mov))$/.exec(src)?.[1] : undefined;
  const upload = file ? readUpload(db, file) : null;
  if (!upload || !upload.mime.startsWith("video/")) throw new HttpError(400, "Upload the video (MP4, WebM or MOV) first.");
  // The line's Audio Guide script, including an author's saved draft (a video can go in while the course is being written).
  let script = "";
  try {
    script = scriptFor(db, key, true);
  } catch {
    // No Audio Guide script for it: the video's own words have to say what it says.
  }
  // What the video itself says, when it isn't the line's script word for word (an interrupted transmission): learners read this.
  const transcript = typeof said === "string" ? said.trim().slice(0, 3000) : "";
  if (!script && !transcript) throw new HttpError(400, "Paste what the video says: there’s no Audio guide script for this yet.");
  // How long it plays (measured in the browser), for timing the words when ElevenLabs can't align them.
  const seconds = typeof length === "number" && length > 0 && length < 3600 ? Math.round(length * 10) / 10 : null;
  const timed = await timeWords(upload.body, upload.mime, transcript || script, seconds);
  videos(db)
    .prepare(
      `INSERT INTO ava_videos (key, script_hash, voice, portrait, generation_id, status, video_src, seconds, error, created_by, created_at, finished_at, transcript, words, timing)
       VALUES (?, ?, ?, '', NULL, 'completed', ?, ?, NULL, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET script_hash = excluded.script_hash, voice = excluded.voice, portrait = '', generation_id = NULL,
         status = 'completed', video_src = excluded.video_src, seconds = excluded.seconds, error = NULL, created_by = excluded.created_by,
         created_at = excluded.created_at, finished_at = excluded.finished_at, transcript = excluded.transcript, words = excluded.words, timing = excluded.timing`,
    )
    .run(
      key,
      scriptHash(script),
      UPLOADED,
      src as string,
      seconds,
      actor.id,
      now.toISOString(),
      now.toISOString(),
      transcript || null,
      timed.words ? JSON.stringify(timed.words) : null,
      timed.timing,
    );
  audit(db, { actor: actor.id, event: "ava.video_uploaded", entity: key, next: { src, ownWords: Boolean(transcript), timing: timed.timing }, at: now });
  return { key, uploaded: true, timing: timed.timing, ...(await stateOf(db, key, undefined, true)) };
}

/**
  Changes what an uploaded video says (its script, as learners read it) without uploading it again, and times the words
  afresh: aligned by ElevenLabs when the key allows it, otherwise spread across the video's length.
*/
export async function saveAvaWords(db: Db, actor: User, key: string, said: unknown, now: Date) {
  requireAuthor(actor);
  const row = videoRow(db, key);
  if (!row || row.voice !== UPLOADED || !row.video_src) throw new HttpError(404, "Upload the video first.");
  let script = "";
  try {
    script = scriptFor(db, key, true);
  } catch {
    // No Audio Guide script: the words below have to say it all.
  }
  const transcript = typeof said === "string" ? said.trim().slice(0, 3000) : "";
  if (!script && !transcript) throw new HttpError(400, "Write what the video says: there’s no Audio guide script for this yet.");
  // Words timed to her voice (heard from the video, or aligned) keep their times through a light edit, such as a spelling
  // fixed after filling the script in from the video; anything bigger is timed again.
  const kept = row.timing === "aligned" && transcript ? retimeWords(wordsOf(row), transcript) : null;
  const upload = kept ? null : uploadOf(db, row.video_src);
  const timed = kept
    ? { words: kept, timing: "aligned" }
    : await timeWords(upload?.body ?? null, upload?.mime ?? "video/mp4", transcript || script, row.seconds);
  videos(db)
    .prepare("UPDATE ava_videos SET transcript = ?, words = ?, timing = ? WHERE key = ?")
    .run(transcript || null, timed.words ? JSON.stringify(timed.words) : null, timed.timing, key);
  audit(db, { actor: actor.id, event: "ava.video_words", entity: key, next: { timing: timed.timing }, at: now });
  return avaLineFor(db, actor, key);
}

/** An uploaded video's file in the library, from its address. */
function uploadOf(db: Db, src: string | null) {
  const file = src ? /^\/api\/uploads\/([0-9a-f-]{36}\.(mp4|webm|mov))$/.exec(src)?.[1] : undefined;
  return file ? readUpload(db, file) : null;
}

const SPEECH_API = "https://api.elevenlabs.io/v1/speech-to-text";
/** Fills in per author per hour: each one is a paid listen. */
const HEARD_PER_HOUR = 20;
const heardAt = new Map<string, number[]>();

/**
  Fills in an uploaded video's script from the video itself: ElevenLabs' speech-to-text (Scribe) listens to it and writes
  out what Ava says, with when each word is said, so her words on screen follow her voice exactly. A paid call (a small
  one: priced by the minute of audio), made only when an author presses Fill in from the video. It needs the Speech to
  Text permission on the Hub's ElevenLabs key. The words are saved as the video's script; the author can then correct
  them (a light edit keeps the timings).
*/
export async function hearAvaVideo(db: Db, actor: User, key: string, now: Date) {
  requireAuthor(actor);
  const row = videoRow(db, key);
  if (!row || row.voice !== UPLOADED || !row.video_src) throw new HttpError(404, "Upload the video first.");
  const upload = uploadOf(db, row.video_src);
  if (!upload) throw new HttpError(404, "The video file isn’t in the library any more. Upload it again.");
  const { apiKey } = ttsConfig();
  if (!apiKey) throw new HttpError(503, "The Hub has no ElevenLabs key, so it can’t listen to the video. Type the script instead.");
  const recent = (heardAt.get(actor.id) ?? []).filter((t) => t > now.getTime() - 3600_000);
  if (recent.length >= HEARD_PER_HOUR) throw new HttpError(429, "That’s a lot of videos listened to in an hour. Try again a little later.");
  heardAt.set(actor.id, [...recent, now.getTime()]);

  const listen = async (model: string) => {
    const form = new FormData();
    form.append("model_id", model);
    form.append("file", new Blob([new Uint8Array(upload.body)], { type: upload.mime }), upload.mime.includes("webm") ? "video.webm" : "video.mp4");
    form.append("language_code", "en");
    form.append("timestamps_granularity", "word");
    form.append("tag_audio_events", "false");
    return fetch(SPEECH_API, { method: "POST", headers: { "xi-api-key": apiKey }, body: form, signal: AbortSignal.timeout(180_000) });
  };
  let res: Response;
  try {
    res = await listen("scribe_v2");
    // An account without the newer model: the first one.
    if (res.status === 400 || res.status === 422) {
      const said = await res.text();
      res = /model/i.test(said) ? await listen("scribe_v1") : new Response(said, { status: res.status });
    }
  } catch {
    throw new HttpError(504, "ElevenLabs didn’t answer in time. Try again in a moment.");
  }
  if (!res.ok) {
    const said = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      throw new HttpError(
        403,
        /permission/i.test(said)
          ? "The Hub’s ElevenLabs key doesn’t have the Speech to Text permission. Turn it on for the key in ElevenLabs, then try again."
          : "ElevenLabs didn’t accept the Hub’s key for listening to the video.",
      );
    if (res.status === 429) throw new HttpError(429, "ElevenLabs is busy or the account is out of credit. Try again later.");
    throw new HttpError(502, "ElevenLabs couldn’t listen to that video. Try again, or type the script instead.");
  }
  const heard = wordsFromSpeech(((await res.json()) as { words?: HeardToken[] }).words);
  if (!heard) throw new HttpError(422, "ElevenLabs didn’t hear any words in that video.");
  const transcript = heard.text.slice(0, 3000);
  const words = heard.words.filter((w) => w.to <= transcript.length);
  videos(db).prepare("UPDATE ava_videos SET transcript = ?, words = ?, timing = 'aligned' WHERE key = ?").run(transcript, JSON.stringify(words), key);
  audit(db, { actor: actor.id, event: "ava.video_heard", entity: key, next: { words: words.length }, at: now });
  return avaLineFor(db, actor, key);
}

/** Stops using a line's video: learners get Ava's portrait with her voice again. The file stays in the library. */
export async function removeAvaVideo(db: Db, actor: User, key: string, now: Date) {
  requireAuthor(actor);
  const row = videoRow(db, key);
  if (!row) return { key, state: "none" as const, uploaded: false };
  videos(db).prepare("DELETE FROM ava_videos WHERE key = ?").run(key);
  audit(db, { actor: actor.id, event: "ava.video_removed", entity: key, previous: { src: row.video_src }, at: now });
  return { key, state: "none" as const, uploaded: false };
}

/** One line's video as an author sees it (the Magazine editor's Audio guide strip): where it is, the file, and its own words. */
export async function avaLineFor(db: Db, actor: User, key: string) {
  requireAuthor(actor);
  if (!avaSpeaks(db, key, true)) throw new HttpError(400, NOT_A_LINE);
  const row = videoRow(db, key);
  return {
    key,
    src: row?.video_src ?? null,
    transcript: row?.transcript ?? null,
    uploaded: row?.voice === UPLOADED,
    /** "aligned", "estimated", or null when there are no timings. */
    timing: row?.words ? row.timing : null,
    ...(await stateOf(db, key, row, true)),
  };
}

/** A line the editor offers before it's saved (a new presenter card, say). */
const NOT_A_LINE = "That isn’t one of Ava’s lines yet. Save your changes, then add her video.";
