import "server-only";
import { lessons, type Card, type Lesson } from "@/content/lessons";
import { factsUsed, volatileIn } from "@/lib/facts";
import { extractText } from "@/lib/lessonText";
import type { Db } from "./db";
import { requireAuthor, type User } from "./auth";
import { allFacts } from "./facts";
import { openReports } from "./contentReports";

/*
  Content review: what needs checking across every live lesson. Lesson review dates, card check
  dates and fact check dates are overdue, due within 30 days, or fine. Learner reports are listed,
  and cards that mention a dollar amount, date, percentage or law without a check date or a fact
  are suggested for one.
*/

export const DUE_SOON_DAYS = 30;
export type Status = "overdue" | "due" | "ok";
export type ReviewItem = {
  key: string;
  kind: "lesson" | "card" | "fact";
  title: string;
  /** Lesson title for cards. */
  context?: string;
  slug?: string;
  cardId?: string;
  factKey?: string;
  due: string;
  status: Status;
  days: number;
  note?: string;
  owner?: string;
  source?: { title: string; url: string };
};

const today = (now: Date) => now.toISOString().slice(0, 10);
export function daysUntil(date: string, now: Date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today(now)}T00:00:00Z`)) / 86_400_000);
}
export const statusOf = (days: number): Status => (days < 0 ? "overdue" : days <= DUE_SOON_DAYS ? "due" : "ok");

const cardText = (card: Card) => extractText({ nodes: { [card.id]: card } } as unknown as Lesson).join(" ");

/** Every dated item: lesson reviews, card checks and fact checks. */
export function datedItems(db: Db, now: Date, source: Lesson[] = lessons.filter((l) => l.track !== "reinforcement")): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const l of source) {
    if (l.reviewDate) {
      const days = daysUntil(l.reviewDate, now);
      items.push({
        key: `lesson:${l.slug}`,
        kind: "lesson",
        title: l.title,
        slug: l.slug,
        due: l.reviewDate,
        days,
        status: statusOf(days),
        owner: l.owner,
        note: "Review the whole topic",
      });
    }
    for (const card of Object.values(l.nodes)) {
      if (!card.check?.by) continue;
      const days = daysUntil(card.check.by, now);
      items.push({
        key: `card:${l.slug}:${card.id}`,
        kind: "card",
        title: card.heading || card.label || card.id,
        context: l.title,
        slug: l.slug,
        cardId: card.id,
        due: card.check.by,
        days,
        status: statusOf(days),
        note: card.check.note,
        source: card.check.source,
        owner: l.owner,
      });
    }
  }
  for (const f of allFacts(db)) {
    if (!f.checkBy) continue;
    const days = daysUntil(f.checkBy, now);
    items.push({
      key: `fact:${f.key}`,
      kind: "fact",
      title: f.label,
      factKey: f.key,
      due: f.checkBy,
      days,
      status: statusOf(days),
      note: `Currently “${f.value}”`,
      owner: f.owner,
      source: f.source ?? undefined,
    });
  }
  return items.sort((a, b) => a.days - b.days);
}

/** Cards mentioning something likely to date, with no check date and no shared fact. */
export function suggestions(source: Lesson[] = lessons.filter((l) => l.track !== "reinforcement")) {
  const out: { slug: string; lesson: string; cardId: string; title: string; found: string[] }[] = [];
  for (const l of source)
    for (const card of Object.values(l.nodes)) {
      if (card.check || factsUsed(card).length) continue;
      const found = volatileIn(cardText(card));
      if (found.length) out.push({ slug: l.slug, lesson: l.title, cardId: card.id, title: card.heading || card.label || card.id, found });
    }
  return out;
}

export function contentReview(db: Db, actor: User, now: Date) {
  requireAuthor(actor);
  const items = datedItems(db, now);
  const reports = openReports(db);
  const titles = new Map(lessons.map((l) => [l.slug, l]));
  return {
    today: today(now),
    overdue: items.filter((i) => i.status === "overdue"),
    due: items.filter((i) => i.status === "due"),
    ok: items.filter((i) => i.status === "ok"),
    reports: reports.map((r) => {
      const l = titles.get(r.slug);
      const card = l?.nodes[r.cardId];
      return { ...r, lesson: l?.title ?? r.slug, card: card ? card.heading || card.label || card.id : r.cardId };
    }),
    suggestions: suggestions(),
  };
}
