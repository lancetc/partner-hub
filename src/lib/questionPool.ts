import type { Lesson } from "@/content/lessons";
import type { FollowUpContent } from "@/content/followups";
import type { GuideDoc, PracticeItem } from "./magazine";
import { textHash } from "./magazineNarration";
import { itemState } from "./magazineReview";

/*
  The Question Pool (docs/question-pool.md): the one inventory of every question a native Hub quiz, knowledge
  check or practice asks. Each question has a stable id; each wording of it is a version (keyed by its
  content), approved on its own; and each place it's used is a placement pinned to that version and to the
  release (Topic version, Magazine edition) it went out in.

  Questions are still written where they're used (a Topic's quiz card, a Magazine decision, self-review).
  The pool reconciles them: this file reads each of those formats into one shape, so they can be reviewed,
  searched and exported the same way.
*/

export type PoolKind = "single" | "decision" | "scenario" | "spot";
export const POOL_KINDS: Record<PoolKind, string> = {
  single: "Single best answer",
  decision: "Decision",
  scenario: "Scenario decision",
  spot: "Spot the issue",
};

/** An answer: full credit (the best), part credit (acceptable in a Magazine decision), or none. */
export type PoolOption = { id: string; text: string; credit: "correct" | "partial" | "none"; feedback?: string };
/** A question as learners meet it. `context`: the scenario or example the stem is asked about. */
export type PoolContent = {
  stem: string;
  context?: string;
  options: PoolOption[];
  /** Feedback for any right or any wrong answer (a Topic quiz), where it isn't per answer. */
  feedback?: { correct?: string; incorrect?: string };
  explanation?: string;
};

export type Surface = "topic-quiz" | "topic-decision" | "magazine-decision" | "magazine-practice" | "follow-up";
export const SURFACES: Record<Surface, string> = {
  "topic-quiz": "Topic quiz",
  "topic-decision": "Topic decision",
  "magazine-decision": "Magazine decision",
  "magazine-practice": "Magazine self-review",
  "follow-up": "Follow-up",
};
/** Whether answers count: an assessed quiz, a knowledge check with feedback, or optional practice. */
export type Designation = "assessed" | "formative" | "practice";
export const DESIGNATIONS: Record<Designation, string> = { assessed: "Assessed", formative: "Knowledge check", practice: "Practice" };

export type VersionStatus = "draft" | "in_review" | "approved" | "needs_review" | "retired";
export const STATUSES: Record<VersionStatus, { label: string; tone: "neutral" | "good" | "warn" | "bad" | "info"; meaning: string }> = {
  draft: { label: "Draft", tone: "neutral", meaning: "Written or changed, not yet reviewed. Not approved for learners." },
  in_review: { label: "In review", tone: "info", meaning: "Submitted to a reviewer, awaiting their decision." },
  approved: { label: "Approved", tone: "good", meaning: "This exact wording, answers and feedback have been approved." },
  needs_review: {
    label: "Needs review",
    tone: "warn",
    meaning: "Was approved; flagged to be checked again (a source changed, a review came due, or a problem was reported).",
  },
  retired: { label: "Retired", tone: "neutral", meaning: "Withdrawn. Kept for the record, not for use." },
};
export type Risk = "standard" | "high";

/** A question found in the Hub's content, on its way into the pool. */
export type Found = {
  /** Where it lives, stable across edits: the pool question it belongs to. */
  key: string;
  kind: PoolKind;
  content: PoolContent;
  surface: Surface;
  designation: Designation;
  containerId: string;
  containerTitle: string;
  /** The card, block or page it's on, and that place's name. */
  location: string;
  locationTitle: string;
  /** The Topic version or Magazine edition it's in. */
  release: string;
  /** Published (learners can meet it) rather than in a draft. */
  live: boolean;
  audience: string;
  topic: string;
  /** Approved where it's written (self-review questions are approved in the course editor). */
  approved?: { by: string; at: string };
  source?: string;
};

const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");
/** A quiz prompt that only says how to answer ("Choose one answer."): the question itself is the card heading. */
const GENERIC_PROMPT = /^(choose|select|pick|tick)\b.{0,30}$/i;

/** A version's identity: any change to what learners see, the answer or the feedback is a new version. */
export function contentHash(kind: PoolKind, c: PoolContent) {
  return textHash(
    JSON.stringify([
      kind,
      c.stem,
      c.context ?? "",
      c.options.map((o) => [o.id, o.text, o.credit, o.feedback ?? ""]),
      c.feedback?.correct ?? "",
      c.feedback?.incorrect ?? "",
      c.explanation ?? "",
    ]),
  );
}

/** Wording alone, for spotting possible duplicates: the stem and the best answer, ignoring case and punctuation. */
export function duplicateKey(c: PoolContent) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const stem = norm(c.stem);
  if (stem.length < 25) return null;
  const best = c.options.find((o) => o.credit === "correct");
  return textHash(`${stem}|${norm(best?.text ?? "")}`);
}

export const shortTitle = (stem: string) => {
  const s = stem.replace(/\s+/g, " ").trim();
  return s.length > 70 ? `${s.slice(0, 67).trimEnd()}…` : s || "Untitled question";
};

/** A Topic's questions: each quiz card's questions, and each decision that marks a better choice. */
export function questionsInLesson(lesson: Lesson, live: boolean): Found[] {
  const out: Found[] = [];
  const base = {
    containerId: lesson.slug,
    containerTitle: lesson.title,
    release: lesson.version,
    live,
    audience: (lesson.audiences ?? []).join(", ") || lesson.track,
    topic: lesson.title,
  };
  for (const [cardId, card] of Object.entries(lesson.nodes ?? {})) {
    const heading = clean((card as { heading?: string }).heading);
    const body = clean((card as { body?: string }).body);
    const cardTitle = heading || clean((card as { label?: string }).label) || cardId;
    if (card.type === "quiz")
      for (const q of card.questions ?? []) {
        if (!clean(q.prompt)) continue;
        // On a one-question card the card itself sets the scene; where the prompt is only "Choose one answer.", its heading is the question.
        const alone = card.questions.length === 1;
        const generic = alone && heading && GENERIC_PROMPT.test(clean(q.prompt));
        const scene = alone && !generic ? [heading, body].filter((x) => x && x !== clean(q.prompt)).join("\n") : generic ? body : "";
        out.push({
          ...base,
          key: `topic:${lesson.slug}:${cardId}:${q.id}`,
          kind: "single",
          surface: "topic-quiz",
          designation: card.assessment ? "assessed" : "formative",
          location: `${cardId}.${q.id}`,
          locationTitle: cardTitle,
          content: {
            stem: generic ? heading : clean(q.prompt),
            ...(scene && { context: scene }),
            options: (q.options ?? []).map((o) => ({ id: o.id, text: clean(o.label), credit: o.id === q.correct ? ("correct" as const) : ("none" as const) })),
            feedback: { correct: clean(q.feedback?.correct), incorrect: clean(q.feedback?.incorrect) },
          },
        });
      }
    if (card.type === "decision" && (card.options ?? []).some((o) => o.correct) && clean(card.prompt)) {
      const scene = [heading, body].filter((x) => x && x !== clean(card.prompt)).join("\n");
      out.push({
        ...base,
        key: `topic:${lesson.slug}:${cardId}`,
        kind: "decision",
        surface: "topic-decision",
        designation: "formative",
        location: cardId,
        locationTitle: cardTitle,
        content: {
          stem: clean(card.prompt),
          ...(scene && { context: scene }),
          options: card.options.map((o) => {
            const feedback = clean(o.feedback);
            return { id: o.id, text: clean(o.label), credit: o.correct ? ("correct" as const) : ("none" as const), ...(feedback && { feedback }) };
          }),
        },
      });
    }
  }
  return out;
}

/** A Magazine course's questions: its decision questions, and its self-review questions. */
export function questionsInGuide(guide: { id: string; title: string; audience: string }, doc: GuideDoc, release: string, live: boolean): Found[] {
  const out: Found[] = [];
  const base = { containerId: guide.id, containerTitle: guide.title, release, live, audience: guide.audience, topic: guide.title };
  const pageName = (id: string) => {
    const i = doc.pages.findIndex((p) => p.id === id);
    return doc.pages[i]?.title || `Page ${i + 1}`;
  };
  for (const page of doc.pages)
    for (const section of page.sections)
      for (const b of section.blocks) {
        if (b.type !== "decision" || !clean(b.prompt)) continue;
        const context = clean(b.context);
        out.push({
          ...base,
          key: `magazine:${guide.id}:${b.id}`,
          kind: "decision",
          surface: "magazine-decision",
          designation: "formative",
          location: `${page.id}/${b.id}`,
          locationTitle: pageName(page.id),
          content: {
            stem: clean(b.prompt),
            ...(context && { context }),
            options: b.choices.map((c) => {
              const feedback = clean(c.feedback);
              return {
                id: c.id,
                text: clean(c.text),
                credit: c.verdict === "best" ? ("correct" as const) : c.verdict === "acceptable" ? ("partial" as const) : ("none" as const),
                ...(feedback && { feedback }),
              };
            }),
          },
        });
      }
  for (const it of doc.review?.items ?? []) {
    if (it.status === "retired" || !clean(it.prompt)) continue;
    // Being in a published edition isn't being asked: a self-review question is live only when self-review is
    // on and the question is approved in its course and still current. Otherwise it's a draft.
    const asked = live && doc.review?.enabled === true && itemState(it, doc) === "live";
    out.push({
      ...base,
      ...practiceFound(guide.id, it),
      locationTitle: pageName(it.pageId),
      live: asked,
      release: asked ? release : live ? `${release} (not asked)` : release,
    });
  }
  return out;
}

/** A self-review question in the pool's shape (also used to check one against the pool before serving it). */
export function practiceFound(guideId: string, it: PracticeItem) {
  const context = clean(it.example);
  const explanation = clean(it.explanation);
  const content: PoolContent = {
    stem: clean(it.prompt),
    ...(context && { context }),
    options: it.choices.map((c) => {
      const feedback = clean(c.feedback);
      return { id: c.id, text: clean(c.text), credit: c.id === it.answer ? ("correct" as const) : ("none" as const), ...(feedback && { feedback }) };
    }),
    ...(explanation && { explanation }),
  };
  return {
    key: `practice:${guideId}:${it.id}`,
    kind: it.kind as PoolKind,
    surface: "magazine-practice" as const,
    designation: "practice" as const,
    location: `${it.pageId}/${it.id}`,
    content,
    ...(it.status === "approved" && it.approved && { approved: { by: it.approved.by, at: it.approved.at } }),
    ...(it.source && { source: it.source }),
  };
}

/** A follow-up's recall question. */
export function questionInFollowUp(f: FollowUpContent, live: boolean): Found | null {
  const q = f.question;
  if (!q || !clean(q.prompt) || !(q.options ?? []).length) return null;
  const context = [clean(q.heading), clean(q.body)].filter(Boolean).join("\n");
  const explanation = clean(f.explain?.body);
  return {
    key: `followup:${f.id}`,
    kind: "single",
    surface: "follow-up",
    designation: "formative",
    containerId: f.id,
    containerTitle: f.title,
    location: f.id,
    locationTitle: f.title,
    release: `v${f.version}`,
    live,
    audience: f.role ?? "",
    topic: f.concept || f.title,
    content: {
      stem: clean(q.prompt),
      ...(context && { context }),
      options: q.options.map((o) => {
        const feedback = clean(o.feedback);
        return { id: o.id, text: clean(o.label), credit: o.correct ? ("correct" as const) : ("none" as const), ...(feedback && { feedback }) };
      }),
      ...(explanation && { explanation }),
    },
    ...(f.sources?.[0]?.title && { source: f.sources[0].title }),
  };
}

// ---------------------------------------------------------------------------------------------
// The review workflow
// ---------------------------------------------------------------------------------------------

export type ReviewAction = "submit" | "approve" | "request_changes" | "flag" | "retire" | "restore";
/** Draft → In review → Approved → Needs review or Retired. Approval is for one version; an edit is a new draft. */
export const ACTIONS: Record<ReviewAction, { from: VersionStatus[]; to: VersionStatus; label: string; needsNote?: boolean }> = {
  submit: { from: ["draft"], to: "in_review", label: "Submit for review" },
  approve: { from: ["in_review", "needs_review"], to: "approved", label: "Approve this version" },
  request_changes: { from: ["in_review"], to: "draft", label: "Ask for changes", needsNote: true },
  flag: { from: ["approved"], to: "needs_review", label: "Flag: needs review", needsNote: true },
  retire: { from: ["draft", "in_review", "approved", "needs_review"], to: "retired", label: "Retire", needsNote: true },
  restore: { from: ["retired"], to: "draft", label: "Restore as a draft" },
};

export type PoolUser = { id: string; canAuthor: boolean; superadmin: boolean; reviewRole: "sme" | "compliance" | "publisher" | null };

/**
  Who may approve a version, and why not. Reviewers (subject-matter, Quality and Compliance, the Hub owner)
  and Hub administrators approve; a plain author can't. A high-risk question needs Quality and Compliance or
  the Hub owner, and someone other than whoever wrote that version.
*/
export function approvalBlock(user: PoolUser, risk: Risk, versionAuthor: string | null): string | null {
  if (!user.canAuthor) return "Only authors and reviewers work in the Question Pool.";
  if (!user.reviewRole && !user.superadmin) return "Approving needs a review role: subject-matter reviewer, Quality and Compliance, or Hub owner.";
  if (risk === "high") {
    if (user.reviewRole !== "compliance" && user.reviewRole !== "publisher")
      return "A high-risk question is approved by Quality and Compliance or the Hub owner.";
    if (versionAuthor && versionAuthor === user.id) return "A high-risk question needs a second person: you wrote this version, so someone else approves it.";
  }
  return null;
}

/** Who gets answer keys in an export: reviewers and Hub administrators. Other authors get the inventory without them. */
export const answerKeysFor = (user: PoolUser) => user.canAuthor && (Boolean(user.reviewRole) || user.superadmin);

// ---------------------------------------------------------------------------------------------
// The table: filters, views and sorting
// ---------------------------------------------------------------------------------------------

export type PoolQuery = {
  q?: string;
  view?: string;
  status?: string;
  kind?: string;
  risk?: string;
  surface?: string;
  topic?: string;
  audience?: string;
  owner?: string;
  source?: string;
  due?: string;
  use?: string;
  duplicate?: string;
  sort?: string;
  dir?: string;
  page?: string;
};
export const QUERY_KEYS: (keyof PoolQuery)[] = [
  "q",
  "view",
  "status",
  "kind",
  "risk",
  "surface",
  "topic",
  "audience",
  "owner",
  "source",
  "due",
  "use",
  "duplicate",
  "sort",
  "dir",
  "page",
];

export const VIEWS: { id: string; label: string; hint: string }[] = [
  { id: "all", label: "All questions", hint: "Everything in the pool." },
  { id: "live", label: "Live and in use", hint: "In a published Topic or course right now." },
  { id: "needs-review", label: "Needs review", hint: "Flagged, in review, drafts waiting, or live without an approved version." },
  { id: "first-review", label: "First review due", hint: "Approved when the pool was set up, because it was already live; not yet checked here." },
  { id: "due-soon", label: "Due soon", hint: "Review date in the next 30 days, or overdue." },
  { id: "unplaced", label: "Unplaced approved", hint: "Approved but not used anywhere live." },
  { id: "no-source", label: "No source", hint: "No source document recorded for the answer." },
  { id: "duplicates", label: "Possible duplicates", hint: "The same question and best answer appear more than once." },
  { id: "high-risk", label: "High-risk", hint: "Marked high-risk: needs Quality and Compliance or the Hub owner." },
];

export const SORTS = ["id", "title", "kind", "topic", "audience", "risk", "status", "owner", "approved", "review", "used", "attempted"] as const;
export type SortKey = (typeof SORTS)[number];

/** Under this many first answers, a rate isn't shown: "insufficient data". */
export const MIN_SAMPLE = 10;

/** A cell for Excel: never a formula, even if it's opened or re-saved as CSV. */
export const excelSafe = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
