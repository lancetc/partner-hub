import type { Lesson } from "@/content/lessons";

/*
  The words a learner reads in a lesson, pulled out for translation and put back afterwards.
  Only text people see is touched: ids, links, card types and settings never are. Narration
  scripts and transcripts stay in English to match the English audio.
*/

/** Fields whose string value is shown to learners. */
const TEXT_KEYS = new Set([
  "title",
  "summary",
  "outcome",
  "label",
  "heading",
  "body",
  "prompt",
  "text",
  "feedback",
  "cta",
  "action",
  "tip",
  "description",
  "drawerLabel",
  "lowLabel",
  "highLabel",
  "completionMessage",
  "alt",
  "centre",
  "centreNote",
  "placeholder",
  "modelResponse",
  "visibility",
  "assumptions",
  "example",
  "note",
]);
/** Fields holding a list of strings shown to learners. */
const TEXT_LISTS = new Set(["beats", "points", "paragraphs", "words", "labels"]);
const looksLikeLink = (s: string) => /^(https?:|\/|mailto:)/i.test(s.trim());

type Visit = (s: string) => string;

function walk(value: unknown, key: string, parent: string, visit: Visit): unknown {
  if (typeof value === "string") {
    // Quiz feedback is an object ({ correct, incorrect }) whose every value is text.
    const text = TEXT_KEYS.has(key) || parent === "feedback";
    return text && value.trim() && !looksLikeLink(value) ? visit(value) : value;
  }
  if (Array.isArray(value)) {
    if (TEXT_LISTS.has(key)) return value.map((v) => (typeof v === "string" && v.trim() ? visit(v) : v));
    return value.map((v) => walk(v, key, parent, visit));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, k, key, visit);
    return out;
  }
  return value;
}

/** Every distinct piece of learner-facing text in the lesson, in a stable order. */
export function extractText(lesson: Lesson): string[] {
  const seen = new Set<string>();
  walk(lesson, "", "", (s) => {
    seen.add(s);
    return s;
  });
  return [...seen];
}

/** The lesson with each piece of text swapped for its translation (untranslated text stays as it was). */
export function applyText(lesson: Lesson, translations: Record<string, string>): Lesson {
  return walk(lesson, "", "", (s) => translations[s] ?? s) as Lesson;
}
