import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { narration } from "./tts";
import { readUpload, saveUpload } from "./uploads";
import { flowsCall } from "./imageGen";
import type { WordTiming } from "@/lib/wordTimings";

/*
  AI presenter videos, replacing Synthesia: a card's script is read by the hub's ElevenLabs voice,
  and that recording plus a portrait (the presenter's face) go to ElevenLabs' lip-sync avatar model
  (creatify-aurora), which returns a talking-head video. The finished video is copied into the hub's
  uploads with the voice's word timings, so the card can show captions in time with the speech.
  Made once per script: change the words and the card shows the video is out of date.
*/

const API = "https://api.elevenlabs.io/v1/flows/video";
export const AVATAR_MODEL = "creatify-aurora";
/** About two minutes of speech; presenter introductions are 30 to 60 seconds. */
export const MAX_SCRIPT = 2000;
const PER_HOUR = 10;
const PORTRAIT_KEY = "avatar_presenter";

export type Portrait = { src: string; width: number; height: number };
type Row = {
  id: string;
  lesson_slug: string;
  card_id: string;
  script_hash: string;
  script: string;
  portrait: string;
  captions: string | null;
  status: string;
  video_src: string | null;
  error: string | null;
};

/** The same script always gets the same fingerprint; a video is out of date when its fingerprint differs. */
export const scriptHash = (script: string) => createHash("sha1").update(script.trim().replace(/\s+/g, " ")).digest("hex").slice(0, 16);

/** The presenter's face used for new avatar videos, chosen once for all lessons. */
export function avatarSettings(db: Db, actor: User) {
  requireAuthor(actor);
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(PORTRAIT_KEY) as { value: string } | undefined;
  return { portrait: row ? (JSON.parse(row.value) as Portrait) : null, configured: Boolean(process.env.ELEVENLABS_API_KEY) };
}

function checkPortrait(p: unknown): Portrait {
  const x = p as Partial<Portrait> | null;
  const src = String(x?.src ?? "");
  if (!/^\/api\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(src) && !/^\/images\/[\w.-]+\.(jpe?g|png|webp)$/.test(src))
    throw new HttpError(400, "Choose a photo from the image library for the presenter’s face.");
  const width = Math.round(Number(x?.width));
  const height = Math.round(Number(x?.height));
  if (!(width > 0 && height > 0)) throw new HttpError(400, "Couldn’t read the size of that photo.");
  return { src, width, height };
}

export function setAvatarPortrait(db: Db, actor: User, portrait: unknown, now: Date) {
  requireAuthor(actor);
  const p = checkPortrait(portrait);
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(PORTRAIT_KEY, JSON.stringify(p));
  audit(db, { actor: actor.id, event: "avatar.portrait_set", entity: `image:${p.src}`, at: now });
  return avatarSettings(db, actor);
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** The portrait's bytes: an upload, or one of the built-in pictures. */
function portraitBytes(db: Db, src: string) {
  if (src.startsWith("/api/uploads/")) {
    const f = readUpload(db, src.split("/").pop()!);
    if (!f) throw new HttpError(404, "That photo isn’t in the image library any more.");
    return { body: f.body, mime: f.mime };
  }
  const file = path.join(process.cwd(), "public", "images", path.basename(src));
  if (!fs.existsSync(file)) throw new HttpError(404, "That photo isn’t in the image library any more.");
  return { body: fs.readFileSync(file), mime: MIME[path.extname(file).slice(1).toLowerCase()] ?? "image/jpeg" };
}

/** Starts the presenter video for one card's script. Returns its id, to check on with checkAvatar. */
export async function startAvatar(db: Db, actor: User, input: { lesson?: unknown; card?: unknown; script?: unknown; portrait?: unknown }, now: Date) {
  requireAuthor(actor);
  const lesson = String(input.lesson ?? "");
  const card = String(input.card ?? "");
  if (!/^[\w-]{1,120}$/.test(lesson) || !/^[\w-]{1,120}$/.test(card)) throw new HttpError(400, "Which card?");
  const script = String(input.script ?? "").trim();
  if (script.length < 10) throw new HttpError(400, "Write the presenter’s script first.");
  if (script.length > MAX_SCRIPT) throw new HttpError(400, `Keep the script to ${MAX_SCRIPT} characters (about two minutes).`);
  const portrait = checkPortrait(input.portrait);
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM avatar_videos WHERE created_by = ? AND created_at > ?").get(actor.id, since) as { n: number };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of presenter videos in an hour. Take a short break, then try again.");

  // The voice first (cached, so a remake with the same words doesn't pay for it twice).
  const voice = await narration(script);
  const face = portraitBytes(db, portrait.src);
  const d = await flowsCall(
    API,
    {
      method: "POST",
      body: JSON.stringify({
        model_id: AVATAR_MODEL,
        image: { type: "inline_base64", content_base64: face.body.toString("base64"), mime_type: face.mime },
        audio: { type: "inline_base64", content_base64: voice.audio.toString("base64"), mime_type: "audio/mpeg" },
        resolution: "720p",
      }),
    },
    60_000,
  );
  const id = String(d.id ?? "");
  if (!/^[\w-]{4,100}$/.test(id)) throw new HttpError(502, "ElevenLabs didn’t start the video. Try again.");
  db.prepare(
    "INSERT INTO avatar_videos (id, lesson_slug, card_id, script_hash, script, portrait, captions, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
  ).run(id, lesson, card, scriptHash(script), script, JSON.stringify(portrait), voice.words ? JSON.stringify(voice.words) : null, actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "avatar.started", entity: `lesson:${lesson}:${card}`, next: { id }, at: now });
  return { id, status: "pending" as const };
}

/** What a finished presenter video puts on the card. */
function videoFor(r: Row) {
  const portrait = JSON.parse(r.portrait) as Portrait;
  const words = r.captions ? (JSON.parse(r.captions) as WordTiming[]) : null;
  return {
    provider: "elevenlabs" as const,
    id: r.id,
    title: "Presenter introduction",
    orientation: "portrait" as const,
    src: r.video_src!,
    poster: portrait.src,
    scriptHash: r.script_hash,
    ...(words ? { captions: { spoken: r.script, words } } : {}),
    durationSec: words?.length ? Math.ceil(words[words.length - 1].end) : undefined,
  };
}

/** Where a presenter video is up to; once finished it's copied into the hub (once) and returned ready for the card. */
export async function checkAvatar(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const row = db.prepare("SELECT * FROM avatar_videos WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new HttpError(404, "That video isn’t one made here.");
  if (row.status === "completed" && row.video_src) return { id, status: "completed" as const, video: videoFor(row) };
  if (row.status === "failed") return { id, status: "failed" as const, error: row.error ?? "The video couldn’t be made." };

  const d = await flowsCall(`${API}/${encodeURIComponent(id)}`);
  const status = String(d.status ?? "");
  if (status === "failed") {
    const reason = String(d.failure_reason ?? "");
    const error =
      reason === "moderated"
        ? "ElevenLabs wouldn’t make that video because of its content rules. Try another photo or script."
        : reason === "timeout"
          ? "The video took too long. Try again."
          : `The video couldn’t be made${d.error_message ? `: ${String(d.error_message)}` : ""}. You weren’t charged for it.`;
    db.prepare("UPDATE avatar_videos SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(error, now.toISOString(), id);
    return { id, status: "failed" as const, error };
  }
  if (status !== "completed") return { id, status: status === "generating" ? ("generating" as const) : ("pending" as const) };

  const url = new URL(String(d.content_url ?? ""));
  if (url.protocol !== "https:") throw new HttpError(502, "ElevenLabs sent an unexpected video address.");
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(120_000), cache: "no-store" });
  } catch {
    throw new HttpError(502, "Couldn’t download the video from ElevenLabs. Try again in a moment.");
  }
  if (!res.ok) throw new HttpError(502, "Couldn’t download the video from ElevenLabs. Try again in a moment.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const portrait = JSON.parse(row.portrait) as Portrait;
  const saved = await saveUpload(
    db,
    actor,
    new File([bytes], `Presenter – ${row.lesson_slug} – ${row.card_id}.mp4`, { type: "video/mp4" }),
    { width: portrait.width, height: portrait.height },
    now,
  );
  db.prepare("UPDATE avatar_videos SET status = 'completed', video_src = ?, finished_at = ? WHERE id = ?").run(saved.src, now.toISOString(), id);
  return { id, status: "completed" as const, video: videoFor({ ...row, video_src: saved.src }) };
}
