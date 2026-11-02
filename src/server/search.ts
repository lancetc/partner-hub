import "server-only";
import { lessons } from "@/content/lessons";
import { stories, categoryLabel } from "@/content/stories";
import { resources } from "@/content/resources";
import { extractText } from "@/lib/lessonText";
import { plainText } from "@/lib/richText";
import type { Db } from "./db";
import type { User } from "./auth";
import { forLearner, parseWebinar, type Row as WebinarRow } from "./webinars";
import { missionSlugs } from "./challenges";

/*
  Site search, built on the server from what's live now: every published topic (its title, summary
  and the words on its cards), learning paths, webinars the person can watch, news and resources.
  Drafts are never searched. Every word typed must appear; matches in a title count most.
*/

export type SearchResult = { id: string; href: string; title: string; meta: string; snippet?: string };
type Doc = SearchResult & { head: string; summary: string; body: string };

const MAX_RESULTS = 20;
const clean = (s: string) => plainText(s).replace(/\s+/g, " ").trim();

function documents(db: Db, user: User): Doc[] {
  const missions = missionSlugs(db);
  const topics: Doc[] = lessons
    // Follow ups arrive in a sequence, and challenge missions open one a day: neither is in the catalogue.
    .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
    .map((l) => ({
      id: `lesson:${l.slug}`,
      href: `/learning/${l.slug}`,
      title: l.title,
      meta: `Topic · ${l.minutes} min`,
      head: l.title,
      summary: `${l.summary} ${l.outcome}`,
      body: extractText(l).map(clean).join(" · "),
    }));

  const paths: Doc[] = (
    db
      .prepare(
        "SELECT id, name, description, audience FROM learning_paths p WHERE archived = 0 AND EXISTS (SELECT 1 FROM learning_path_lessons l WHERE l.path_id = p.id) ORDER BY name",
      )
      .all() as { id: string; name: string; description: string; audience: string }[]
  ).map((p) => ({
    id: `path:${p.id}`,
    href: `/paths/${p.id}`,
    title: p.name,
    meta: "Learning path",
    head: p.name,
    summary: `${p.description} ${p.audience}`,
    body: "",
  }));

  const webinars: Doc[] = (db.prepare("SELECT * FROM webinars WHERE status = 'published'").all() as WebinarRow[])
    .map(parseWebinar)
    .filter((w) => forLearner(w, user))
    .map((w) => ({
      id: `webinar:${w.id}`,
      href: `/webinars/${w.id}`,
      title: w.title,
      meta: `Webinar · ${w.minutes} min`,
      head: w.title,
      summary: `${w.summary} ${w.presenter} ${w.topics.join(" ")}`,
      body: w.transcript ?? "",
    }));

  const news: Doc[] = stories.map((s) => ({
    id: `story:${s.slug}`,
    href: `/news/${s.slug}`,
    title: s.title,
    meta: categoryLabel(s.category),
    head: s.title,
    summary: s.dek,
    body: s.body.map((b) => (b.type === "list" ? b.items.join(" ") : b.type === "image" ? `${b.alt} ${b.caption ?? ""}` : plainText(b.text))).join(" "),
  }));

  const library: Doc[] = resources.map((r) => ({
    id: `resource:${r.id}`,
    href: `/resources#${r.id}`,
    title: r.title,
    meta: `Resource · ${r.kind}`,
    head: r.title,
    summary: r.description,
    body: r.points.join(" "),
  }));

  return [...topics, ...paths, ...webinars, ...news, ...library];
}

/** A short piece of the text around the first word that matched, so people can see why it came up. */
function snippetOf(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const phrase = lower.indexOf(terms.join(" "));
  const at = phrase >= 0 ? phrase : Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return undefined;
  const start = Math.max(0, text.lastIndexOf(" ", Math.max(0, at - 50)) + 1);
  const end = Math.min(text.length, at + 110);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s·\s/g, " ").trim()}${end < text.length ? "…" : ""}`;
}

export function search(db: Db, user: User, query: string): SearchResult[] {
  const terms = [
    ...new Set(
      String(query ?? "")
        .toLowerCase()
        .slice(0, 200)
        .split(/\s+/)
        .filter((t) => t.length > 1 || /\d/.test(t)),
    ),
  ].slice(0, 8);
  if (!terms.length) return [];
  const scored: { doc: Doc; score: number }[] = [];
  for (const doc of documents(db, user)) {
    const head = doc.head.toLowerCase();
    const summary = doc.summary.toLowerCase();
    const body = doc.body.toLowerCase();
    let score = 0;
    let all = true;
    for (const t of terms) {
      const w = head.includes(t) ? 6 : summary.includes(t) ? 3 : body.includes(t) ? 1 : 0;
      if (!w) {
        all = false;
        break;
      }
      score += w;
    }
    if (!all) continue;
    // The whole phrase in a title is the best match of all.
    if (terms.length > 1 && head.includes(terms.join(" "))) score += 6;
    // …then the phrase, word for word, anywhere in the text.
    else if (terms.length > 1 && (summary.includes(terms.join(" ")) || body.includes(terms.join(" ")))) score += 3;
    if (doc.id.startsWith("lesson:")) score += 0.5;
    scored.push({ doc, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .slice(0, MAX_RESULTS)
    .map(({ doc }) => {
      const inTitle = terms.every((t) => doc.head.toLowerCase().includes(t));
      return {
        id: doc.id,
        href: doc.href,
        title: doc.title,
        meta: doc.meta,
        snippet: inTitle ? doc.summary.trim().slice(0, 160) || undefined : snippetOf(`${doc.summary} · ${doc.body}`, terms),
      };
    });
}

/** Saved items by their ids (`lesson:…`, `story:…`, `resource:…`), in the order given, for the saved list. */
export function savedItems(db: Db, user: User, ids: string[]): SearchResult[] {
  const docs = new Map(documents(db, user).map((d) => [d.id, d]));
  return ids
    .slice(0, 200)
    .map((id) => docs.get(id))
    .filter((d): d is Doc => Boolean(d))
    .map(({ id, href, title, meta }) => ({ id, href, title, meta }));
}

/* For the topic assistant: the hub content most related to a question, in full, best first. */

const STOP = new Set(
  "a about after all also am an and any are as at be been before but by can could did do does doing for from get got had has have how i if in into is it its just me my need no not of on or our should so than that the their them then there these they this to up us was we what when where which who why will with would you your".split(
    " ",
  ),
);
const keywords = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^'+|'+$/g, ""))
      .filter((w) => w.length > 2 && !STOP.has(w))
      // "visits" finds "visit": a simple plural trim, enough for short questions.
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  ),
];

export type RelatedDoc = { id: string; title: string; href: string; meta: string; text: string };

export function related(db: Db, user: User, question: string, opts: { exclude?: string; limit?: number; chars?: number } = {}): RelatedDoc[] {
  const words = keywords(question).slice(0, 12);
  if (!words.length) return [];
  const scored: { doc: Doc; score: number }[] = [];
  for (const doc of documents(db, user)) {
    if (doc.id === opts.exclude) continue;
    const head = doc.head.toLowerCase();
    const rest = `${doc.summary} ${doc.body}`.toLowerCase();
    let score = 0;
    for (const w of words) score += head.includes(w) ? 4 : rest.includes(w) ? 1 : 0;
    // Most of the question's words should be there, not just one common word.
    if (score > 0 && score >= Math.min(3, words.length)) scored.push({ doc, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 4)
    .map(({ doc }) => ({
      id: doc.id,
      title: doc.title,
      href: doc.href,
      meta: doc.meta,
      text: `${doc.summary} ${doc.body}`
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, opts.chars ?? 3000),
    }));
}
