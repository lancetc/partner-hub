/*
  The rows across the top of Discovery Paths, the same idea as Topics (lib/topicShelves): what's new,
  what colleagues are working through, what's meant for your role, and paths short enough to finish
  in a sitting. Each row skips paths the person already has (assigned or enrolled: those are in "Your
  paths" above) or has finished. A path they've only dipped into stays: its topics are shared with
  other paths, so opening one says little. Rows with too little to show are left out.
*/

export type PathShelfId = "new" | "popular" | "role" | "short";

/** What "See all" does to the full list below. */
export type PathSeeAll = { sort?: "newest" | "popular"; audience?: "role"; length?: "short" };

/** What a row needs to know about a path. */
export type ShelfPath = {
  id: string;
  name: string;
  audience: string;
  minutes: number;
  addedAt: string | null;
  /** Topic completions in this path across Trilogy Care lately. */
  popularity: number;
  assigned: boolean;
  selfEnrolled: boolean;
  started: boolean;
  done: boolean;
};

export type PathShelf<P extends ShelfPath = ShelfPath> = { id: PathShelfId; title: string; blurb: string; paths: P[]; seeAll: PathSeeAll };

/** Paths under this many minutes count as short: the same line as the "Under 1 hour" length filter. */
export const SHORT_PATH_MINUTES = 60;
export const PATH_SHELF_SIZE = 10;
/** A row of one looks like a mistake: rows with fewer than this are left out. */
export const PATH_SHELF_MIN = 2;

/**
  Whether a path is meant for this role, from its audience wording (authors write it freely:
  "Care Coordinators", "Service partners and suppliers", "Everyone"…).
*/
export function pathForRole(audience: string, role: string | null | undefined) {
  if (role === "coordinator") return /coordinat/i.test(audience);
  if (role === "partner") return /partner|supplier/i.test(audience) && !/coordinat/i.test(audience);
  return false;
}

const byName = (a: ShelfPath, b: ShelfPath) => a.name.localeCompare(b.name);
export const byPathPopularity = (a: ShelfPath, b: ShelfPath) => b.popularity - a.popularity || byName(a, b);
export const byPathNewest = (a: ShelfPath, b: ShelfPath) => (b.addedAt ?? "").localeCompare(a.addedAt ?? "") || byName(a, b);

export function pathShelves<P extends ShelfPath>({ paths, audience }: { paths: P[]; audience?: string | null }): PathShelf<P>[] {
  const pool = paths.filter((p) => !p.assigned && !p.selfEnrolled && !p.done);
  const shelves: PathShelf<P>[] = [
    {
      id: "new",
      title: "Recently added",
      blurb: "The newest paths, latest first.",
      paths: pool.filter((p) => p.addedAt).sort(byPathNewest),
      seeAll: { sort: "newest" },
    },
    {
      id: "popular",
      title: "Popular with your colleagues",
      blurb: "The paths people across Trilogy Care are working through lately.",
      paths: pool.filter((p) => p.popularity > 0).sort(byPathPopularity),
      seeAll: { sort: "popular" },
    },
  ];
  if (audience === "partner" || audience === "coordinator") {
    shelves.push({
      id: "role",
      title: audience === "partner" ? "For Care Partners" : "For care coordinators",
      blurb: "Paths written for your role.",
      paths: pool.filter((p) => pathForRole(p.audience, audience)).sort(byPathPopularity),
      seeAll: { audience: "role" },
    });
  }
  shelves.push({
    id: "short",
    title: "Short paths, under an hour",
    blurb: "Finish a whole path in one sitting.",
    paths: pool.filter((p) => p.minutes < SHORT_PATH_MINUTES).sort((a, b) => a.minutes - b.minutes || byName(a, b)),
    seeAll: { length: "short" },
  });
  return shelves.filter((s) => s.paths.length >= PATH_SHELF_MIN).map((s) => ({ ...s, paths: s.paths.slice(0, PATH_SHELF_SIZE) }));
}
