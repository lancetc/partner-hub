"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx, formatDate, hoursAndMinutes } from "@/lib/format";
import { Icon } from "../Icon";
import { ShelfRow } from "../ShelfRow";
import { FeaturedTag } from "../FeaturedTag";
import { GUIDE_GOALS, GUIDE_ROLES, browsingRole, type GuideGoal, type GuideRole } from "@/lib/magazine";
import { useApi, type Me } from "@/lib/api";
import { PictureTags } from "../PictureTags";
import { BrowsePanel } from "../BrowsePanel";

/*
  Magazine, laid out like Topics and Discovery Paths: "Browse the Magazine" with a toolbar, the rows to browse, then
  "All stories". It holds Magazine guides, simulations and courses, and the eLearning (Articulate SCORM) courses.

  The toolbar follows what the Magazine holds, who reads it and what it's for. The aim running through it is growing
  the business, Trilogy Care's and the partners':
  - Goals, as a row of chips with counts, "Grow the business" first: what a story helps someone do (lib/magazine
    GUIDE_GOALS). Only the goals there are show.
  - Your role: Suppliers, Care Coordinators, Care Partners or Trilogy Care staff, as the demo profiles are named
    (GUIDE_ROLES). A story tagged for no role is for everyone. Shown when there's more than one role to choose.
  - Format: guides to read (field guides, expert guidance, explainers), simulations and decision labs (lib/magazine
    SIMULATION_BLOCKS), courses of several pages, and eLearning.
  - Your progress, length (a quick read, 10 to 30 minutes, longer) and sort.
  Roles and goals are the author's tags, or worked out from the story until it has some (lib/magazine guideTags).
  The choices live in the page address, so a filtered view can be bookmarked or shared.
*/

export type BrowseFormat = "guide" | "simulation" | "course" | "elearning";
export type BrowseGuide = {
  id: string;
  /** A Magazine guide or course, or an eLearning (SCORM) course. */
  kind: "magazine" | "elearning";
  /** What the reader opens: a guide to read, a simulation, a course of several pages, or eLearning. */
  format: BrowseFormat;
  /** Who may read it (GUIDE_AUDIENCES values); empty: everyone. */
  audience: string[];
  /** Who it's for by role, and what it helps them do (lib/magazine GUIDE_ROLES, GUIDE_GOALS). No roles: everyone. */
  roles: string[];
  goals: string[];
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
  /** Tagged Featured in its settings (server/magazineFeatured): a yellow tag over its picture. */
  featured?: boolean;
};

type Sort = "newest" | "popular" | "az" | "shortest";
type Status = "any" | "new" | "started" | "completed";
type Format = "any" | BrowseFormat;
type Role = "any" | GuideRole;
type Goal = "any" | GuideGoal;
type Length = "any" | "quick" | "medium" | "long";
type View = "grid" | "list";

/** A quick read: under ten minutes, one sitting. Medium: up to half an hour. */
const QUICK_MINUTES = 10;
const MEDIUM_MINUTES = 30;
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

/** The formats, in the order a reader meets them: the lightest first. */
const FORMATS: { value: BrowseFormat; label: string; chip: string; icon: "magazine" | "gauge" | "book" | "monitor" }[] = [
  { value: "guide", label: "Guide", chip: "Guides and explainers", icon: "magazine" },
  { value: "simulation", label: "Simulation", chip: "Simulations and decision labs", icon: "gauge" },
  { value: "course", label: "Course", chip: "Courses", icon: "book" },
  { value: "elearning", label: "eLearning", chip: "eLearning", icon: "monitor" },
];
const formatOf = (f: BrowseFormat) => FORMATS.find((x) => x.value === f)!;

const roleLabel = (r: string) => GUIDE_ROLES.find((x) => x.value === r)?.label ?? "";
const goalLabel = (g: string) => GUIDE_GOALS.find((x) => x.value === g)?.label ?? "";
/** A small mark for each goal, on its chip. */
const GOAL_ICONS: Record<GuideGoal, "target" | "money" | "shield" | "heart" | "route" | "clipboard"> = {
  grow: "target",
  money: "money",
  quality: "shield",
  clients: "heart",
  start: "route",
  compliance: "clipboard",
};

const LENGTHS: { value: Length; label: string }[] = [
  { value: "any", label: "Any length" },
  { value: "quick", label: `Quick read (under ${QUICK_MINUTES} min)` },
  { value: "medium", label: `${QUICK_MINUTES}–${MEDIUM_MINUTES} minutes` },
  { value: "long", label: `Longer than ${MEDIUM_MINUTES} minutes` },
];

/** The same fields as Topics and Discovery Paths. */
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-base font-normal";

const STATE: Record<BrowseGuide["state"], { text: string; tone: string } | null> = {
  new: null,
  started: { text: "Started", tone: "bg-[#e3eefb] text-[#1d4f91]" },
  completed: { text: "Completed", tone: "bg-[#dff3ea] text-[#0f5b3a]" },
};

/** A value from the address, if it's one of the allowed ones. "short" is the old under-30-minutes length. */
function fromAddress<const T extends string>(v: string | null, allowed: readonly T[], fallback: NoInfer<T>): T {
  if (v === "short") return (allowed.includes("quick" as T) ? "quick" : fallback) as T;
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const lengthOf = (g: BrowseGuide): Exclude<Length, "any"> | null =>
  g.minutes === null ? null : g.minutes < QUICK_MINUTES ? "quick" : g.minutes <= MEDIUM_MINUTES ? "medium" : "long";
/** For everyone (no roles tagged), or for this role among others. */
const forRole = (g: BrowseGuide, r: Role) => r === "any" || !g.roles.length || g.roles.includes(r);
const byName = (a: BrowseGuide, b: BrowseGuide) => a.title.localeCompare(b.title);
const byNewest = (a: BrowseGuide, b: BrowseGuide) => b.publishedAt.localeCompare(a.publishedAt) || byName(a, b);
const byPopular = (a: BrowseGuide, b: BrowseGuide) => b.popularity - a.popularity || byNewest(a, b);
// Unknown lengths go last.
const byShortest = (a: BrowseGuide, b: BrowseGuide) => (a.minutes ?? 1e9) - (b.minutes ?? 1e9) || byName(a, b);
/** " · 3 hr 20 min": a course or simulation's length, in hours and minutes once it's an hour or more. */
const length = (g: BrowseGuide) => (g.minutes == null ? "" : ` · ${hoursAndMinutes(g.minutes)}`);
const meta = (g: BrowseGuide) =>
  g.kind === "elearning"
    ? `eLearning course${g.edition ? ` · SCORM ${g.edition}` : ""}`
    : g.format === "course"
      ? `Course · ${g.pages} pages${length(g)}`
      : g.format === "simulation"
        ? `Simulation${length(g)}`
        : `Guide · ${g.minutes} min read`;
/** Everything a search looks through: the words, the format and who it's for. */
const searchText = (g: BrowseGuide) =>
  [g.title, g.standfirst, formatOf(g.format).chip, ...g.roles.map(roleLabel), ...g.goals.map(goalLabel)].join(" ").toLowerCase();

type SeeAll = { sort?: Sort; length?: Length; format?: Format; goal?: Goal };

/** The rows to browse. They leave out what's already finished, and only show when there's something in them. */
function shelves(guides: BrowseGuide[]) {
  const pool = guides.filter((g) => g.state !== "completed");
  const rows: { id: string; title: string; blurb: string; guides: BrowseGuide[]; seeAll: SeeAll }[] = [
    {
      id: "new",
      title: "Recently added",
      blurb: "The newest guides, simulations and courses, latest first.",
      guides: [...pool].sort(byNewest),
      seeAll: { sort: "newest" },
    },
    {
      id: "grow",
      title: "Grow the business",
      blurb: "Plan capacity, win and keep clients, and build a business that lasts: Trilogy Care's and yours.",
      guides: pool.filter((g) => g.goals.includes("grow")).sort(byNewest),
      seeAll: { goal: "grow" },
    },
    {
      id: "popular",
      title: "Popular with your colleagues",
      blurb: "What people across Trilogy Care are reading lately.",
      guides: pool.filter((g) => g.popularity > 0).sort(byPopular),
      seeAll: { sort: "popular" },
    },
    {
      id: "simulations",
      title: "Simulations and decision labs",
      blurb: "Play a case through: make the calls, see what follows, and why.",
      guides: pool.filter((g) => g.format === "simulation").sort(byNewest),
      seeAll: { format: "simulation" },
    },
    {
      id: "quick",
      title: `Quick reads, under ${QUICK_MINUTES} minutes`,
      blurb: "Field guides and explainers for a spare moment.",
      guides: pool.filter((g) => lengthOf(g) === "quick").sort(byShortest),
      seeAll: { length: "quick", sort: "shortest" },
    },
    {
      id: "courses",
      title: "Courses",
      blurb: "Several pages to work through, at your own pace. Your place is saved.",
      guides: pool.filter((g) => g.format === "course").sort(byNewest),
      seeAll: { format: "course" },
    },
    {
      id: "elearning",
      title: "eLearning courses",
      blurb: "Interactive courses built in Articulate. Your place and scores are saved as you go.",
      guides: guides.filter((g) => g.format === "elearning").sort(byNewest),
      seeAll: { format: "elearning" },
    },
  ];
  return rows.filter((r) => r.guides.length).map((r) => ({ ...r, guides: r.guides.slice(0, SHELF_SIZE) }));
}

/** canEdit: authors get an Edit link on each one, straight into its editor. */
export function MagazineBrowser({ guides, canEdit = false }: { guides: BrowseGuide[]; canEdit?: boolean }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [format, setFormat] = useState<Format>(fromAddress(params.get("kind"), ["any", "guide", "simulation", "course", "elearning"], "any"));
  const [goal, setGoal] = useState<Goal>(fromAddress(params.get("goal"), ["any", ...GUIDE_GOALS.map((x) => x.value)], "any"));
  const [role, setRole] = useState<Role>(fromAddress(params.get("role"), ["any", ...GUIDE_ROLES.map((x) => x.value)], "any"));
  const [status, setStatus] = useState<Status>(fromAddress(params.get("status"), ["any", "new", "started", "completed"], "any"));
  const [length, setLength] = useState<Length>(fromAddress(params.get("length"), ["any", "quick", "medium", "long"], "any"));
  const [sort, setSort] = useState<Sort>(fromAddress(params.get("sort"), ["newest", "popular", "az", "shortest"], "newest"));
  const [shown, setShown] = useState(ROW);
  const everyStory = useRef<HTMLHeadingElement>(null);
  // Starts on the reader's own role (a Care Coordinator sees Care Coordinators first), unless the address chose one or
  // they've picked one since. Only when the Magazine has stories tagged for it.
  const me = useApi<Me>("/api/me").data;
  const roleChosen = useRef(params.has("role"));
  useEffect(() => {
    if (roleChosen.current || !me) return;
    roleChosen.current = true;
    const mine = browsingRole({ audience: me.user.audience, role: me.user.role, canAuthor: me.canAuthor, selfRole: me.user.selfRole });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- once, when we know who's reading
    if (mine && guides.some((g) => g.roles.includes(mine))) setRole(mine);
  }, [me, guides]);

  // Keep the choices in the address (without reloading), so Back and bookmarks bring them back.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (format !== "any") next.set("kind", format);
    if (goal !== "any") next.set("goal", goal);
    if (role !== "any") next.set("role", role);
    if (status !== "any") next.set("status", status);
    if (length !== "any") next.set("length", length);
    if (sort !== "newest") next.set("sort", sort);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [q, goal, role, format, status, length, sort]);

  if (!guides.length)
    return (
      <p className="mt-10 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
        There are no guides or courses for you yet. New ones will appear here.
      </p>
    );

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  // Everything but the goal, so each goal chip can say how many it would show.
  const beforeGoal = guides.filter(
    (g) =>
      words.every((w) => searchText(g).includes(w)) &&
      forRole(g, role) &&
      (format === "any" || g.format === format) &&
      (status === "any" || g.state === status) &&
      (length === "any" || lengthOf(g) === length),
  );
  const filtered = beforeGoal.filter((g) => goal === "any" || g.goals.includes(goal));
  const sorted = [...filtered].sort(sort === "az" ? byName : sort === "popular" ? byPopular : sort === "shortest" ? byShortest : byNewest);
  const filtering = Boolean(words.length) || goal !== "any" || role !== "any" || format !== "any" || status !== "any" || length !== "any";
  // Search and filter results show in full: they're the point then.
  const visible = filtering ? sorted.length : shown;
  // Only the goals, formats and roles the Magazine has.
  const goals = GUIDE_GOALS.filter((x) => guides.some((g) => g.goals.includes(x.value)));
  const formats = FORMATS.filter((f) => guides.some((g) => g.format === f.value));
  const roles = GUIDE_ROLES.filter((x) => guides.some((g) => g.roles.includes(x.value)));
  const reset = () => {
    roleChosen.current = true;
    setShown(ROW);
    setQ("");
    setGoal("any");
    setRole("any");
    setFormat("any");
    setStatus("any");
    setLength("any");
  };
  const rows = shelves(guides);
  const seeAll = (s: SeeAll) => {
    reset();
    if (s.sort) setSort(s.sort);
    if (s.length) setLength(s.length);
    if (s.format) setFormat(s.format);
    if (s.goal) setGoal(s.goal);
    requestAnimationFrame(() => everyStory.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  // The browse panel's closed line: what's chosen, or what it offers.
  const chosen = [
    words.length ? `“${q.trim()}”` : null,
    goals.find((x) => x.value === goal)?.label,
    GUIDE_ROLES.find((x) => x.value === role)?.label,
    FORMATS.find((f) => f.value === format)?.chip,
    PROGRESS[status],
    length !== "any" ? LENGTHS.find((x) => x.value === length)?.label : null,
  ].filter(Boolean);
  const chip = (active: boolean) =>
    cx(
      "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
      active ? "border-action bg-action text-on-action" : "border-line-strong bg-surface text-ink hover:bg-muted",
    );

  return (
    <div className="mt-8 flex flex-col gap-12">
      <section aria-labelledby="all-magazines">
        <BrowsePanel
          id="all-magazines"
          title="Browse the Magazine"
          count={filtering ? filtered.length : guides.length}
          active={filtering}
          startOpen={["q", "kind", "goal", "role", "status", "length"].some((k) => params.has(k))}
          storageKey="hub.browse.magazine"
          summary={filtering ? `Showing ${filtered.length}: ${chosen.join(" · ")}` : "Search, or filter by goal, role, format, progress and length"}
        >
          {/* Goals: what a story helps someone do, with how many match the rest of the choices. Growing the business first. */}
          {goals.length > 0 && (
            <div role="group" aria-label="Goal" className="scrollbar-none -mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <button type="button" aria-pressed={goal === "any"} onClick={() => setGoal("any")} className={chip(goal === "any")}>
                Everything <span className={cx("text-xs font-bold", goal === "any" ? "opacity-80" : "text-ink-muted")}>{beforeGoal.length}</span>
              </button>
              {goals.map((x) => {
                const n = beforeGoal.filter((g) => g.goals.includes(x.value)).length;
                return (
                  <button key={x.value} type="button" aria-pressed={goal === x.value} onClick={() => setGoal(x.value)} className={chip(goal === x.value)}>
                    <Icon name={GOAL_ICONS[x.value]} className="size-4" />
                    {x.label} <span className={cx("text-xs font-bold", goal === x.value ? "opacity-80" : "text-ink-muted")}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Search, filters and sort: the same toolbar as Topics and Discovery Paths. */}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
              Search
              <span className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input type="search" className={cx(field, "pl-9")} placeholder="A topic, title or word" value={q} onChange={(e) => setQ(e.target.value)} />
              </span>
            </label>
            {roles.length > 1 && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Your role
                <select
                  className={cx(field, "w-auto")}
                  value={role}
                  onChange={(e) => {
                    roleChosen.current = true;
                    setRole(e.target.value as Role);
                  }}
                >
                  <option value="any">Any role</option>
                  {roles.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formats.length > 1 && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Format
                <select className={cx(field, "w-auto")} value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                  <option value="any">Any format</option>
                  {formats.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.chip}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                {LENGTHS.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
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
            <p className="ml-auto flex flex-wrap items-center gap-3 pb-2.5 text-sm text-ink-muted" role="status">
              {filtering ? `Showing ${filtered.length} of ${guides.length}` : `${guides.length} ${guides.length === 1 ? "story" : "stories"}`}
              {filtering && (
                <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
                  Clear search and filters
                </button>
              )}
            </p>
          </div>
        </BrowsePanel>

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
            <Grid guides={sorted.slice(0, visible)} view="grid" canEdit={canEdit} />
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

const PROGRESS: Record<string, string> = {
  new: "Not started",
  "not-started": "Not started",
  started: "Started",
  "in-progress": "In progress",
  completed: "Completed",
};

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
      <Icon name={formatOf(g.format).icon} className="size-1/4 max-h-16 max-w-16" />
    </div>
  );
}

function State({ guide }: { guide: BrowseGuide }) {
  const s = STATE[guide.state];
  return s ? <span className={cx("self-start rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", s.tone)}>{s.text}</span> : null;
}

function Tile({ guide: g, canEdit, className }: { guide: BrowseGuide; canEdit: boolean; className?: string }) {
  return (
    <li className={cx("tile tile-card group relative flex flex-col", className)}>
      <div className="relative">
        <Cover guide={g} className="aspect-[16/10] w-full" />
        {g.featured && <FeaturedTag />}
        {/* On the picture (the owner, Nov 2026): what it is and how long bottom left, who it's for bottom right. */}
        <PictureTags
          items={[
            g.kind === "elearning"
              ? { icon: "monitor", text: "eLearning" }
              : g.format === "course"
                ? { icon: "layers", text: `${g.pages} pages` }
                : g.format === "simulation"
                  ? { icon: "target", text: "Simulation" }
                  : { icon: "magazine", text: "Guide" },
            ...(g.minutes != null ? [{ icon: "clock" as const, text: hoursAndMinutes(g.minutes) }] : []),
          ]}
          roles={g.roles}
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-xl font-semibold leading-snug">
          <Link href={g.href} className="tile-link">
            {g.title}
          </Link>
        </h3>
        {g.standfirst && <p className="line-clamp-3 text-ink-muted">{g.standfirst}</p>}
        <State guide={g} />
        <p className="mt-auto text-sm text-ink-muted">Added {formatDate(g.publishedAt)}</p>
        {canEdit && g.editHref && <EditLink href={g.editHref} />}
      </div>
    </li>
  );
}

function Row({ guide: g, canEdit }: { guide: BrowseGuide; canEdit: boolean }) {
  return (
    <li className="tile tile-row group relative flex items-center gap-4 p-3 sm:px-4">
      <Cover guide={g} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-mulish text-xs font-bold uppercase tracking-[0.1em] text-accent">{meta(g)}</p>
        <h3 className="font-semibold leading-snug">
          <Link href={g.href} className="tile-link">
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
