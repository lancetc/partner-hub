import type { Page } from "./magazine";

/*
  Chapters in a Magazine course. A page can start a chapter (`page.chapter`, validated in readGuideDoc); the chapter runs
  until the next page that starts one. A course with no chapter markers has no chapters and reads exactly as before.
  Pages before the first marker sit outside any chapter (an introduction, say).
*/

export type Chapter = { number: number; title: string; intro?: string; startPageId: string; pages: Page[] };
export type PageGroup = { chapter: Chapter | null; pages: Page[] };

/** The course's pages in groups: each chapter with its pages, and any pages before the first chapter in a group of their own. */
export function pageGroups(pages: Page[]): PageGroup[] {
  const groups: PageGroup[] = [];
  let n = 0;
  for (const p of pages) {
    if (p.chapter) {
      n += 1;
      groups.push({
        chapter: { number: n, title: p.chapter.title, ...(p.chapter.intro && { intro: p.chapter.intro }), startPageId: p.id, pages: [] },
        pages: [],
      });
    } else if (!groups.length) groups.push({ chapter: null, pages: [] });
    const g = groups.at(-1)!;
    g.pages.push(p);
    g.chapter?.pages.push(p);
  }
  return groups;
}

/** The course's chapters, in order. Empty when it has none. */
export const chaptersOf = (pages: Page[]): Chapter[] => pageGroups(pages).flatMap((g) => (g.chapter ? [g.chapter] : []));

/** True when the course is divided into chapters. */
export const hasChapters = (pages: Page[]) => pages.some((p) => p.chapter);

/** The chapter a page is in, or null (no chapters, or the page comes before the first). */
export function chapterOf(pages: Page[], pageId: string): Chapter | null {
  return chaptersOf(pages).find((c) => c.pages.some((p) => p.id === pageId)) ?? null;
}

/** "Chapter 2 · Managing an incident": a chapter's label above a page title. */
export const chapterLabel = (c: Pick<Chapter, "number" | "title">) => `Chapter ${c.number} · ${c.title}`;
