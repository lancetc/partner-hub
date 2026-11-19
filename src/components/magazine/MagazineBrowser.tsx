"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "../Icon";
import { ShelfRow } from "../ShelfRow";

/*
  Magazine, laid out like Topics and Discovery Paths: "All magazines" with the same toolbar (search,
  kind, progress, length, sort, tiles or a list), the rows to browse (Recently added, Popular with your
  colleagues, Short stories under 30 minutes, eLearning courses), then "All stories". It holds the
  Magazine guides and courses and the eLearning (Articulate SCORM) courses. The choices live in the page
  address, so a filtered view can be bookmarked or shared.
*/

export type BrowseGuide = {
  id: string;
  /** A Magazine guide or course, or an eLearning (SCORM) course. */
  kind: "magazine" | "elearning";
  href: string;
  title: string;
  standfirst: string;
  cover: string | null;
  /** Magazine pages; 1 is a guide. eLearning courses: 0. */
  pages: number;
  /** Reading time; null when it isn't known (eLearning). */
  minutes: number | null;
  /** eLearning: the SCORM edition, for the label. */
  edition?: string;
  publishedAt: string;
  /** Colleagues who opened it lately. */
  popularity: number;
  state: "new" | "started" | "completed";
  /** Where authors edit it. */
  editHref?: string;
};

type Sort = "newest" | "popular" | "az" | "shortest";
type Status = "any" | "new" | "started" | "completed";
type Kind = "any" | "guide" | "course" | "elearning";
type Length = "any" | "short" | "long";
type View = "grid" | "list";

/** A short story: read in one sitting. */
const SHORT_MINUTES = 30;
const SHELF_SIZE = 10;
/** One row to start (four on a computer); "Show more" adds three rows at a time, as on Topics and Discovery Paths. */
const ROW = 4;
const MORE = 12;

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Most popular" },
  { value: "az", label: "Name A–Z" },
  { value: "shortest", label: "Shortest first" },
];

/** The same fields as Topics and Discovery Paths. */
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem] font-normal";

const STATE: Record<BrowseGuide["state"], { text: string; tone: string } | null> = {
  new: null,
  started: { text: "Started", tone: "bg-[#e3eefb] text-[#1d4f91]" },
  completed: { text: "Completed", tone: "bg-[#dff3ea] text-[#0f5b3a]" },
};

const kindOf = (g: BrowseGuide): Exclude<Kind, "any"> => (g.kind === "elearning" ? "elearning" : g.pages > 1 ? "course" : "guide");
const isShort = (g: BrowseGuide) => g.minutes !== null && g.minutes < SHORT_MINUTES;
const byName = (a: BrowseGuide, b: BrowseGuide) => a.title.localeCompare(b.title);
const byNewest = (a: BrowseGuide, b: BrowseGuide) => b.publishedAt.localeCompare(a.publishedAt) || byName(a, b);
const byPopular = (a: BrowseGuide, b: BrowseGuide) => b.popularity - a.popularity || byNewest(a, b);
// Unknown lengths go last.
const byShortest = (a: BrowseGuide, b: BrowseGuide) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || byName(a, b);
const meta = (g: BrowseGuide) =>
  g.kind === "elearning"
    ? `eLearning course${g.edition ? ` · SCORM ${g.edition}` : ""}`
    : g.pages > 1
      ? `Course · ${g.pages} pages · ${g.minutes} min`
      : `Guide · ${g.minutes} min read`;

type SeeAll = { sort?: Sort; length?: Length; kind?: Kind };

/** The rows to browse. They leave out what's already finished, and only show when there's something in them. */
function shelves(guides: BrowseGuide[]) {
  const pool = guides.filter((g) => g.state !== "completed");
  const rows: { id: string; title: string; blurb: string; guides: BrowseGuide[]; seeAll: SeeAll }[] = [
    { id: "new", title: "Recently added", blurb: "The newest guides and courses, latest first.", guides: [...pool].sort(byNewest), seeAll: { sort: "newest" } },
    {
      id: "popular",
      title: "Popular with your colleagues",
      blurb: "What people across Trilogy Care are reading lately.",
      guides: pool.filter((g) => g.popularity > 0).sort(byPopular),
      seeAll: { sort: "popular" },
    },
    {
      id: "short",
      title: "Short stories, under 30 minutes",
      blurb: "Read one in a single sitting.",
      guides: pool.filter(isShort).sort(byShortest),
      seeAll: { length: "short", sort: "shortest" },
    },
    {
      id: "elearning",
      title: "eLearning courses",
      blurb: "Interactive courses built in Articulate. Your place and scores are saved as you go.",
      guides: guides.filter((g) => g.kind === "elearning").sort(byNewest),
      seeAll: { kind: "elearning" },
    },
  ];
  return rows.filter((r) => r.guides.length).map((r) => ({ ...r, guides: r.guides.slice(0, SHELF_SIZE) }));
}

/** canEdit: authors get an Edit link on each one, straight into its editor. */
export function MagazineBrowser({ guides, canEdit = false }: { guides: BrowseGuide[]; canEdit?: boolean }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [kind, setKind] = useState<Kind>((params.get("kind") as Kind) || "any");
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "any");
  const [length, setLength] = useState<Length>((params.get("length") as Length) || "any");
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "newest");
  const [view, setView] = useState<View>((params.get("view") as View) || "grid");
  const [shown, setShown] = useState(ROW);
  const everyStory = useRef<HTMLHeadingElement>(null);

  // Keep the choices in the address (without reloading), so Back and bookmarks bring them back.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (kind !== "any") next.set("kind", kind);
    if (status !== "any") next.set("status", status);
    if (length !== "any") next.set("length", length);
    if (sort !== "newest") next.set("sort", sort);
    if (view !== "grid") next.set("view", view);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [q, kind, status, length, sort, view]);

  if (!guides.length)
    return (
      <p className="mt-10 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
        There are no guides or courses for you yet. New ones will appear here.
      </p>
    );

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = guides.filter(
    (g) =>
      words.every((w) => `${g.title} ${g.standfirst}`.toLowerCase().includes(w)) &&
      (kind === "any" || kindOf(g) === kind) &&
      (status === "any" || g.state === status) &&
      (length === "any" || (length === "short" ? isShort(g) : !isShort(g))),
  );
  const sorted = [...filtered].sort(sort === "az" ? byName : sort === "popular" ? byPopular : sort === "shortest" ? byShortest : byNewest);
  const filtering = Boolean(words.length) || kind !== "any" || status !== "any" || length !== "any";
  // Search and filter results show in full: they're the point then.
  const visible = filtering ? sorted.length : shown;
  const reset = () => {
    setShown(ROW);
    setQ("");
    setKind("any");
    setStatus("any");
    setLength("any");
  };
  const rows = shelves(guides);
  const seeAll = (s: SeeAll) => {
    reset();
    if (s.sort) setSort(s.sort);
    if (s.length) setLength(s.length);
    if (s.kind) setKind(s.kind);
    requestAnimationFrame(() => everyStory.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="mt-8 flex flex-col gap-12">
      <section aria-labelledby="all-magazines">
        <h2 id="all-magazines" className="font-serif text-2xl font-semibold">
          {filtering ? "Results" : "All magazines"} <span className="text-base font-normal text-ink-muted">({filtering ? filtered.length : guides.length})</span>
        </h2>

        {/* Search, filters and sort: the same toolbar as Topics and Discovery Paths. */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
            Search
            <span className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input type="search" className={cx(field, "pl-9")} placeholder="A title or a word in it" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Kind
            <select className={cx(field, "w-auto")} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
              <option value="any">Everything</option>
              <option value="guide">Guides (one page)</option>
              <option value="course">Courses (several pages)</option>
              <option value="elearning">eLearning courses</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your progress
            <select className={cx(field, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="any">Any progress</option>
              <option value="new">Not started</option>
              <option value="started">Started</option>
              <option value="completed">Completed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Length
            <select className={cx(field, "w-auto")} value={length} onChange={(e) => setLength(e.target.value as Length)}>
              <option value="any">Any length</option>
              <option value="short">Under 30 minutes</option>
              <option value="long">Longer</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Sort by
            <select className={cx(field, "w-auto")} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <div role="group" aria-label="View" className="flex rounded-full border border-line-strong p-0.5">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={v === "grid" ? "Show as tiles" : "Show as a list"}
                title={v === "grid" ? "Tiles" : "List"}
                onClick={() => setView(v)}
                className={cx("grid size-9 place-items-center rounded-full", view === v ? "bg-action text-on-action" : "text-ink-muted hover:bg-muted")}
              >
                <Icon name={v === "grid" ? "widget" : "list"} className="size-4" />
              </button>
            ))}
          </div>
          <p className="ml-auto flex flex-wrap items-center gap-3 pb-2.5 text-sm text-ink-muted" role="status">
            {filtering ? `Showing ${filtered.length} of ${guides.length}` : `${guides.length} ${guides.length === 1 ? "story" : "stories"}`}
            {filtering && (
              <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
                Clear search and filters
              </button>
            )}
          </p>
        </div>

        {!filtering && rows.length > 0 && (
          <div className="mt-10 flex flex-col gap-10">
            {rows.map((r) => (
              <ShelfRow key={r.id} id={`magazine-${r.id}`} title={r.title} blurb={r.blurb} count={r.guides.length} onSeeAll={() => seeAll(r.seeAll)}>
                {r.guides.map((g) => (
                  <Tile key={g.id} guide={g} canEdit={canEdit} className="w-[15rem] shrink-0 snap-start sm:w-[17rem]" />
                ))}
              </ShelfRow>
            ))}
          </div>
        )}

        <h3 ref={everyStory} className={cx("scroll-mt-24 font-serif text-xl font-semibold", filtering || !rows.length ? "sr-only" : "mt-12")}>
          All stories
        </h3>

        {sorted.length ? (
          <div className="mt-5">
            <Grid guides={sorted.slice(0, visible)} view={view} canEdit={canEdit} />
            {sorted.length > visible && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShown(visible + MORE)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted"
                >
                  Show more <span className="font-normal text-ink-muted">({sorted.length - visible} more)</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
            Nothing matches. Try another word, or{" "}
            <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
              clear the filters
            </button>
            .
          </p>
        )}
      </section>
    </div>
  );
}

function Grid({ guides, view, canEdit }: { guides: BrowseGuide[]; view: View; canEdit: boolean }) {
  if (view === "list")
    return (
      <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
        {guides.map((g) => (
          <Row key={g.id} guide={g} canEdit={canEdit} />
        ))}
      </ul>
    );
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {guides.map((g) => (
        <Tile key={g.id} guide={g} canEdit={canEdit} />
      ))}
    </ul>
  );
}

/** The picture, or a teal cover with the Magazine mark (or a screen, for eLearning). */
function Cover({ guide: g, className }: { guide: BrowseGuide; className?: string }) {
  if (g.cover)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={g.cover} alt="" loading="lazy" className={cx("bg-muted object-cover", className)} />;
  return (
    <div className={cx("grid place-items-center bg-[#008282] text-white", className)} aria-hidden>
      <Icon name={g.kind === "elearning" ? "monitor" : "magazine"} className="size-1/4 max-h-16 max-w-16" />
    </div>
  );
}

function State({ guide }: { guide: BrowseGuide }) {
  const s = STATE[guide.state];
  return s ? <span className={cx("self-start rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", s.tone)}>{s.text}</span> : null;
}

function Tile({ guide: g, canEdit, className }: { guide: BrowseGuide; canEdit: boolean; className?: string }) {
  return (
    <li className={cx("group relative flex flex-col gap-3", className)}>
      <Cover guide={g} className="aspect-[16/10] w-full rounded-2xl" />
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{meta(g)}</p>
      <h3 className="font-serif text-xl font-semibold leading-snug">
        <Link href={g.href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
          {g.title}
        </Link>
      </h3>
      {g.standfirst && <p className="line-clamp-3 text-ink-muted">{g.standfirst}</p>}
      <State guide={g} />
      <p className="mt-auto text-sm text-ink-muted">Added {formatDate(g.publishedAt)}</p>
      {canEdit && g.editHref && <EditLink href={g.editHref} />}
    </li>
  );
}

function Row({ guide: g, canEdit }: { guide: BrowseGuide; canEdit: boolean }) {
  return (
    <li className="group relative flex items-center gap-4 p-3 sm:px-4">
      <Cover guide={g} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-mulish text-xs font-bold uppercase tracking-[0.1em] text-accent">{meta(g)}</p>
        <h3 className="font-semibold leading-snug">
          <Link href={g.href} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
            {g.title}
          </Link>
        </h3>
        {g.standfirst && <p className="hidden truncate text-sm text-ink-muted sm:block">{g.standfirst}</p>}
      </div>
      <div className="hidden w-28 shrink-0 sm:flex">
        <State guide={g} />
      </div>
      {canEdit && g.editHref && <EditLink href={g.editHref} />}
      <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
    </li>
  );
}

/** Above the tile's own link, so it can be clicked on its own. */
function EditLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="relative z-10 inline-flex min-h-9 items-center gap-1.5 self-start rounded-full border border-line-strong bg-surface px-3 text-sm font-semibold hover:bg-muted"
    >
      <Icon name="pen" className="size-4" /> Edit
    </Link>
  );
}
