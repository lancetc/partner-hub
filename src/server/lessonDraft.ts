import "server-only";
import { inflateRawSync } from "node:zlib";
import type Anthropic from "@anthropic-ai/sdk";
import type { Lesson } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { client, FORMAT, GENERATION_MODEL, validateLesson } from "./generate";

/*
  Drafts a whole new lesson with Claude from an author's brief and, optionally, a source
  document (PDF, Word or text). The document is the source of truth: Claude is told not to add
  policy, numbers or processes it doesn't contain. The draft opens in the lesson editor for the
  author to rewrite and approve; nothing is published from here.
*/

export const MAX_BRIEF = 4000;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT = 120_000;

export type DraftRequest = { brief: string; audience?: Lesson["track"]; minutes?: number };
type Source = { kind: "pdf"; name: string; data: string } | { kind: "text"; name: string; text: string };

/** Reads an uploaded source document. PDFs go to Claude as they are; Word and text files become text. */
export async function readSource(file: File): Promise<Source> {
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "That file is over 15 MB. Try a shorter document, or paste the key part into the brief.");
  const buf = Buffer.from(await file.arrayBuffer());
  const name = (file.name || "document").slice(0, 120);
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", name, data: buf.toString("base64") };
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const xml = unzipEntry(buf, "word/document.xml");
    if (!xml) throw new HttpError(415, "That looks like a zip file but not a Word document. Upload a .docx, .pdf or .txt file.");
    return { kind: "text", name, text: docxText(xml).slice(0, MAX_TEXT) };
  }
  if (/\.(txt|md|csv)$/i.test(name) || file.type.startsWith("text/")) {
    const text = buf.toString("utf8");
    if (text.includes("\u0000")) throw new HttpError(415, "Couldn’t read that file as text.");
    return { kind: "text", name, text: text.slice(0, MAX_TEXT) };
  }
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))) throw new HttpError(415, "That’s an older Word file (.doc). Save it as .docx or PDF and try again.");
  throw new HttpError(415, "Upload a PDF, Word (.docx) or text file.");
}

/** Finds one file inside a zip (a .docx is a zip) using the central directory. */
function unzipEntry(zip: Buffer, wanted: string): string | null {
  // End of central directory record: the last 22+ bytes, signature 0x06054b50.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const raw = zip.subarray(start, start + size);
      const out = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: 20 * 1024 * 1024 }) : null;
      return out ? out.toString("utf8") : null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** The words in a Word document, one paragraph per line. */
function docxText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const AUDIENCE: Record<string, string> = {
  core: "everyone at Trilogy Care, service partners and care coordinators",
  partner: "service partners: cleaners, gardeners and other providers who visit older clients at home",
  coordinator: "care coordinators who plan and manage clients' Support at Home services",
  briefing: "anyone affected by a policy change, as a short briefing",
};

export function draftPrompt(req: DraftRequest, source?: Source) {
  const minutes = Math.min(8, Math.max(2, Math.round(req.minutes ?? 4)));
  return `You are writing a short mobile lesson for Trilogy Care's Partner Hub, a training site for Australian aged care service partners and care coordinators.

The author's brief:
<brief>
${req.brief.trim()}
</brief>

Audience: ${AUDIENCE[req.audience ?? "partner"] ?? AUDIENCE.partner}.
Length: about ${minutes} minutes, ${Math.max(5, Math.min(12, minutes * 2))} to ${Math.max(7, Math.min(14, minutes * 2 + 3))} cards.
${
  source
    ? `Source material: the attached document "${source.name}". It is the only source of facts. Use only facts, terms, numbers and processes it contains. If something the brief asks for isn't in the document, describe it generally ("check the approved process") rather than inventing it.`
    : "There is no source document. Keep facts general and widely accepted, don't state specific policy, legislation, rates or dates, and point people to the approved process for specifics."
}

How the lesson should work:
- Open with an image card that sets up why this matters in the learner's day.
- Teach through a realistic, fictional workplace scenario (first names only, no identifiable client or health details).
- Include at least one decision card with two or three clearly different options. Poorer choices lead to a consequence card (emphasis "consequence") that shows what happens and offers a way to recover or try again.
- Include a quick quiz to check understanding, with plausible wrong options and feedback that explains why.
- End with a summary card: two to four recap points and one practical action to take on the job.
- Keep on-screen text short (15 to 40 words); put the explaining in "narration".
- Warm, clear Australian English. Speak to the learner as "you". No exclamation marks or celebratory language.

${FORMAT}

For this lesson "title" is the lesson's own title (3 to 7 words), "minutes" is ${minutes}, and "beats" names each main step (4 to 8 of them).

Reply with only the JSON object for the lesson, no prose and no code fences.`;
}

async function ask(content: Anthropic.Beta.BetaContentBlockParam[], repair?: { previous: string; correction: string }) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
  if (repair) messages.push({ role: "assistant", content: repair.previous }, { role: "user", content: repair.correction });
  const stream = client().beta.messages.stream({
    model: GENERATION_MODEL,
    max_tokens: 64000,
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages,
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new HttpError(502, "Claude declined to write this topic. Try rewording the brief.");
  if (message.stop_reason === "max_tokens") throw new HttpError(502, "Claude’s reply was cut off. Try a shorter topic.");
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { text, usage: message.usage };
}

function parse(text: string): { lesson: Lesson | null; issues: string[] } {
  let raw: Lesson;
  try {
    raw = JSON.parse(text);
  } catch {
    return { lesson: null, issues: ["The reply wasn’t valid JSON."] };
  }
  const issues = validateLesson(raw);
  return { lesson: issues.length ? null : raw, issues };
}

/** Fills in what the editor needs around Claude's cards: a slug, track, owner, poster and completion rule. */
export function shapeDraft(raw: Lesson, req: DraftRequest, actor: User, now: Date): Lesson {
  const slug =
    raw.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "new-lesson";
  const quiz = Object.values(raw.nodes).find((n) => n.type === "quiz");
  const summary = Object.values(raw.nodes).find((n) => n.type === "summary")!;
  const review = new Date(now.getTime() + 182 * 86400000).toISOString().slice(0, 10);
  return {
    ...raw,
    slug,
    version: "0.1",
    track: req.audience ?? "partner",
    minutes: Math.max(1, Math.min(10, Math.round(Number(raw.minutes) || 4))),
    completion: quiz ? { type: "quiz", cardId: quiz.id, label: "Answer the quick check" } : { type: "acknowledge", cardId: summary.id, label: "Work through the topic and finish" },
    owner: `${actor.name} (AI draft for review)`,
    reviewDate: review,
    visual: { variant: "petals", tone: "teal", icon: "spark" },
  };
}

export async function generateLessonDraft(db: Db, actor: User, req: DraftRequest, file: File | null, now: Date) {
  requireAuthor(actor);
  const brief = (req.brief ?? "").trim();
  if (brief.length < 10 && !file) throw new HttpError(400, "Write a short brief, or attach a document to work from.");
  if (brief.length > MAX_BRIEF) throw new HttpError(400, `Keep the brief under ${MAX_BRIEF} characters. Attach a document for anything longer.`);
  const source = file ? await readSource(file) : undefined;
  const request = { ...req, brief: brief || "Turn the attached document into a lesson." };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (source?.kind === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: source.data }, title: source.name });
  if (source?.kind === "text") content.push({ type: "document", source: { type: "text", media_type: "text/plain", data: source.text }, title: source.name });
  content.push({ type: "text", text: draftPrompt(request, source) });

  let { text, usage } = await ask(content);
  let result = parse(text);
  if (!result.lesson) {
    // One repair attempt, showing Claude what failed the format checks.
    ({ text, usage } = await ask(content, {
      previous: text,
      correction: `Your previous reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
    }));
    result = parse(text);
  }
  if (!result.lesson) throw new HttpError(502, `Claude’s draft didn’t pass the format checks:\n${result.issues.slice(0, 8).join("\n")}`);
  const lesson = shapeDraft(result.lesson, request, actor, now);
  audit(db, {
    actor: actor.id,
    event: "lesson.drafted",
    entity: `lesson:${lesson.slug}`,
    next: { model: GENERATION_MODEL, usage, source: source ? { name: source.name, kind: source.kind } : null, cards: Object.keys(lesson.nodes).length },
    at: now,
  });
  return { lesson, source: source ? source.name : null };
}
