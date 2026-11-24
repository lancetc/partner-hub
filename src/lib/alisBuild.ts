import type { Card, Lesson, QuizQuestion } from "@/content/lessons";
import type { Block, GuideDoc, Page, PracticeItem, Section } from "@/lib/magazine";
import {
  ALIS_COURSE,
  ALIS_PARTS,
  ALIS_PASS_MARK,
  ALIS_QUESTIONS,
  ALIS_SOURCES,
  ALIS_SOURCES_NOTE,
  ALIS_SUPPORT_NOTE,
  ALIS_TOPIC_CUT,
  ALIS_TOPIC_SORT_ITEMS,
  isActivity,
  isTopicActivity,
  moduleKey,
  moduleNumber,
  type AlisActivity,
  type AlisBlock,
  type AlisModule,
  type AlisQuestion,
  type AlisTopicActivity,
} from "@/content/alisCourse";
import { CASE_THREAD_CASES } from "@/content/caseThreadCases";
import { HAZARD_SCENES } from "@/content/hazardScenes";
import { freshCaseThread } from "@/lib/caseThread";

/*
  The ALIS builders (docs/alis-course.md): one shared course (content/alisCourse.ts) turned into the Hub's two formats.
  Pure functions, so the tests can hold both forms to the same source.

  - Short form, a Topic per module: an opening card, the module in brief (`short.brief`), one activity that asks the
    learner to do something (named in ALIS_TOPIC_CUT), a confidence rating, key points, and a two-question formative
    quick check (which also feeds the part's path quiz).
  - Long form, one Magazine course in three chapters: a page per module with all the content and activities (including
    the long-form-only ones: sequencing, matching, a commitment, Job Aids, case threads and Spot the Hazard scenes) and
    a confidence check, then a chapter check page whose quiz block is the part's path quiz (5 questions, 100%).

  The same source activity carries the same id in both: Topic cards are `act-<id>` (a sort becomes one decision card
  per item, `act-<id>--<item>`), and Magazine blocks are `act-<module key>-<id>` (unique across the course document).
*/

/** When the content checks on verify-flagged Topic cards fall due: before anything is published. */
export const ALIS_CHECK_BY = "2026-12-15";

const ACT = "act-";
const NONE = { kind: "none" } as const;

/** A quiz card question: per-question feedback is what the Topic format holds. */
export function topicQuestion(q: AlisQuestion): QuizQuestion {
  const right = q.options.find((o) => o.correct)!;
  return {
    id: q.id,
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, label: o.text })),
    correct: right.id,
    feedback: { correct: `Correct. ${q.explain}`, incorrect: `Not quite. ${q.explain}` },
  };
}

const partOf = (m: Pick<AlisModule, "part">) => ALIS_PARTS.find((p) => p.n === m.part)!;
const check = (note: string | undefined) => (note ? { check: { by: ALIS_CHECK_BY, note: `Quality review: ${note}` } } : {});
const list = (items: string[]) => items.map((t) => `- ${t}`).join("\n");

/** What a module's short Topic keeps. */
export function topicCut(m: AlisModule) {
  const cut = ALIS_TOPIC_CUT[m.slug];
  if (!cut) throw new Error(`No short-form cut for ${m.slug}.`);
  const text = cut.text ? m.blocks.find((b) => b.id === cut.text) : undefined;
  const activity = m.blocks.find((b) => b.id === cut.activity);
  if ((cut.text && text?.kind !== "text") || !activity) throw new Error(`The short-form cut for ${m.slug} names a missing block.`);
  if (!isTopicActivity(activity))
    throw new Error(`The short-form cut for ${m.slug} names a ${activity.kind}: a Topic needs a scenario, a sort or a checklist.`);
  const quick = cut.quick.map((id) => m.quiz.find((q) => q.id === id));
  if (quick.some((q) => !q)) throw new Error(`The quick check for ${m.slug} names a missing question.`);
  return { text: text as Extract<AlisBlock, { kind: "text" }> | undefined, activity, quick: quick as AlisQuestion[] };
}

type Draft = { id: string; type: Card["type"]; [k: string]: unknown };

/** The Topic card(s) for one activity. */
function activityCards(b: AlisTopicActivity, beat: number): Draft[] {
  const base = { beat, visual: NONE, ...check(b.verify) };
  switch (b.kind) {
    case "checklist":
      return [
        {
          ...base,
          id: ACT + b.id,
          type: "checklist",
          label: "Job aid",
          heading: b.title,
          body: b.intro,
          prompt: "Tick each one as you go.",
          items: b.items.map((text, n) => ({ id: `i${n + 1}`, text })),
        },
      ];
    case "scenario":
      return [
        {
          ...base,
          id: ACT + b.id,
          type: "decision",
          label: "Scenario",
          heading: b.title,
          body: b.context,
          prompt: b.prompt,
          options: b.choices.map((x) => ({ id: x.id, label: x.text, feedback: x.feedback, ...(x.verdict === "best" ? { correct: true } : { stay: true }) })),
        },
      ];
    case "sort":
      return b.items.slice(0, ALIS_TOPIC_SORT_ITEMS).map((it) => ({
        ...base,
        id: `${ACT}${b.id}--${it.id}`,
        type: "decision",
        label: "Sort it",
        heading: b.title,
        body: it.text,
        prompt: b.prompt,
        options: b.groups.map((g) =>
          g.id === it.group
            ? { id: g.id, label: g.label, feedback: `Right. ${it.feedback}`, correct: true }
            : { id: g.id, label: g.label, feedback: `Not quite. ${it.feedback}`, stay: true },
        ),
      }));
  }
}

/** The short-form Topic for one module. */
export function buildTopic(m: AlisModule, version = "0.1"): Lesson {
  const { text, activity, quick } = topicCut(m);
  const c = partOf(m).cover;
  const photo = { src: c.src, width: c.width, height: c.height, position: "center" };
  const cards: Draft[] = [
    {
      id: "intro",
      type: "image",
      beat: 0,
      label: `Module ${moduleNumber(m)}`,
      heading: m.title,
      body: `${m.summary}${m.sensitive ? `\n\n*${ALIS_SUPPORT_NOTE}*` : ""}`,
      visual: { kind: "illustration", variant: "petals", tone: "teal", icon: "shield", alt: c.alt, photo },
    },
    // The module in brief; a module not yet given one keeps its reading card.
    ...(m.short
      ? [{ id: "brief", type: "image" as const, beat: 1, label: "In short", heading: "In short", body: m.short.brief, visual: NONE }]
      : text
        ? [{ id: text.id, type: "image" as const, beat: 1, label: "Learn", heading: text.title, body: text.body, visual: NONE, ...check(text.verify) }]
        : []),
    ...activityCards(activity, 2),
    ...(m.short
      ? [
          {
            id: "confidence",
            type: "rating" as const,
            beat: 3,
            label: "Your confidence",
            heading: "How sure are you?",
            prompt: m.short.confidence,
            lowLabel: "Not yet",
            highLabel: "Very confident",
            visual: NONE,
          },
        ]
      : []),
    {
      id: "recap",
      type: "image",
      beat: 3,
      label: "Key points",
      heading: "Key points",
      body: `${list(m.keyPoints)}\n\n*${ALIS_SOURCES_NOTE}*`,
      visual: NONE,
      source: { title: ALIS_SOURCES[0].title, url: ALIS_SOURCES[0].url },
    },
    {
      id: "check",
      type: "quiz",
      beat: 4,
      label: "Quick check",
      heading: "Quick check",
      body: `Two questions to check what you've taken in. These questions also appear in the ${partOf(m).title.split(":")[0]} path quiz.`,
      visual: NONE,
      questions: quick.map(topicQuestion),
    },
  ];

  // Link each card to the next; a decision's right answer moves on, the others stay with their feedback.
  const nodes: Record<string, Card> = {};
  cards.forEach((card, i) => {
    const next = cards[i + 1]?.id;
    const out = { ...card } as unknown as Card;
    if (out.type === "decision") out.options = out.options.map((o) => (o.stay ? o : { ...o, next }));
    else if (out.type !== "quiz" && out.type !== "summary" && next) (out as { next?: string }).next = next;
    nodes[card.id] = out;
  });

  return {
    slug: m.slug,
    version,
    theme: "rhythm",
    title: m.title,
    summary: m.summary,
    outcome: m.outcome,
    track: "core",
    minutes: 4,
    beats: ["Welcome", "In short", "Try it", "Key points", "Quick check"],
    start: "intro",
    nodes,
    completion: { type: "quiz", cardId: "check", label: "Answer the quick check" },
    owner: ALIS_COURSE.owner,
    reviewDate: ALIS_COURSE.reviewDate,
    visual: { variant: "petals", tone: "teal", icon: "shield", alt: c.alt, photo },
  };
}

/** The source activities, in order: what the Magazine page holds. */
export const moduleActivities = (m: AlisModule) => m.blocks.filter(isActivity).map((b) => b.id);

/** The activities a built Topic holds, in the order a learner meets them (following each decision's right answer). */
export function topicActivities(lesson: Lesson): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let id: string | undefined = lesson.start; id && !seen.has(id);) {
    seen.add(id);
    const card: Card | undefined = lesson.nodes[id];
    if (!card) break;
    if (id.startsWith(ACT)) {
      const a = id.slice(ACT.length).split("--")[0];
      if (out.at(-1) !== a) out.push(a);
    }
    id =
      card.type === "decision"
        ? (card.options.find((o) => o.correct) ?? card.options.find((o) => o.next))?.next
        : card.type === "summary"
          ? undefined
          : (card as { next?: string }).next;
  }
  return out;
}

const pageBlocksOf = (page: Page) => page.sections.flatMap((s) => s.blocks);

/** The activities on a built Magazine page, in order. */
export function pageActivities(page: Page, m: AlisModule): string[] {
  const prefix = `${ACT}${moduleKey(m)}-`;
  return pageBlocksOf(page)
    .filter((b) => b.id.startsWith(prefix))
    .map((b) => b.id.slice(prefix.length));
}

/** Which Magazine block each kind of source activity becomes. */
export const MAGAZINE_BLOCK_FOR: Record<AlisActivity["kind"], Block["type"]> = {
  flip: "flashcards",
  reveal: "accordion",
  steps: "process",
  tabs: "tabs",
  sort: "sorting",
  scenario: "decision",
  checklist: "checklist",
  sequence: "sequencing",
  match: "matching",
  commit: "action",
  jobaid: "playbook",
  case: "casethread",
  hazard: "hazardscan",
};

/** A tool placed by id, or a clear error naming the module. */
function placed<T extends { id: string }>(list: T[], id: string, what: string, m: AlisModule): T {
  const found = list.find((x) => x.id === id);
  if (!found) throw new Error(`${m.slug} places ${what} "${id}", which doesn't exist.`);
  return found;
}

function magazineBlocks(m: AlisModule, b: AlisBlock): Block[] {
  const mk = moduleKey(m);
  const meta = {
    evidence: [{ source: `Alis module: ${b.kind === "text" ? b.title : m.title} (Aged Care Quality and Safety Commission)`, ref: `ALIS ${moduleNumber(m)}` }],
    ...(b.verify && { flag: { kind: "verify" as const, note: b.verify } }),
  };
  const id = isActivity(b) ? `${ACT}${mk}-${b.id}` : `${mk}-${b.id}`;
  const lead = (title: string, body: string): Block => ({ id: `${mk}-${b.id}-intro`, type: "text", heading: title, level: 3, body });
  switch (b.kind) {
    case "text":
      return [{ id, ...meta, type: "text", body: b.body }];
    case "callout":
      return [{ id, ...meta, type: "callout", style: b.style, label: b.label, body: b.body }];
    case "flip":
      return [
        lead(b.title, b.intro),
        { id, ...meta, type: "flashcards", cards: b.cards.map((x, n) => ({ id: `${id}-c${n + 1}`, front: x.front, back: x.back })) },
      ];
    case "reveal":
      return [
        lead(b.title, b.intro),
        { id, ...meta, type: "accordion", items: b.items.map((x, n) => ({ id: `${id}-i${n + 1}`, title: x.title, body: x.body })) },
      ];
    case "steps":
      return [
        lead(b.title, b.intro),
        { id, ...meta, type: "process", steps: b.steps.map((x, n) => ({ id: `${id}-s${n + 1}`, title: x.title, body: x.body })) },
      ];
    case "tabs":
      return [lead(b.title, b.intro), { id, ...meta, type: "tabs", tabs: b.tabs.map((x, n) => ({ id: `${id}-t${n + 1}`, label: x.label, body: x.body })) }];
    case "checklist":
      return [lead(b.title, b.intro), { id, ...meta, type: "checklist", title: b.title, items: b.items }];
    case "scenario":
      return [
        lead(b.title, b.context),
        {
          id,
          ...meta,
          type: "decision",
          prompt: b.prompt,
          choices: b.choices.map((x) => ({ id: `${id}-${x.id}`, text: x.text, verdict: x.verdict, feedback: x.feedback })),
        },
      ];
    case "sort":
      return [
        {
          id,
          ...meta,
          type: "sorting",
          prompt: `${b.title}. ${b.prompt}`,
          groups: b.groups.map((g) => ({ id: `${id}-${g.id}`, label: g.label })),
          items: b.items.map((x) => ({ id: `${id}-${x.id}`, text: x.text, group: `${id}-${x.group}`, feedback: x.feedback })),
        },
      ];
    case "sequence":
      return [
        lead(b.title, b.intro),
        { id, ...meta, type: "sequencing", prompt: b.prompt, steps: b.steps.map((text, n) => ({ id: `${id}-s${n + 1}`, text })), feedback: b.feedback },
      ];
    case "match":
      return [
        lead(b.title, b.intro),
        {
          id,
          ...meta,
          type: "matching",
          prompt: b.prompt,
          pairs: b.pairs.map((x, n) => ({ id: `${id}-p${n + 1}`, left: x.left, right: x.right })),
          feedback: b.feedback,
        },
      ];
    case "commit":
      return [
        lead(b.title, b.intro),
        {
          id,
          ...meta,
          type: "action",
          prompt: b.prompt,
          suggestions: b.suggestions.map((text, n) => ({ id: `${id}-a${n + 1}`, text })),
          ...(b.timing && { timing: b.timing }),
        },
      ];
    case "jobaid":
      return [lead(b.title, b.intro), { id, ...meta, type: "playbook", snippetId: b.snippetId, why: b.why }];
    case "case":
      return [lead(b.title, b.intro), { id, ...meta, type: "casethread", ...freshCaseThread(placed(CASE_THREAD_CASES, b.caseId, "case thread", m).data) }];
    case "hazard":
      return [
        lead(b.title, b.intro),
        { id, ...meta, type: "hazardscan", ...structuredClone(placed(HAZARD_SCENES, b.sceneId, "Spot the Hazard scene", m).data) },
      ];
  }
}

/** One long-form Magazine page for a module: all its content and activities. */
export function buildPage(m: AlisModule): Page {
  const mk = moduleKey(m);
  const part = partOf(m);
  const opensPart = m.n === 1;
  const sections: Section[] = [
    {
      id: `${mk}-about`,
      title: "About this module",
      blocks: [
        { id: `${mk}-explore`, type: "text", body: `${m.summary}\n\nIn this module:\n\n${list(m.explore)}` },
        ...(m.sensitive ? [{ id: `${mk}-support`, type: "callout", style: "important", label: "Before you start", body: ALIS_SUPPORT_NOTE } as Block] : []),
      ],
    },
  ];
  for (const b of m.blocks) {
    const current = sections.at(-1)!;
    if (b.kind === "text") sections.push({ id: `${mk}-sec-${b.id}`, title: b.title, blocks: magazineBlocks(m, b) });
    else if (current.id === `${mk}-about` && isActivity(b)) sections.push({ id: `${mk}-sec-${b.id}`, title: b.title, blocks: magazineBlocks(m, b) });
    else current.blocks.push(...magazineBlocks(m, b));
  }
  sections.push({
    id: `${mk}-key-points`,
    title: "Key points",
    blocks: [
      { id: `${mk}-key-points-list`, type: "text", body: list(m.keyPoints) },
      // The same statement the Topic asks learners to rate themselves against.
      ...(m.short ? [{ id: `${mk}-confidence`, type: "confidence", statement: m.short.confidence, low: "Not yet", high: "Very confident" } as Block] : []),
    ],
  });
  sections.push({
    id: `${mk}-sources`,
    title: "Sources",
    blocks: [
      { id: `${mk}-sources-list`, type: "text", body: `${ALIS_SOURCES_NOTE}\n\n${list(ALIS_SOURCES.map((s) => `[${s.title}](${s.url}), ${s.source}`))}` },
    ],
  });
  return {
    id: mk,
    // Each part is a chapter of the course, starting at its first module.
    ...(opensPart && { chapter: { title: part.title, intro: part.description } }),
    title: m.title,
    purpose: m.summary,
    template: "blank",
    kind: "content",
    required: true,
    ...(opensPart && { hero: { src: part.cover.src, alt: part.cover.alt, position: part.cover.position } }),
    sections,
  };
}

/** The part's final page: its path quiz. */
export function buildCheckPage(part: number, pathId: string): Page {
  const id = `p${part}-check`;
  return {
    id,
    title: `Chapter ${part} check`,
    purpose: `${ALIS_QUESTIONS} questions drawn from this chapter's modules. You need all ${ALIS_QUESTIONS} right (${ALIS_PASS_MARK}%) to finish this chapter.`,
    template: "blank",
    kind: "assessment",
    required: true,
    sections: [
      {
        id: `${id}-quiz-section`,
        title: "Check your understanding",
        blocks: [
          {
            id: `${id}-quiz`,
            type: "quiz",
            pathId,
            intro: `${ALIS_QUESTIONS} questions drawn from across this chapter's modules. You need every answer right (${ALIS_PASS_MARK}%) to pass.`,
          },
        ],
      },
    ],
  };
}

/** Each module's questions as draft "Test myself" practice, for Quality to approve before they're served. */
export function practiceItems(modules: AlisModule[]): PracticeItem[] {
  return modules.flatMap((m) =>
    m.quiz.map((q) => ({
      id: `${moduleKey(m)}-${q.id}`,
      kind: "scenario" as const,
      pageId: moduleKey(m),
      prompt: q.prompt,
      choices: q.options.map((o) => ({ id: o.id, text: o.text, feedback: o.feedback })),
      answer: q.options.find((o) => o.correct)!.id,
      explanation: q.explain,
      status: "draft" as const,
      source: `Alis module: ${m.title} (Aged Care Quality and Safety Commission)`,
    })),
  );
}

/**
  The one long-form Magazine course, in three chapters (one per part, in path order): each chapter is a page per
  module, then a chapter check page whose quiz block is that part's path quiz. `pathIds`: the path for each part.
*/
export function buildGuideDoc(modules: AlisModule[], pathIds: Record<number, string>): GuideDoc {
  return {
    schema: 2,
    pages: ALIS_PARTS.flatMap((p) => [...modules.filter((m) => m.part === p.n).map(buildPage), buildCheckPage(p.n, pathIds[p.n] ?? "")]),
    // Off until Quality approves the questions in Manage questions.
    review: { enabled: false, items: practiceItems(modules) },
    tags: { roles: ["staff", "coordinator"], goals: ["quality", "compliance"] },
  };
}
