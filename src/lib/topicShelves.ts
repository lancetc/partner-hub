import type { TopicSummary } from "./topicSummary";

/*
  The rows across the top of Topics, for a catalogue of hundreds: what's new, what colleagues are
  finishing, what's written for your role, and what fits between visits. Each row is short (it's a taste,
  with "See all" opening the full list sorted or filtered the same way), skips topics the person already
  has in front of them (assigned, under way or finished), and is left out when there isn't enough to show.
*/

export type ShelfId = "new" | "popular" | "role" | "quick";

/** What "See all" does to the full list below. */
export type SeeAll = { sort?: "newest" | "popular"; track?: "partner" | "coordinator"; length?: "short" };

export type Shelf = { id: ShelfId; title: string; blurb: string; topics: TopicSummary[]; seeAll: SeeAll };

/** Topics under this many minutes count as quick: the same line as the "Under 6 min" length filter. */
export const QUICK_MINUTES = 6;
export const SHELF_SIZE = 10;
/** A row of one looks like a mistake: rows with fewer than this are left out. */
export const SHELF_MIN = 2;

export type ShelfInput = {
  topics: TopicSummary[];
  /** Completions per topic over the last few weeks, from everyone. */
  popularity: Record<string, number>;
  /** "partner" or "coordinator", from the person's profile; anything else means no role row. */
  audience?: string | null;
  /** Topics the person already has in front of them. */
  exclude?: Set<string>;
};

const byTitle = (a: TopicSummary, b: TopicSummary) => a.title.localeCompare(b.title);

export function topicShelves({ topics, popularity, audience, exclude = new Set() }: ShelfInput): Shelf[] {
  const pool = topics.filter((t) => !exclude.has(t.slug));
  const shelves: Shelf[] = [
    {
      id: "new",
      title: "Recently added",
      blurb: "The newest topics, latest first.",
      topics: pool.filter((t) => t.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!) || byTitle(a, b)),
      seeAll: { sort: "newest" },
    },
    {
      id: "popular",
      title: "Popular with your colleagues",
      blurb: "Finished most often across Trilogy Care lately.",
      topics: pool.filter((t) => (popularity[t.slug] ?? 0) > 0).sort((a, b) => popularity[b.slug] - popularity[a.slug] || byTitle(a, b)),
      seeAll: { sort: "popular" },
    },
  ];
  if (audience === "partner" || audience === "coordinator") {
    shelves.push({
      id: "role",
      title: audience === "partner" ? "For Care Partners" : "For care coordinators",
      blurb: "Written for your role.",
      topics: pool.filter((t) => t.track === audience).sort((a, b) => (popularity[b.slug] ?? 0) - (popularity[a.slug] ?? 0) || byTitle(a, b)),
      seeAll: { track: audience },
    });
  }
  shelves.push({
    id: "quick",
    title: `Quick wins, under ${QUICK_MINUTES} minutes`,
    blurb: "Short enough to finish between visits.",
    topics: pool.filter((t) => t.minutes < QUICK_MINUTES).sort((a, b) => a.minutes - b.minutes || byTitle(a, b)),
    seeAll: { length: "short" },
  });
  return shelves.filter((s) => s.topics.length >= SHELF_MIN).map((s) => ({ ...s, topics: s.topics.slice(0, SHELF_SIZE) }));
}

/** Most popular first, for "Sort by: Most popular" in the full list. */
export function byPopularity(popularity: Record<string, number>) {
  return (a: TopicSummary, b: TopicSummary) => (popularity[b.slug] ?? 0) - (popularity[a.slug] ?? 0) || byTitle(a, b);
}
