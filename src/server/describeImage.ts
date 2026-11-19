import "server-only";
import fs from "node:fs";
import path from "node:path";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { readUpload } from "./uploads";
import { openaiConfigured } from "./imageGen";
import { isSiteMedia, readGuideDoc, GuideDocError, type Block, type GuideDoc, type Media } from "@/lib/magazine";

/*
  Describe with AI: a short description of a picture for people using screen readers (its alt text),
  written by OpenAI's vision model with the hub's own key. It suggests; the author reads it, edits it,
  or marks the picture decorative instead. Pictures are read from the hub itself, never fetched from
  elsewhere, and only the picture and a little context about where it sits are sent.
*/

const PER_HOUR = 150;
const MAX_BYTES = 20 * 1024 * 1024;
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const visionModel = () => process.env.OPENAI_VISION_MODEL || "gpt-5.4-mini";

/** The picture's bytes and type, from the hub's uploads or its own public images. */
function pictureBytes(db: Db, src: string): { data: Buffer; mime: string } {
  if (!isSiteMedia(src)) throw new HttpError(400, "Only pictures on the Hub can be described.");
  if (src.startsWith("/api/uploads/")) {
    const file = readUpload(db, src.slice("/api/uploads/".length));
    if (!file) throw new HttpError(404, "That picture isn’t on the Hub any more.");
    if (!file.mime.startsWith("image/")) throw new HttpError(400, "That isn’t a picture.");
    return { data: file.body, mime: file.mime };
  }
  const mime = MIME[path.extname(src).toLowerCase()];
  if (!mime) throw new HttpError(400, "AI can describe photos (JPEG, PNG, WebP or GIF), not drawings saved as SVG. Describe this one yourself.");
  const file = path.join(process.cwd(), "public", ...src.split("/").filter(Boolean));
  if (!file.startsWith(path.join(process.cwd(), "public"))) throw new HttpError(400, "That picture isn’t on the Hub.");
  try {
    return { data: fs.readFileSync(file), mime };
  } catch {
    throw new HttpError(404, "That picture isn’t on the Hub any more.");
  }
}

export const describePrompt = (
  context: string,
) => `Write the alt text for this picture, for people using screen readers, in a training course for Trilogy Care, an Australian aged care provider.
${context ? `Where it appears: ${context}\n` : ""}
Rules:
- One sentence, under 150 characters. Australian English.
- Say what matters for the learning: who is doing what, and the setting. Skip decoration.
- Don't start with "Image of", "Picture of" or "Photo of".
- Never name or guess the identity of a real person, or their age, ethnicity or health, beyond what is plainly shown (an older woman, a support worker).
- If it's a document, form or screen, say what it is and its main heading, rather than reading it out.
Reply with the alt text only.`;

/** OpenAI describes one picture. Returns the description, tidied. */
export async function describeImage(db: Db, actor: User, input: { src?: unknown; context?: unknown }, now: Date): Promise<{ alt: string }> {
  requireAuthor(actor);
  if (!openaiConfigured()) throw new HttpError(503, "Describe with AI uses OpenAI. Add OPENAI_API_KEY to .env.local and restart the server.");
  const src = typeof input.src === "string" ? input.src : "";
  const context = typeof input.context === "string" ? input.context.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const since = new Date(now.getTime() - 3600_000).toISOString();
  const recent = db.prepare("SELECT COUNT(*) AS n FROM audit WHERE actor = ? AND event = 'image.described' AND at > ?").get(actor.id, since) as { n: number };
  if (recent.n >= PER_HOUR) throw new HttpError(429, "That’s a lot of pictures in an hour. Take a short break, then try again.");
  const { data, mime } = pictureBytes(db, src);
  if (data.length > MAX_BYTES) throw new HttpError(413, "That picture is too big to describe. Try a smaller copy.");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: visionModel(),
        max_completion_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: describePrompt(context) },
              { type: "image_url", image_url: { url: `data:${mime};base64,${data.toString("base64")}`, detail: "low" } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch {
    throw new HttpError(502, "Couldn’t reach OpenAI, or it took too long. Try again.");
  }
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string; type?: string } };
    if (res.status === 401) throw new HttpError(502, "OpenAI didn’t accept the API key. Check OPENAI_API_KEY in .env.local, then restart the server.");
    if (d.error?.type === "insufficient_quota" || d.error?.code === "credit_balance_exhausted")
      throw new HttpError(402, "The OpenAI account has no credit left. Add credit at platform.openai.com under Billing, then try again.");
    if (res.status === 429) throw new HttpError(429, "OpenAI’s rate limit was reached. Wait a moment and try again.");
    throw new HttpError(502, `OpenAI couldn’t describe the picture${d.error?.message ? `: ${d.error.message}` : "."}`);
  }
  const out = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const alt = tidyAlt(out.choices?.[0]?.message?.content ?? "");
  if (!alt) throw new HttpError(502, "OpenAI didn’t send a description back. Try again.");
  audit(db, { actor: actor.id, event: "image.described", entity: `image:${src}`, next: { model: visionModel(), alt }, at: now });
  return { alt };
}

/** One line, no quotes or "Image of", within the 400 characters a description may have. */
export function tidyAlt(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .replace(/^(an?\s+)?(image|picture|photo|photograph)\s+(of|showing)\s+/i, "")
    .replace(/^./, (c) => c.toUpperCase())
    .slice(0, 400)
    .trim();
}

/** A picture in the course that needs a description: which block (and which card, slide or fold in it), and where it sits. */
export type MissingPicture = { blockId: string; itemId?: string; src: string; context: string };

const words = (s?: string) =>
  (s ?? "")
    .replace(/\*\*|[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const needs = (m: Media | undefined): m is Media => Boolean(m?.src && !m.alt && !m.decorative);

/** Every picture in the course with no description that isn't marked decorative, with a line of context for each. */
export function missingPictures(doc: GuideDoc): MissingPicture[] {
  const out: MissingPicture[] = [];
  for (const page of doc.pages)
    for (const section of page.sections)
      for (const b of section.blocks) {
        const where = [page.title, section.title].filter(Boolean).join(" › ");
        const add = (m: Media | undefined, about: string, itemId?: string) => {
          if (needs(m)) out.push({ blockId: b.id, ...(itemId && { itemId }), src: m.src, context: `${where}. ${words(about)}`.slice(0, 400) });
        };
        const blk = b as Block;
        if (blk.type === "image") add(blk.media, blk.media.caption ?? "");
        if (blk.type === "textMedia" && !blk.video) add(blk.media, `${blk.heading ?? ""} ${blk.body}`);
        if (blk.type === "decision") add(blk.media, blk.prompt);
        if (blk.type === "spot" || blk.type === "hotspots") add(blk.media, "");
        if (blk.type === "flashcards") blk.cards.forEach((c) => add(c.media, c.front, c.id));
        if (blk.type === "carousel") blk.slides.forEach((sl) => add(sl.media, "", sl.id));
        if (blk.type === "accordion") blk.items.forEach((it) => add(it.media, `${it.title} ${it.body}`, it.id));
      }
  return out;
}

/**
  Describes every picture in the course that has no description, a few at a time. Nothing is saved
  here: the descriptions go back to the editor, which adds them as one change the author can undo.
*/
export async function describeMissing(db: Db, actor: User, input: { doc?: unknown }, now: Date) {
  requireAuthor(actor);
  let doc: GuideDoc;
  try {
    doc = readGuideDoc(input.doc, { draft: true });
  } catch (e) {
    if (e instanceof GuideDocError) throw new HttpError(400, `The course has problems to fix first: ${e.problems.slice(0, 3).join(" ")}`);
    throw e;
  }
  const todo = missingPictures(doc).slice(0, 40);
  const described: (MissingPicture & { alt: string })[] = [];
  const failed: { blockId: string; itemId?: string; error: string }[] = [];
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(
      todo.slice(i, i + 4).map(async (p) => {
        try {
          const { alt } = await describeImage(db, actor, { src: p.src, context: p.context }, now);
          described.push({ ...p, alt });
        } catch (e) {
          failed.push({ blockId: p.blockId, ...(p.itemId && { itemId: p.itemId }), error: e instanceof HttpError ? e.message : "Couldn’t describe it." });
        }
      }),
    );
    // Stop early on a problem every picture would hit (no key, no credit).
    if (failed.length && !described.length && /OPENAI_API_KEY|credit|accept the API key/.test(failed[0].error)) throw new HttpError(502, failed[0].error);
  }
  return { described: described.map(({ blockId, itemId, alt }) => ({ blockId, ...(itemId && { itemId }), alt })), failed, total: todo.length };
}
