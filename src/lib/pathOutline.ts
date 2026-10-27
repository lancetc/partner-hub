/*
  Turns a pasted course outline into stages, chapters and topics, and matches topics to existing
  lessons by title. Understands lines like:

    Stage 2: Working as a Care Coordinator     → a stage heading for the chapters that follow
    05 · Care Coordination                      → a chapter (number, then title)
    6 topics                                    → ignored
    The day-to-day responsibilities of…         → the chapter's description (first plain line)
    1. Understanding Client Types               → a topic
*/

export type OutlineChapter = { number: string; title: string; description: string; stage: string; topics: string[] };

const STAGE = /^stage\s+\d+\s*[:.\-–—]\s*(.+)$/i;
const CHAPTER = /^(\d{1,2})\s*[·•.:\-–—]\s+(.+)$/;
const COUNT = /^\d+\s+(topics?|lessons?|modules?)$/i;
const TOPIC = /^(\d{1,2})[.)]\s+(.+)$/;

export function parseOutline(text: string): OutlineChapter[] {
  const chapters: OutlineChapter[] = [];
  let stage = "";
  let current: OutlineChapter | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || COUNT.test(line)) continue;
    const s = line.match(STAGE);
    if (s) {
      stage = line.replace(/\s+/g, " ");
      current = null;
      continue;
    }
    // "1. Topic" is a topic inside a chapter; "01 · Title" (or "1 · Title" with no chapter yet) starts a chapter.
    const t = line.match(TOPIC);
    if (t && current) {
      current.topics.push(t[2].trim());
      continue;
    }
    const c = line.match(CHAPTER);
    if (c) {
      current = { number: c[1].padStart(2, "0"), title: c[2].trim(), description: "", stage, topics: [] };
      chapters.push(current);
      continue;
    }
    if (current && !current.description && !current.topics.length) current.description = line;
  }
  return chapters;
}

/** For matching titles: lower case, "&" as "and", no punctuation or extra spaces. */
export const normalTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'"“”]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Lessons whose title matches a topic: exact matches first, then ones that start with it (e.g. "Legislative Framework: …"). */
export function lessonMatches<T extends { title: string }>(topic: string, lessons: T[]): T[] {
  const n = normalTitle(topic);
  if (!n) return [];
  const exact = lessons.filter((l) => normalTitle(l.title) === n);
  const starts = lessons.filter((l) => !exact.includes(l) && (normalTitle(l.title).startsWith(`${n} `) || n.startsWith(`${normalTitle(l.title)} `)));
  return [...exact, ...starts];
}
