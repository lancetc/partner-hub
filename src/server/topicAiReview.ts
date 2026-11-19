import "server-only";
import type { Lesson } from "@/content/lessons";
import { extractText } from "@/lib/lessonText";
import type { Db } from "./db";
import { HttpError, requireAuthor, type User } from "./auth";
import { editorLesson } from "./authoredLessons";
import { allFacts } from "./facts";
import { askForJson } from "./claudeJson";
import { GENERATION_MODEL } from "./generate";
import { aiReviewOf, approvalFor, canPublishTopics, record, stageOf, type AiFinding } from "./topicApproval";

/*
  Step 3 of a topic's review: the AI pre-review. Straight after an author submits a topic, Claude reads
  the submitted draft and checks it against the Hub's approved sources (the facts library: rates, dates
  and numbers with their sources, and the official references the topic cites). It looks for claims that
  don't match a source or have none, out-of-date details, quiz answers and feedback that don't hold up,
  anything unsafe, and unclear wording. Its findings go to the human reviewer, who decides. Claude never
  approves or changes anything. The author can skip it (say Claude isn't connected).
*/

export type AiReviewProgress = { type: "phase"; phase: "reading" | "writing" | "checking" | "fixing"; issues?: number };

const MAX_FINDINGS = 15;

/** Who can run or skip it: the author who submitted it, the reviewer, or the Hub owner, while it's still to do. */
function requireAiStep(db: Db, actor: User, slug: string) {
  requireAuthor(actor);
  const { stage, row, stale } = stageOf(db, slug);
  if (stage !== "review" || !row || stale) throw new HttpError(409, "The AI pre-review runs on a topic that’s been submitted for review.");
  if (row.submitted_by !== actor.id && row.reviewer_id !== actor.id && !canPublishTopics(db, actor))
    throw new HttpError(403, "Only the author who submitted it, the reviewer or the Hub owner can run the AI pre-review.");
  return row;
}

/** The topic as Claude reads it: each card's text under its id and kind. */
export function topicForReview(lesson: Lesson) {
  const cards = Object.entries(lesson.nodes as Record<string, { type?: string; heading?: string }>).map(([id, node]) => {
    const text = extractText(node as unknown as Lesson).filter(Boolean);
    return `<card id="${id}" type="${node.type ?? "card"}">\n${text.join("\n")}\n</card>`;
  });
  const references = Object.values(lesson.nodes as Record<string, { references?: { title: string; url: string; issuer: string }[]; reference?: { title: string; url: string; issuer: string } }>)
    .flatMap((n) => [...(n.references ?? []), ...(n.reference ? [n.reference] : [])])
    .map((r) => `- ${r.title} (${r.issuer}): ${r.url}`);
  return { cards, references };
}

export function reviewPrompt(lesson: Lesson, facts: { label: string; value: string; notes: string; source_title: string | null; check_by: string | null; key: string }[]) {
  const { cards, references } = topicForReview(lesson);
  return `You are the AI pre-review step for Trilogy Care's Partner Hub, a training site for Australian aged care Care Partners and care coordinators. An author has submitted this topic for review. A human subject-matter expert reviews it next and decides; your findings help them focus. You don't approve anything.

Topic: ${lesson.title}
Summary: ${lesson.summary ?? ""}

The approved facts library (rates, dates and numbers the Hub keeps up to date; text may use them as {{key}}):
${facts.length ? facts.map((f) => `- {{${f.key}}} ${f.label}: ${f.value}${f.source_title ? ` (source: ${f.source_title})` : ""}${f.check_by ? `, to be rechecked by ${f.check_by}` : ""}`).join("\n") : "(empty)"}

Official references the topic cites:
${references.length ? references.join("\n") : "(none)"}

The topic's cards:
${cards.join("\n\n")}

Check the topic against these approved sources and your knowledge of Australian aged care (Support at Home, the Aged Care Act 2024), and look for:
- a rate, date, number, rule or legal requirement that doesn't match the facts library or the cited references, or has no source at all (it should use a {{fact}} or cite a reference)
- anything likely out of date, or that conflicts with something else in the topic
- quiz or decision answers that are wrong or arguable, and feedback that doesn't explain why
- anything unsafe or that could harm a client, or advice beyond a Care Partner's role
- unclear, wordy or non-plain-English text, and pictures without a useful description

Only report what a reviewer should act on or look at; say where things are good in at most two findings. Don't invent sources. If you're not sure something is wrong, mark it "check", not "fix". Use Australian English.

Reply with only a JSON object, no other text:
{
  "summary": "Two or three sentences for the reviewer: overall, and what to look at first",
  "findings": [
    { "severity": "fix" | "check" | "good", "card": "card id, or \\"\\" for the whole topic", "title": "Short headline", "detail": "What and why, citing the fact or reference", "suggestion": "What to change, or \\"\\"" }
  ]
}`;
}

/** Problems with Claude's reply, or none. */
export function reviewIssues(value: unknown, cardIds: string[]): string[] {
  const v = value as { summary?: unknown; findings?: unknown };
  const issues: string[] = [];
  if (typeof v?.summary !== "string" || !v.summary.trim()) issues.push("Add a summary.");
  if (!Array.isArray(v?.findings)) return [...issues, 'The reply needs a "findings" list.'];
  if (v.findings.length > MAX_FINDINGS) issues.push(`Keep it to ${MAX_FINDINGS} findings or fewer.`);
  (v.findings as Record<string, unknown>[]).forEach((f, i) => {
    if (!["fix", "check", "good"].includes(String(f?.severity))) issues.push(`Finding ${i + 1}: severity must be fix, check or good.`);
    if (typeof f?.title !== "string" || !f.title.trim()) issues.push(`Finding ${i + 1} needs a title.`);
    if (typeof f?.detail !== "string" || !f.detail.trim()) issues.push(`Finding ${i + 1} needs its detail.`);
    if (f?.card && !cardIds.includes(String(f.card))) issues.push(`Finding ${i + 1}: "${String(f.card)}" isn’t one of the card ids.`);
  });
  return issues;
}

function cleanFindings(value: { findings: Record<string, unknown>[] }, lesson: Lesson): AiFinding[] {
  const label = (id: string) => {
    const n = (lesson.nodes as Record<string, { heading?: string; prompt?: string; type?: string }>)[id];
    return n ? (n.heading || n.prompt || n.type || id).slice(0, 80) : "";
  };
  const order = { fix: 0, check: 1, good: 2 } as const;
  return value.findings
    .slice(0, MAX_FINDINGS)
    .map((f) => ({
      severity: (["fix", "check", "good"].includes(String(f.severity)) ? f.severity : "check") as AiFinding["severity"],
      card: String(f.card ?? ""),
      cardLabel: f.card ? label(String(f.card)) : "Whole topic",
      title: String(f.title ?? "").trim().slice(0, 160),
      detail: String(f.detail ?? "").trim().slice(0, 1200),
      suggestion: String(f.suggestion ?? "").trim().slice(0, 800),
    }))
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
  Runs the AI pre-review on the submitted draft, streaming progress. Saved with the draft it checked,
  so editing the topic means submitting (and checking) it again. Returns the updated approval.
*/
export async function runAiReview(db: Db, actor: User, slug: string, now: Date, send: (e: AiReviewProgress) => void) {
  const row = requireAiStep(db, actor, slug);
  const lesson = editorLesson(db, slug)?.lesson;
  if (!lesson) throw new HttpError(404, "Topic not found.");
  send({ type: "phase", phase: "reading" });
  const facts = allFacts(db) as unknown as Parameters<typeof reviewPrompt>[1];
  const cardIds = Object.keys(lesson.nodes);
  send({ type: "phase", phase: "writing" });
  const { value } = await askForJson<{ summary: string; findings: Record<string, unknown>[] }>(
    [{ type: "text", text: reviewPrompt(lesson, facts) }],
    (v) => reviewIssues(v, cardIds),
    { onText: () => {}, onPhase: (phase, issues) => send({ type: "phase", phase, issues }) },
    "medium",
  );
  const findings = cleanFindings(value, lesson);
  // Checked again: the draft could have been edited or the review run twice while Claude was working.
  if (aiReviewOf(db, slug, row.draft_hash)) return { approval: approvalFor(db, actor, slug, now) };
  db.prepare("INSERT INTO topic_ai_reviews (slug, draft_hash, status, summary, findings, model, actor, at) VALUES (?, ?, 'done', ?, ?, ?, ?, ?)").run(
    slug,
    row.draft_hash,
    value.summary.trim().slice(0, 1200),
    JSON.stringify(findings),
    GENERATION_MODEL,
    actor.id,
    now.toISOString(),
  );
  const fixes = findings.filter((f) => f.severity === "fix").length;
  const checks = findings.filter((f) => f.severity === "check").length;
  record(db, slug, "ai_reviewed", actor, now, { note: `${fixes} to fix, ${checks} to check.` });
  return { approval: approvalFor(db, actor, slug, now) };
}

/** Goes straight to the human reviewer without Claude's check (recorded, with why). */
export function skipAiReview(db: Db, actor: User, slug: string, note: unknown, now: Date) {
  const row = requireAiStep(db, actor, slug);
  if (aiReviewOf(db, slug, row.draft_hash)) throw new HttpError(409, "The AI pre-review is already done.");
  const why = String(note ?? "").trim().slice(0, 500);
  db.prepare("INSERT INTO topic_ai_reviews (slug, draft_hash, status, summary, actor, at) VALUES (?, ?, 'skipped', ?, ?, ?)").run(slug, row.draft_hash, why, actor.id, now.toISOString());
  record(db, slug, "ai_skipped", actor, now, { note: why });
  return approvalFor(db, actor, slug, now);
}
