import type { Card, Lesson } from "@/content/lessons";

/*
  What changed between two versions of a lesson, card by card: added, removed and changed cards,
  and for changed cards which parts changed (text, choices, picture, settings…).
*/

export type CardChange = { id: string; title: string; change: "added" | "removed" | "changed"; parts: string[] };
export type LessonDiff = { lesson: string[]; cards: CardChange[] };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const titleOf = (c: Card) => c.heading || c.label || c.id;

/** Friendly names for the parts of a card. */
const PART: Record<string, string> = {
  heading: "heading",
  body: "text",
  label: "label",
  visual: "picture or animation",
  narration: "narration",
  script: "narration",
  transcript: "narration",
  options: "choices",
  questions: "questions",
  prompt: "question",
  keyPoints: "key points",
  figure: "picture in the text",
  points: "summary points",
  items: "items",
  criteria: "criteria",
  spots: "hotspots",
  next: "where it leads",
  check: "check date",
  background: "background",
  calc: "calculator",
  source: "source",
};

export function diffLessons(before: Lesson | null, after: Lesson): LessonDiff {
  const lesson: string[] = [];
  if (before) {
    for (const [k, label] of [
      ["title", "title"],
      ["summary", "summary"],
      ["outcome", "outcome"],
      ["track", "audience"],
      ["reviewDate", "review date"],
      ["beats", "steps"],
      ["visual", "cover picture"],
    ] as const)
      if (!same(before[k], after[k])) lesson.push(label);
  }
  const cards: CardChange[] = [];
  const old = before?.nodes ?? {};
  for (const [id, card] of Object.entries(after.nodes)) {
    const prev = old[id];
    if (!prev) {
      cards.push({ id, title: titleOf(card), change: "added", parts: [] });
      continue;
    }
    const keys = new Set([...Object.keys(prev), ...Object.keys(card)]);
    const parts = new Set<string>();
    for (const k of keys) if (!same((prev as Record<string, unknown>)[k], (card as Record<string, unknown>)[k])) parts.add(PART[k] ?? "settings");
    if (parts.size) cards.push({ id, title: titleOf(card), change: "changed", parts: [...parts] });
  }
  for (const [id, card] of Object.entries(old)) if (!after.nodes[id]) cards.push({ id, title: titleOf(card), change: "removed", parts: [] });
  return { lesson, cards };
}
