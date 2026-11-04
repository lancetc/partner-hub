import "server-only";
import { inflateRawSync } from "node:zlib";
import type Anthropic from "@anthropic-ai/sdk";
import type { Lesson } from "@/content/lessons";
import { audit, type Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { client, FORMAT, GENERATION_MODEL, validateLesson } from "./generate";
import { BUILD_STAGES, isStage, stageCounts, STAGE_KEYS, type BuildStage } from "@/lib/buildSequence";

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

/** What the author sees while Claude works: which part of the job it's on, and the cards written so far by stage. */
export type DraftProgress =
  { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number } | { type: "stages"; counts: Record<BuildStage, number> };
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
  if (buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])))
    throw new HttpError(415, "That’s an older Word file (.doc). Save it as .docx or PDF and try again.");
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

Build the lesson in this sequence of stages, in this order. Every card has a "stage" field naming its stage:
- "hook": one "presenter" card first. Ava, the AI presenter, speaks to the learner: a relatable moment from their working day, a question it raises, and why this topic matters. "transcript" is her spoken script (60 to 90 words); "body" is a short on-screen version.
- "show": one or two image cards that set up a realistic, fictional workplace situation (first names only, no identifiable client or health details) that the rest of the lesson returns to.
- "explain": two or three image cards that teach the key ideas, short on screen with "keyPoints" where they help, and the explaining in "narration".
- "choose": one or two decision cards in the situation, each with two or three clearly different options.
- "feedback": for each poorer option, a consequence card (emphasis "consequence") that shows what happens and offers a way to recover or try again; and one card on what good looked like after the best choice.
- "apply": a quick quiz (two or three questions, plausible wrong options, feedback that explains why), then one "response" card ("Your turn") asking the learner to apply it to their own work, with a "modelResponse" to compare against.
- "recap": the summary card: two to four points and one practical action to take on the job.

Keep on-screen text short (15 to 40 words); put the explaining in "narration". Warm, clear Australian English. Speak to the learner as "you". No exclamation marks or celebratory language.

${FORMAT}

Two more card types for this lesson:
  "presenter": + "transcript": the presenter's spoken script, "next": card id. Use {"kind":"none"} for its visual.
  "response":  + "prompt": the question, "modelResponse": an example good answer (40 to 80 words), "next": card id

For this lesson "title" is the lesson's own title (3 to 7 words), and "minutes" is ${minutes}. "beats" has exactly seven short, learner-friendly labels, one for each stage in order (for example "Why it matters", "The situation", "What to know", "Your call", "What happened", "Your turn", "Recap"), and each card's "beat" is its stage's position (hook 0, show 1, explain 2, choose 3, feedback 4, apply 5, recap 6). Every card also has "stage": one of ${JSON.stringify(STAGE_KEYS)}.

Reply with only the JSON object for the lesson, no prose and no code fences.`;
}

async function ask(
  content: Anthropic.Beta.BetaContentBlockParam[],
  repair?: { previous: string; correction: string },
  /** Called with the reply so far as it streams in. */
  onText?: (soFar: string) => void,
) {
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
  if (onText) stream.on("text", (_delta, snapshot) => onText(snapshot));
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
  const issues = [...validateLesson(raw), ...sequenceIssues(raw)];
  return { lesson: issues.length ? null : raw, issues };
}

/** Checks the build sequence: every card has a stage, every stage is there, and each stage uses its kinds of card. */
export function sequenceIssues(l: Lesson): string[] {
  if (!l?.nodes || typeof l.nodes !== "object") return [];
  const issues: string[] = [];
  const cards = Object.values(l.nodes);
  for (const c of cards) {
    if (!isStage(c.stage)) issues.push(`${c.id}: needs "stage", one of ${STAGE_KEYS.join(", ")}`);
    else {
      const allowed = BUILD_STAGES.find((s) => s.key === c.stage)!.types as readonly string[];
      if (!allowed.includes(c.type)) issues.push(`${c.id}: a "${c.stage}" card should be ${allowed.join(" or ")}, not ${c.type}`);
    }
  }
  for (const s of BUILD_STAGES) if (!cards.some((c) => c.stage === s.key)) issues.push(`no "${s.key}" card: the lesson needs every stage`);
  const start = l.nodes[l.start];
  if (start && start.stage !== "hook") issues.push(`the first card should be the "hook" presenter card`);
  return issues;
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
  const nodes = Object.fromEntries(
    Object.entries(raw.nodes).map(([id, c]) => {
      if (c.type === "presenter") {
        const words = c.transcript.trim().split(/\s+/).length;
        return [
          id,
          {
            ...c,
            // Ava, the AI presenter: her video is made from the transcript later, in Media and voice.
            visual: {
              kind: "presenter",
              name: "Ava",
              synthetic: true,
              tone: "navy",
              alt: "AI presenter introducing the topic",
              video: { provider: "elevenlabs", id: "", title: "Presenter introduction", orientation: "portrait" },
            },
            durationSec: Math.max(20, Math.round((words / 150) * 60)),
          },
        ];
      }
      if (c.type === "response") return [id, { ...c, visibility: c.visibility || "Only you can see this. It isn’t marked, and it isn’t shared." }];
      return [id, c];
    }),
  ) as Lesson["nodes"];
  return {
    ...raw,
    nodes,
    slug,
    version: "0.1",
    track: req.audience ?? "partner",
    minutes: Math.max(1, Math.min(10, Math.round(Number(raw.minutes) || 4))),
    completion: quiz
      ? { type: "quiz", cardId: quiz.id, label: "Answer the quick check" }
      : { type: "acknowledge", cardId: summary.id, label: "Work through the topic and finish" },
    owner: `${actor.name} (AI draft for review)`,
    reviewDate: review,
    visual: { variant: "petals", tone: "teal", icon: "spark" },
  };
}

export async function generateLessonDraft(
  db: Db,
  actor: User,
  req: DraftRequest,
  file: File | null,
  now: Date,
  /** Progress as Claude works, for the editor's build view. */
  onProgress: (p: DraftProgress) => void = () => {},
) {
  requireAuthor(actor);
  const brief = (req.brief ?? "").trim();
  if (brief.length < 10 && !file) throw new HttpError(400, "Write a short brief, or attach a document to work from.");
  if (brief.length > MAX_BRIEF) throw new HttpError(400, `Keep the brief under ${MAX_BRIEF} characters. Attach a document for anything longer.`);
  if (file) onProgress({ type: "phase", phase: "reading" });
  const source = file ? await readSource(file) : undefined;
  const request = { ...req, brief: brief || "Turn the attached document into a lesson." };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (source?.kind === "pdf")
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: source.data }, title: source.name });
  if (source?.kind === "text") content.push({ type: "document", source: { type: "text", media_type: "text/plain", data: source.text }, title: source.name });
  content.push({ type: "text", text: draftPrompt(request, source) });

  // Report each stage as its cards appear in the reply (only when the counts change).
  let last = "";
  const watch = (soFar: string) => {
    const counts = stageCounts(soFar);
    const key = JSON.stringify(counts);
    if (key !== last) onProgress({ type: "stages", counts });
    last = key;
  };
  onProgress({ type: "phase", phase: "writing" });
  let { text, usage } = await ask(content, undefined, watch);
  onProgress({ type: "phase", phase: "checking" });
  let result = parse(text);
  if (!result.lesson) {
    // One repair attempt, showing Claude what failed the format checks.
    onProgress({ type: "phase", phase: "fixing", issues: result.issues.length });
    ({ text, usage } = await ask(
      content,
      {
        previous: text,
        correction: `Your previous reply had these problems:\n${result.issues.slice(0, 30).join("\n")}\n\nReply again with the complete corrected JSON object only.`,
      },
      watch,
    ));
    onProgress({ type: "phase", phase: "checking" });
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
