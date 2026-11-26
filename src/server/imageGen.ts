import "server-only";
import type { Db } from "./db";
import { audit } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readUpload, saveUpload } from "./uploads";
import fs from "node:fs";
import path from "node:path";
import { jpegSize } from "./pexels";
import { DEFAULT_IMAGE_MODEL, HOUSE_STYLE, imageModel, IMAGE_MODELS, OPENAI_DIRECT } from "@/lib/imageModels";
import { randomUUID } from "node:crypto";

/*
  AI pictures for lesson posters, made through ElevenLabs' Image & Video API (the same account as
  the narration voice). A generation is started, then checked every few seconds until it's done;
  the finished picture is copied into the hub's uploads, so it's kept after ElevenLabs' link expires.
  Needs an ElevenLabs Pro plan (or above) and an API key with the Image & Video permission.
*/

const API = "https://api.elevenlabs.io/v1/flows/image";
export const MAX_PROMPT = 2000;
const PER_HOUR = 30;

export const imageGenConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY);
/** OpenAI's image model with the hub's own key, no ElevenLabs needed. OPENAI_IMAGE_MODEL picks the model (default gpt-image-2). */
export const openaiConfigured = () => Boolean(process.env.OPENAI_API_KEY);
const OPENAI_SIZES: Record<string, string> = { "3:2": "1536x1024", "1:1": "1024x1024", "2:3": "1024x1536" };

type GenRow = {
  id: string;
  lesson_slug: string | null;
  model: string;
  prompt: string;
  status: string;
  created_by: string;
  created_at: string;
  upload_src: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
};

/** ElevenLabs' refusals, in words an author can act on. */
async function refusal(res: Response) {
  const raw = await res.text().catch(() => "");
  let code = "";
  let message = "";
  try {
    const d = JSON.parse(raw) as { detail?: { status?: string; code?: string; message?: string } | { msg?: string }[] };
    if (Array.isArray(d.detail))
      message = d.detail
        .map((x) => x.msg)
        .filter(Boolean)
        .join("; ");
    else if (d.detail) {
      code = d.detail.code ?? d.detail.status ?? "";
      message = d.detail.message ?? "";
    }
  } catch {
    /* not JSON */
  }
  if (code === "quota_exceeded") return new HttpError(402, "Your ElevenLabs account is out of credits. Add credits in ElevenLabs, then try again.");
  if (code === "paid_plan_required" || res.status === 402)
    return new HttpError(402, "Image generation needs an ElevenLabs Pro plan or above. Upgrade the plan in ElevenLabs, then try again.");
  if (code === "model_access_denied") return new HttpError(403, "Your ElevenLabs account doesn’t have access to that model. Choose another one.");
  if (res.status === 401 || res.status === 403)
    return new HttpError(502, "ElevenLabs didn’t accept the API key for images and video. Check the key has the Image & Video permission.");
  if (res.status === 422) return new HttpError(400, `ElevenLabs couldn’t use those settings${message ? `: ${message}` : ""}. Try other settings.`);
  if (res.status === 429) return new HttpError(429, "ElevenLabs is busy. Wait a minute and try again.");
  return new HttpError(502, `ElevenLabs couldn’t do that${message ? `: ${message}` : ""}. Try again.`);
}

/** A call to ElevenLabs' Image & Video API (also used for avatar videos), with refusals explained. */
export async function flowsCall(url: string, init?: RequestInit, timeoutMs = 20_000) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new HttpError(503, "ElevenLabs isn’t connected. Add ELEVENLABS_API_KEY to .env.local and restart the server.");
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "xi-api-key": key, "content-type": "application/json", accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, "Couldn’t reach ElevenLabs. Check the connection and try again.");
  }
  if (!res.ok) throw await refusal(res);
  return res.json() as Promise<Record<string, unknown>>;
}

/** The settings ElevenLabs takes for this model, from what the author picked. */
export function requestFor(input: { model?: unknown; prompt?: unknown; aspect?: unknown; resolution?: unknown; quality?: unknown; houseStyle?: unknown }) {
  const m = imageModel(String(input.model ?? ""));
  if (!m) throw new HttpError(400, "Choose an image model.");
  const prompt = String(input.prompt ?? "").trim();
  if (prompt.length < 3) throw new HttpError(400, "Describe the picture you want first.");
  if (prompt.length > MAX_PROMPT) throw new HttpError(400, `Keep the prompt to ${MAX_PROMPT} characters.`);
  const aspect = String(input.aspect ?? "");
  if (!m.aspects.includes(aspect)) throw new HttpError(400, `${m.label} can’t make that shape. Choose another.`);
  const body: Record<string, string> = {
    model_id: m.id,
    prompt: input.houseStyle ? `${prompt}\n\n${HOUSE_STYLE}` : prompt,
    aspect_ratio: aspect,
  };
  if (m.resolutions) {
    const r = String(input.resolution ?? m.resolutions[0]);
    if (!m.resolutions.includes(r)) throw new HttpError(400, "Choose a size.");
    body.resolution = r;
  }
  if (m.qualities) {
    const q = String(input.quality ?? m.defaultQuality ?? m.qualities[0]);
    if (!m.qualities.includes(q)) throw new HttpError(400, "Choose a quality.");
    body.quality = q;
  }
  return { model: m, prompt, body };
}

export function imageGenOptions(actor: User) {
  requireAuthor(actor);
  const openai = openaiConfigured();
  const eleven = imageGenConfigured();
  return {
    configured: openai || eleven,
    models: [...(openai ? [OPENAI_DIRECT] : []), ...(eleven ? IMAGE_MODELS : [])],
    defaultModel: openai ? OPENAI_DIRECT.id : DEFAULT_IMAGE_MODEL,
  };
}

/** OpenAI's refusals, in words an author can act on. */
async function openaiRefusal(res: Response) {
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string } };
  const message = d.error?.message ?? "";
  if (res.status === 401) return new HttpError(502, "OpenAI didn’t accept the API key. Check OPENAI_API_KEY in .env.local, then restart the server.");
  if (d.error?.type === "insufficient_quota" || ["insufficient_quota", "billing_hard_limit_reached", "credit_balance_exhausted"].includes(d.error?.code ?? ""))
    return new HttpError(
      402,
      "The OpenAI account has no credit for pictures. Add credit (or raise the spending limit) at platform.openai.com under Billing, then try again.",
    );
  if (res.status === 429) return new HttpError(429, "OpenAI’s rate limit for this key has been reached. Wait a minute and try again.");
  if (res.status === 403 && /verif/i.test(message))
    return new HttpError(
      403,
      "OpenAI needs the organisation verified before it will use this image model. Verify it at platform.openai.com under Settings, then try again.",
    );
  if (d.error?.code === "moderation_blocked" || /safety|policy/i.test(message))
    return new HttpError(400, "OpenAI wouldn’t make that picture because of its content rules. Try rewording the description.");
  return new HttpError(502, `OpenAI couldn’t make the picture${message ? `: ${message}` : "."}`);
}

/** Makes the picture with OpenAI in one go, keeps it in the image library, and returns it ready to use. */
async function generateWithOpenAI(
  db: Db,
  actor: User,
  input: {
    prompt: string;
    aspect: string;
    quality: string;
    lesson: string | null;
    about?: { title?: string; alt?: string };
    references?: { bytes: Uint8Array; mime: string; name: string }[];
  },
  now: Date,
) {
  let res: Response;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
  const sizeAsked = OPENAI_SIZES[input.aspect] ?? "1536x1024";
  try {
    if (input.references?.length) {
      // Reference pictures: the same people, drawn in a new scene (OpenAI's image edits take several input images).
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", `${input.prompt}\n\n${REFERENCE_NOTE}`);
      form.append("size", sizeAsked);
      form.append("quality", input.quality);
      form.append("n", "1");
      for (const r of input.references) form.append("image[]", new Blob([r.bytes as BlobPart], { type: r.mime }), r.name);
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(180_000),
        cache: "no-store",
      });
    } else
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model, prompt: input.prompt, size: sizeAsked, quality: input.quality, n: 1 }),
        signal: AbortSignal.timeout(180_000),
        cache: "no-store",
      });
  } catch {
    throw new HttpError(502, "Couldn’t reach OpenAI, or it took too long. Check the connection and try again.");
  }
  if (!res.ok) throw await openaiRefusal(res);
  const d = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = d.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(502, "OpenAI didn’t send a picture back. Try again.");
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const size = imageSize(bytes);
  if (!size) throw new HttpError(502, "OpenAI sent a picture the hub can’t read.");
  const mime = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp";
  const label = input.prompt
    .replace(/[^\w .,()-]/g, "")
    .slice(0, 60)
    .trim();
  const saved = await saveUpload(db, actor, new File([bytes], `AI OpenAI – ${label}.${EXT[mime]}`, { type: mime }), size, now, undefined, input.about);
  const id = `oa-${randomUUID()}`;
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO image_generations (id, lesson_slug, model, prompt, settings, status, created_by, created_at, upload_src, width, height, finished_at)
     VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.lesson,
    OPENAI_DIRECT.id,
    input.prompt,
    JSON.stringify({ aspect: input.aspect, quality: input.quality, ...(input.references?.length && { references: input.references.map((r) => r.name) }) }),
    actor.id,
    at,
    saved.src,
    size.width,
    size.height,
    at,
  );
  audit(db, {
    actor: actor.id,
    event: "image_generation.completed",
    entity: `image_generation:${id}`,
    next: { model: "openai", lesson: input.lesson },
    at: now,
  });
  return { id, status: "completed" as const, photo: { src: saved.src, width: size.width, height: size.height }, prompt: input.prompt };
}

/** What a reference picture is for, said to the model alongside the description. */
const REFERENCE_NOTE =
  "The attached pictures are reference photos of the people in this scene. Keep each person looking exactly the same: the same face, age, skin tone, hair, build and style of clothing. Draw a new photo of the scene described, not a copy of the reference.";

/** Up to four reference pictures from the image library (an upload or a built-in picture), read from disk. */
export function referenceFiles(db: Db, value: unknown) {
  const list = (Array.isArray(value) ? value : []).filter((v): v is string => typeof v === "string").slice(0, 4);
  return list.flatMap((src) => {
    const upload = /^\/api\/uploads\/([\w.-]+\.(?:webp|png|jpe?g))$/i.exec(src);
    if (upload) {
      const f = readUpload(db, upload[1]);
      return f ? [{ bytes: new Uint8Array(f.body), mime: f.mime, name: upload[1] }] : [];
    }
    const builtIn = /^\/images\/([\w.-]+\.(webp|png|jpe?g))$/i.exec(src);
    if (builtIn) {
      try {
        const bytes = new Uint8Array(fs.readFileSync(path.join(process.cwd(), "public", "images", builtIn[1])));
        const ext = builtIn[2].toLowerCase();
        return [{ bytes, mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", name: builtIn[1] }];
      } catch {
        return [];
      }
    }
    return [];
  });
}

/** Starts a picture. Returns its id, to check on with checkGeneration. */
/** `about`: a title and description for the library when the caller knows what it asked for (a character portrait, say). */
export async function startGeneration(
  db: Db,
  actor: User,
  input: Parameters<typeof requestFor>[0] & { lesson?: unknown; about?: { title?: string; alt?: string }; references?: unknown },
  now: Date,
) {
  requireAuthor(actor);
  const { model, prompt, body } = requestFor(input);
  const references = referenceFiles(db, input.references);
  if (references.length && model.id !== OPENAI_DIRECT.id) throw new HttpError(400, "Reference pictures work with GPT Image (your OpenAI key). Choose it as the model.");
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM image_generations WHERE created_by = ? AND created_at > ?").get(actor.id, since) as { n: number };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of pictures in an hour. Take a short break, then try again.");
  if (model.id === OPENAI_DIRECT.id) {
    if (!openaiConfigured()) throw new HttpError(503, "OpenAI isn’t connected. Add OPENAI_API_KEY to .env.local and restart the server.");
    const lessonSlug = typeof input.lesson === "string" && /^[\w-]{1,120}$/.test(input.lesson) ? input.lesson : null;
    return generateWithOpenAI(
      db,
      actor,
      { prompt: body.prompt, aspect: body.aspect_ratio, quality: body.quality ?? "medium", lesson: lessonSlug, about: input.about, references },
      now,
    );
  }
  const d = await flowsCall(API, { method: "POST", body: JSON.stringify(body) });
  const id = String(d.id ?? "");
  if (!/^[\w-]{4,100}$/.test(id)) throw new HttpError(502, "ElevenLabs didn’t start the picture. Try again.");
  const lesson = typeof input.lesson === "string" && /^[\w-]{1,120}$/.test(input.lesson) ? input.lesson : null;
  db.prepare(
    "INSERT INTO image_generations (id, lesson_slug, model, prompt, settings, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
  ).run(id, lesson, model.id, prompt, JSON.stringify(body), actor.id, now.toISOString());
  audit(db, { actor: actor.id, event: "image_generation.started", entity: `image_generation:${id}`, next: { model: model.id, lesson }, at: now });
  return { id, status: "pending" as const };
}

/** Width and height from a PNG, JPEG or WebP. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  if (b.length > 24 && b[0] === 0x89 && ascii(1, 4) === "PNG") return { width: u32(16), height: u32(20) };
  if (b.length > 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const kind = ascii(12, 16);
    if (kind === "VP8X") return { width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (kind === "VP8 ") return { width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
  }
  return jpegSize(b);
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
  Where a picture is up to. Once ElevenLabs has finished it, it's copied into the hub's image
  library (once) and returned ready to use.
*/
export async function checkGeneration(db: Db, actor: User, id: string, now: Date) {
  requireAuthor(actor);
  const row = db.prepare("SELECT * FROM image_generations WHERE id = ?").get(id) as GenRow | undefined;
  if (!row) throw new HttpError(404, "That picture isn’t one made here.");
  const done = (r: GenRow) => ({ id, status: "completed" as const, photo: { src: r.upload_src!, width: r.width!, height: r.height! }, prompt: r.prompt });
  if (row.status === "completed" && row.upload_src) return done(row);
  if (row.status === "failed") return { id, status: "failed" as const, error: row.error ?? "The picture couldn’t be made." };

  const d = await flowsCall(`${API}/${encodeURIComponent(id)}`);
  const status = String(d.status ?? "");
  if (status === "failed") {
    const reason = String(d.failure_reason ?? "");
    const error =
      reason === "moderated"
        ? "ElevenLabs wouldn’t make that picture because of its content rules. Try rewording the prompt."
        : reason === "timeout"
          ? "The picture took too long. Try again, or try a faster model."
          : `The picture couldn’t be made${d.error_message ? `: ${String(d.error_message)}` : ""}. You weren’t charged for it.`;
    db.prepare("UPDATE image_generations SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(error, now.toISOString(), id);
    return { id, status: "failed" as const, error };
  }
  if (status !== "completed") return { id, status: status === "generating" ? ("generating" as const) : ("pending" as const) };

  const url = new URL(String(d.content_url ?? ""));
  if (url.protocol !== "https:") throw new HttpError(502, "ElevenLabs sent an unexpected picture address.");
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  } catch {
    throw new HttpError(502, "Couldn’t download the picture from ElevenLabs. Try again in a moment.");
  }
  if (!res.ok) throw new HttpError(502, "Couldn’t download the picture from ElevenLabs. Try again in a moment.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  const size = imageSize(bytes);
  if (!size) throw new HttpError(502, "ElevenLabs sent a picture the hub can’t read.");
  const mime = String(d.content_mime_type ?? "image/png");
  const label = row.prompt
    .replace(/[^\w .,()-]/g, "")
    .slice(0, 60)
    .trim();
  const saved = await saveUpload(db, actor, new File([bytes], `AI ${row.model} – ${label}.${EXT[mime] ?? "png"}`, { type: mime }), size, now);
  db.prepare("UPDATE image_generations SET status = 'completed', upload_src = ?, width = ?, height = ?, finished_at = ? WHERE id = ?").run(
    saved.src,
    saved.width,
    saved.height,
    now.toISOString(),
    id,
  );
  return done({ ...row, upload_src: saved.src, width: saved.width, height: saved.height });
}
