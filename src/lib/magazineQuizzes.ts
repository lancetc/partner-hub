import { pageBlocks, type GuideDoc } from "./magazine";
import { chapterOf } from "./magazineChapters";

/*
  What an assessed course still needs from its quizzes (server/magazine completionGap). Every linked quiz must be passed.
  A quiz whose learning path has gone (null) is left out, unless none are left, when the course still needs a quiz, as
  it always has. A course with one quiz reads exactly as before: "Pass the quiz first."
*/

export function quizGap(doc: GuideDoc, quizzes: Record<string, { passed: boolean; pathName?: string } | null>): string | null {
  const linked = doc.pages.flatMap((page) => pageBlocks(page).flatMap((b) => (b.type === "quiz" ? [{ page, block: b, state: quizzes[b.id] ?? null }] : [])));
  const live = linked.filter((q) => q.state);
  if (!live.length) return "Pass the quiz first.";
  const left = live.filter((q) => !q.state!.passed);
  if (!left.length) return null;
  if (live.length === 1) return "Pass the quiz first.";
  const names = left.map((q) => {
    const ch = chapterOf(doc.pages, q.page.id);
    return ch ? `Chapter ${ch.number}` : q.state!.pathName || q.page.title || "a quiz";
  });
  return `Pass all the quizzes first: ${[...new Set(names)].join(", ")}.`;
}
