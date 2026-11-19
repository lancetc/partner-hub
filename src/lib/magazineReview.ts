import type { GuideDoc, Page, PracticeItem } from "./magazine";
import { pageSnapshot, substantiallyChanged, textHash } from "./magazineNarration";

/*
  Self-review ("Test myself", docs/magazine-self-review.md): optional practice a learner can try while reading
  a Magazine course. Three questions on this page, or on the pages they've opened so far, with feedback and a
  link back to the part of the course each comes from.

  Practice is separate from everything that counts: it never finishes a page, completes a course, passes a
  quiz or counts towards a certificate. Its questions live in the course document (so each edition keeps
  the questions it was published with), and only approved ones whose page hasn't moved on are ever served.
*/

/** Questions in a review; fewer when that's all there is. */
export const REVIEW_SIZE = 3;

export const PRACTICE_KINDS = {
  scenario: { label: "Scenario decision", hint: "Pick the best response to a realistic situation." },
  spot: { label: "Spot the issue", hint: "Choose which detail in a short example needs attention." },
} as const;

/**
  Where a question is: a draft (not served), live (approved, and its page hasn't changed much since), to
  check again (its page or section changed, or went), or retired. A live question edited after approval is
  a draft again until it's approved.
*/
export type ItemState = "draft" | "live" | "review" | "retired";
export const ITEM_STATES: Record<ItemState, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  draft: { label: "Draft: not shown to learners", tone: "neutral" },
  live: { label: "Approved", tone: "good" },
  review: { label: "Check again: the page changed", tone: "warn" },
  retired: { label: "Retired", tone: "neutral" },
};

/** The question as learners see it, as one value: a change to any of it is a new version. */
export const itemVersion = (it: PracticeItem) =>
  textHash(JSON.stringify([it.kind, it.prompt, it.example ?? "", it.choices.map((c) => [c.id, c.text, c.feedback ?? ""]), it.answer, it.explanation]));

const pageFor = (doc: GuideDoc, it: PracticeItem) => doc.pages.find((p) => p.id === it.pageId);

export function itemState(it: PracticeItem, doc: GuideDoc): ItemState {
  if (it.status === "retired") return "retired";
  if (it.status === "draft" || !it.approved || it.approved.version !== itemVersion(it)) return "draft";
  const page = pageFor(doc, it);
  if (!page || page.kind !== "content") return "review";
  if (it.sectionId && !page.sections.some((s) => s.id === it.sectionId)) return "review";
  if (!it.basis || substantiallyChanged(it.basis, pageSnapshot(page))) return "review";
  return "live";
}

/** What has to be fixed before a question can be approved. */
export function itemProblems(it: PracticeItem, doc: GuideDoc): string[] {
  const out: string[] = [];
  const page = pageFor(doc, it);
  if (!page || page.kind !== "content") out.push("Link it to one of the course’s reading pages.");
  if (!it.prompt.trim()) out.push("Write the question.");
  if (it.kind === "spot" && !it.example?.trim()) out.push("Add the short example learners look for the issue in.");
  const filled = it.choices.filter((c) => c.text.trim());
  if (filled.length < 3) out.push("Give at least three answers: the best one and two plausible alternatives.");
  if (!it.choices.some((c) => c.id === it.answer && c.text.trim())) out.push("Mark the best answer.");
  if (!it.explanation.trim()) out.push("Explain why the best answer is right, and what makes the tempting wrong one wrong.");
  if (page && it.sectionId && !page.sections.some((s) => s.id === it.sectionId)) out.push("Its section isn’t on the page any more: choose another.");
  return out;
}

/** The questions that may be served: approved, unchanged since, and on one of these pages (all pages when not given). */
export const liveItems = (doc: GuideDoc, pageIds?: readonly string[]) =>
  (doc.review?.items ?? []).filter((it) => itemState(it, doc) === "live" && (!pageIds || pageIds.includes(it.pageId)));

/** Each reading page: its questions by state, the kinds and whether they point at a section. */
export function coverage(doc: GuideDoc) {
  return doc.pages
    .filter((p) => p.kind === "content")
    .map((p: Page) => {
      const items = (doc.review?.items ?? []).filter((it) => it.pageId === p.id);
      const by = (s: ItemState) => items.filter((it) => itemState(it, doc) === s).length;
      const live = items.filter((it) => itemState(it, doc) === "live");
      return {
        pageId: p.id,
        title: p.title,
        live: live.length,
        draft: by("draft"),
        review: by("review"),
        retired: by("retired"),
        kinds: [...new Set(live.map((it) => it.kind))],
        anchored: live.filter((it) => it.sectionId).length,
      };
    });
}

/**
  What stops a course with self-review switched on being published: a reading page learners can open with
  no approved question, or a question whose page has changed since it was approved. Drafts and thin pages
  are suggestions. Nothing here applies with self-review off.
*/
export function reviewChecks(doc: GuideDoc) {
  const blocking: string[] = [];
  const suggestions: string[] = [];
  if (!doc.review?.enabled) return { blocking, suggestions };
  const many = doc.pages.length > 1;
  const name = (pageId: string) => {
    const i = doc.pages.findIndex((p) => p.id === pageId);
    return many ? `page ${i + 1}${doc.pages[i]?.title ? ` (“${doc.pages[i].title}”)` : ""}` : "the page";
  };
  for (const c of coverage(doc)) {
    if (!c.live) blocking.push(`Self-review: ${name(c.pageId)} has no approved questions. Approve at least one, or switch self-review off.`);
    else if (c.live < REVIEW_SIZE)
      suggestions.push(
        `Self-review: ${name(c.pageId)} has ${c.live} approved question${c.live === 1 ? "" : "s"}; reviews of it will be shorter than ${REVIEW_SIZE}.`,
      );
    if (c.review)
      blocking.push(`Self-review: ${c.review} question${c.review === 1 ? "" : "s"} on ${name(c.pageId)} need checking: the page changed after approval.`);
  }
  for (const it of doc.review.items)
    if (itemState(it, doc) === "live") for (const p of itemProblems(it, doc)) blocking.push(`Self-review, a question on ${name(it.pageId)}: ${p}`);
  const drafts = doc.review.items.filter((it) => itemState(it, doc) === "draft").length;
  if (drafts) suggestions.push(`Self-review: ${drafts} draft question${drafts === 1 ? " isn’t" : "s aren’t"} shown to learners until approved.`);
  return { blocking, suggestions };
}

/**
  Which questions to ask: ones they haven't seen first, then ones they missed a while ago (a day or more), then
  the rest; the ones from their last review only when there's nothing else. `repeats`: some of these have been
  asked before, so the review says questions may repeat rather than promising new ones.
*/
export function pickItems(
  pool: PracticeItem[],
  history: { itemId: string; correct: boolean; at: string }[],
  lastSession: readonly string[],
  now: Date,
  n = REVIEW_SIZE,
  random: () => number = Math.random,
) {
  const last = new Map<string, { correct: boolean; at: string }>();
  for (const h of [...history].sort((a, b) => a.at.localeCompare(b.at))) last.set(h.itemId, h);
  const dayAgo = now.getTime() - 86_400_000;
  const score = (it: PracticeItem) => {
    const h = last.get(it.id);
    if (lastSession.includes(it.id)) return 0;
    if (!h) return 3;
    if (!h.correct) return Date.parse(h.at) <= dayAgo ? 2.5 : 1.5;
    return 1;
  };
  const ranked = pool.map((it) => ({ it, s: score(it) + random() * 0.5 })).sort((a, b) => b.s - a.s);
  const items = ranked.slice(0, n).map((x) => x.it);
  return { items, repeats: items.some((it) => last.has(it.id)) };
}
