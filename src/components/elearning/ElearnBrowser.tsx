"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "../Icon";
import { minutes, outcomeText, outcomeTone, type Outcome } from "./status";

/*
  eLearn, laid out like Discovery Paths: the courses the person has started, then "All courses" with the
  same toolbar (search, progress, sort, tiles or a list). The choices live in the page address, so a
  filtered view can be bookmarked or shared.
*/

export type BrowseCourse = {
  id: string;
  title: string;
  description: string;
  /** The course's poster picture; without one, a teal cover with a screen. */
  poster: string | null;
  edition: string;
  publishedAt: string | null;
  attempt: {
    number: number;
    outcome: Outcome;
    score: number | null;
    scoreMax: number | null;
    totalSeconds: number;
    lastActivityAt: string | null;
  } | null;
};

type Sort = "az" | "recommended" | "newest" | "za";
type Status = "any" | "not-started" | "in-progress" | "completed" | "failed";
type View = "grid" | "list";

const SORTS: { value: Sort; label: string }[] = [
  { value: "az", label: "Name A–Z" },
  { value: "recommended", label: "Suggested for you" },
  { value: "newest", label: "Newest first" },
  { value: "za", label: "Name Z–A" },
];
/** One row to start (four on a computer); "Show more" adds three rows at a time, as on Topics and Discovery Paths. */
const ROW = 4;
const MORE = 12;

/** The same fields as Topics and Discovery Paths. */
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem] font-normal";

const outcomeOf = (c: BrowseCourse): Outcome => c.attempt?.outcome ?? "not_started";
const stateOf = (c: BrowseCourse): Exclude<Status, "any"> => {
  const o = outcomeOf(c);
  return o === "not_started" ? "not-started" : o === "in_progress" ? "in-progress" : o === "failed" ? "failed" : "completed";
};
/** Suggested for you: under way first, then new ones, then ones to try again, finished ones last. */
const RANK: Record<Exclude<Status, "any">, number> = { "in-progress": 0, "not-started": 1, failed: 2, completed: 3 };

const cta: Record<Outcome, string> = {
  not_started: "Start course",
  in_progress: "Continue",
  failed: "Try again",
  completed: "Revisit course",
  passed: "Revisit course",
};

export function ElearnBrowser({ courses }: { courses: BrowseCourse[] }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "any");
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "az");
  const [view, setView] = useState<View>((params.get("view") as View) || "grid");
  const [shown, setShown] = useState(ROW);

  // Keep the choices in the address (without reloading), so Back and bookmarks bring them back.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (status !== "any") next.set("status", status);
    if (sort !== "az") next.set("sort", sort);
    if (view !== "grid") next.set("view", view);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [q, status, sort, view]);

  if (!courses.length)
    return (
      <p className="mt-10 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
        There are no eLearning courses yet. New ones will appear here.
      </p>
    );

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = courses.filter(
    (c) => (status === "any" || stateOf(c) === status) && words.every((w) => `${c.title} ${c.description}`.toLowerCase().includes(w)),
  );
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "za") return b.title.localeCompare(a.title);
    if (sort === "newest") return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.title.localeCompare(b.title);
    if (sort === "recommended") return RANK[stateOf(a)] - RANK[stateOf(b)] || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title);
  });
  const filtering = Boolean(words.length) || status !== "any";
  // Search and filter results show in full: they're the point then.
  const visible = filtering ? sorted.length : shown;
  const reset = () => {
    setShown(ROW);
    setQ("");
    setStatus("any");
  };
  // Theirs: every course they've opened, the most recent first.
  const mine = courses
    .filter((c) => c.attempt)
    .sort((a, b) => (b.attempt!.lastActivityAt ?? "").localeCompare(a.attempt!.lastActivityAt ?? ""));
  const failedAny = courses.some((c) => outcomeOf(c) === "failed");

  return (
    <div className="mt-8 flex flex-col gap-12">
      {mine.length > 0 && (
        <section aria-labelledby="your-courses">
          <h2 id="your-courses" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            Your courses
          </h2>
          <CourseGrid courses={mine} view={view} />
        </section>
      )}

      <section aria-labelledby="all-courses">
        <h2 id="all-courses" className="font-serif text-2xl font-semibold">
          {filtering ? "Results" : "All courses"} <span className="text-base font-normal text-ink-muted">({filtering ? filtered.length : courses.length})</span>
        </h2>

        {/* Search, filters and sort: the same toolbar as Topics and Discovery Paths. */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
            Search
            <span className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input type="search" className={cx(field, "pl-9")} placeholder="Course name or a word in it" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your progress
            <select className={cx(field, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="any">Any progress</option>
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
              <option value="completed">Completed</option>
              {(failedAny || status === "failed") && <option value="failed">To try again</option>}
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
            {filtering ? `Showing ${filtered.length} of ${courses.length}` : `${courses.length} ${courses.length === 1 ? "course" : "courses"}`}
            {filtering && (
              <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
                Clear search and filters
              </button>
            )}
          </p>
        </div>

        {sorted.length ? (
          <div className="mt-6">
            <CourseGrid courses={sorted.slice(0, visible)} view={view} />
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
            No courses match. Try another word, or{" "}
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

function CourseGrid({ courses, view }: { courses: BrowseCourse[]; view: View }) {
  if (view === "list")
    return (
      <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
        {courses.map((c) => (
          <CourseRow key={c.id} course={c} />
        ))}
      </ul>
    );
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {courses.map((c) => (
        <CourseTile key={c.id} course={c} />
      ))}
    </ul>
  );
}

/** Where the person is on a course, as a small badge: the outcome, with the score when there is one. */
function Progress({ course: c }: { course: BrowseCourse }) {
  const o = outcomeOf(c);
  const a = c.attempt;
  return (
    <span className={cx("self-start rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", outcomeTone[o])}>
      {outcomeText[o]}
      {a?.score != null ? ` · ${a.score}${a.scoreMax ? `/${a.scoreMax}` : ""}` : ""}
    </span>
  );
}

/** The meta line: the course kind, and time spent or when it was added. */
const meta = (c: BrowseCourse) =>
  [
    "Course",
    `SCORM ${c.edition}`,
    c.attempt?.totalSeconds ? `${minutes(c.attempt.totalSeconds)} spent` : c.publishedAt ? `Added ${formatDate(c.publishedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** The course's poster, or without one a teal cover with a screen, in the banner's colours. */
function Cover({ poster, className }: { poster: string | null; className?: string }) {
  if (poster)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={poster} alt="" loading="lazy" className={cx("bg-muted object-cover", className)} />;
  return (
    <div className={cx("relative grid place-items-center overflow-hidden bg-[#008282] text-white", className)} aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 320 200">
        <circle cx="290" cy="20" r="80" fill="#3cb8b9" opacity="0.4" />
        <circle cx="40" cy="190" r="56" fill="#fab53d" opacity="0.3" />
        <circle cx="300" cy="185" r="30" fill="#c7393e" opacity="0.35" />
      </svg>
      <Icon name="monitor" className="relative size-1/4 max-h-14 max-w-14" />
    </div>
  );
}

function CourseRow({ course: c }: { course: BrowseCourse }) {
  return (
    <li className="group relative flex items-center gap-4 p-3 sm:px-4">
      <Cover poster={c.poster} className="size-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-mulish text-xs font-bold uppercase tracking-[0.1em] text-accent">{meta(c)}</p>
        <h3 className="font-semibold leading-snug">
          <Link href={`/elearning/${c.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
            {c.title}
          </Link>
        </h3>
        {c.description && <p className="hidden truncate text-sm text-ink-muted sm:block">{c.description}</p>}
      </div>
      <div className="hidden w-40 shrink-0 sm:flex">
        <Progress course={c} />
      </div>
      <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
    </li>
  );
}

function CourseTile({ course: c }: { course: BrowseCourse }) {
  return (
    <li className="group relative flex flex-col gap-3">
      <Cover poster={c.poster} className="aspect-[16/10] w-full rounded-2xl" />
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">{meta(c)}</p>
      <h3 className="font-serif text-xl font-semibold leading-snug">
        <Link href={`/elearning/${c.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
          {c.title}
        </Link>
      </h3>
      {c.description && <p className="line-clamp-3 text-ink-muted">{c.description}</p>}
      <Progress course={c} />
      <span className="mt-auto inline-flex items-center gap-1 font-semibold text-accent">
        {cta[outcomeOf(c)]} <Icon name="arrow-right" className="size-4" />
      </span>
    </li>
  );
}
