"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cx, formatDate, formatHoursMinutes } from "@/lib/format";
import { Icon } from "./Icon";
import { StoryVisual } from "./StoryVisual";

/*
  The Learning paths page, laid out like Learning: the person's own paths, then "All paths" with the
  same search and filters (audience, progress, length and sort), four to a row on a computer. Search
  also looks in the titles of the topics in each path, so "invoice" finds the path that teaches it.
  The choices live in the page address, as on Learning, so a filtered view can be bookmarked or shared.
  Tiles or a compact list, with the same switch as Learning.
*/

export type BrowsePath = {
  id: string;
  name: string;
  description: string;
  audience: string;
  topics: number;
  minutes: number;
  thumbnail: Parameters<typeof StoryVisual>[0] | null;
  assigned: boolean;
  selfEnrolled: boolean;
  started: boolean;
  done: boolean;
  completed: number;
  total: number;
  dueDate: string | null;
  /** The titles of the topics in the path, for search. */
  topicTitles: string[];
};

type Sort = "recommended" | "az" | "za" | "shortest" | "longest" | "most";
type Status = "any" | "not-started" | "in-progress" | "completed";
type Length = "any" | "short" | "medium" | "long";
type View = "grid" | "list";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "az", label: "Name A–Z" },
  { value: "za", label: "Name Z–A" },
  { value: "shortest", label: "Shortest first" },
  { value: "longest", label: "Longest first" },
  { value: "most", label: "Most topics" },
];
const LENGTHS: { value: Length; label: string; test: (m: number) => boolean }[] = [
  { value: "any", label: "Any length", test: () => true },
  { value: "short", label: "Under 1 hour", test: (m) => m < 60 },
  { value: "medium", label: "1 to 3 hours", test: (m) => m >= 60 && m <= 180 },
  { value: "long", label: "Over 3 hours", test: (m) => m > 180 },
];
/** The same fields as Learning and the admin Topics page. */
const field = "min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[0.98rem] font-normal";

const stateOf = (p: BrowsePath): Exclude<Status, "any"> => (p.done ? "completed" : p.started ? "in-progress" : "not-started");

export function PathsBrowser({ paths }: { paths: BrowsePath[] }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [audience, setAudience] = useState(params.get("for") ?? "all");
  const [status, setStatus] = useState<Status>((params.get("status") as Status) || "any");
  const [length, setLength] = useState<Length>((params.get("length") as Length) || "any");
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "recommended");
  const [view, setView] = useState<View>((params.get("view") as View) || "grid");

  // Keep the choices in the address (without reloading), so Back and bookmarks bring them back.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (audience !== "all") next.set("for", audience);
    if (status !== "any") next.set("status", status);
    if (length !== "any") next.set("length", length);
    if (sort !== "recommended") next.set("sort", sort);
    if (view !== "grid") next.set("view", view);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [q, audience, status, length, sort, view]);

  const audiences = [...new Set(paths.map((p) => p.audience).filter(Boolean))].sort();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const lengthTest = LENGTHS.find((x) => x.value === length)!.test;
  const filtered = paths.filter(
    (p) =>
      (audience === "all" || p.audience === audience) &&
      (status === "any" || stateOf(p) === status) &&
      lengthTest(p.minutes) &&
      words.every((w) => [p.name, p.description, p.audience, ...p.topicTitles].join(" ").toLowerCase().includes(w)),
  );
  // Recommended: assigned and due first, then ones under way, then new ones, finished ones last.
  const rank = (p: BrowsePath) => (p.done ? 4 : p.started ? 1 : 2) - (p.assigned ? 1 : 0);
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "az") return a.name.localeCompare(b.name);
    if (sort === "za") return b.name.localeCompare(a.name);
    if (sort === "shortest") return a.minutes - b.minutes || a.name.localeCompare(b.name);
    if (sort === "longest") return b.minutes - a.minutes || a.name.localeCompare(b.name);
    if (sort === "most") return b.topics - a.topics || a.name.localeCompare(b.name);
    return rank(a) - rank(b) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || a.name.localeCompare(b.name);
  });
  const filtering = Boolean(words.length) || audience !== "all" || status !== "any" || length !== "any";
  const reset = () => {
    setQ("");
    setAudience("all");
    setStatus("any");
    setLength("any");
  };
  const mine = paths.filter((p) => p.assigned || p.selfEnrolled);

  return (
    <div className="mt-8 flex flex-col gap-12">
      {mine.length > 0 && (
        <section aria-labelledby="your-paths">
          <h2 id="your-paths" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            {mine.every((p) => p.assigned) ? "Assigned to you" : "Your paths"}
          </h2>
          <PathGrid paths={mine} view={view} />
        </section>
      )}

      <section aria-labelledby="all-paths">
        <h2 id="all-paths" className="font-serif text-2xl font-semibold">
          All paths <span className="text-base font-normal text-ink-muted">({paths.length})</span>
        </h2>

        {/* Search, filters and sort: the same toolbar as Learning. */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold sm:max-w-xs">
            Search
            <span className="relative">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input type="search" className={cx(field, "pl-9")} placeholder="Path name or a topic in it" value={q} onChange={(e) => setQ(e.target.value)} />
            </span>
          </label>
          {audiences.length > 1 && (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Audience
              <select className={cx(field, "w-auto max-w-[16rem]")} value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">All audiences</option>
                {audiences.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Your progress
            <select className={cx(field, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="any">Any progress</option>
              <option value="not-started">Not started</option>
              <option value="in-progress">In progress</option>
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
            {filtering ? `Showing ${filtered.length} of ${paths.length}` : `${paths.length} paths`}
            {filtering && (
              <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
                Clear search and filters
              </button>
            )}
          </p>
        </div>

        {sorted.length ? (
          <div className="mt-5">
            <PathGrid paths={sorted} view={view} />
          </div>
        ) : (
          <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
            No learning paths match. Try another word, or{" "}
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

function PathGrid({ paths, view }: { paths: BrowsePath[]; view: View }) {
  if (view === "list")
    return (
      <ul className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
        {paths.map((p) => (
          <PathRow key={p.id} path={p} />
        ))}
      </ul>
    );
  return (
    <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
      {paths.map((p) => (
        <PathTile key={p.id} path={p} />
      ))}
    </ul>
  );
}

/** A path as one compact row: thumbnail, what it is, and where the person is in it. */
function PathRow({ path: p }: { path: BrowsePath }) {
  const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
  return (
    <li className="group relative flex items-center gap-4 p-3 sm:px-4">
      {p.thumbnail ? (
        <StoryVisual {...p.thumbnail} alt="" className="size-16 shrink-0 rounded-xl" iconSize="size-5" />
      ) : (
        <div className="size-16 shrink-0 rounded-xl bg-tealtint" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-mulish text-xs font-bold uppercase tracking-[0.1em] text-accent">
          {p.topics} {p.topics === 1 ? "topic" : "topics"} · {formatHoursMinutes(p.minutes)}
          {p.audience && ` · ${p.audience}`}
          {(p.assigned || p.selfEnrolled) && (p.assigned ? " · Assigned to you" : " · Enrolled")}
        </p>
        <h3 className="font-semibold leading-snug">
          <Link href={`/paths/${p.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
            {p.name}
          </Link>
        </h3>
        {p.description && <p className="hidden truncate text-sm text-ink-muted sm:block">{p.description}</p>}
      </div>
      {p.dueDate && !p.done && <p className="hidden shrink-0 font-mulish text-sm font-bold text-warm md:block">Due {formatDate(p.dueDate)}</p>}
      <div className="hidden w-36 shrink-0 text-sm sm:block">
        {p.done ? (
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="check" className="size-4 text-accent" /> Completed
          </p>
        ) : p.started ? (
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${p.completed} of ${p.total} topics finished`}>
              <div className="h-full bg-action" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-ink-muted">
              {p.completed}/{p.total}
            </span>
          </div>
        ) : (
          <p className="text-ink-muted">Not started</p>
        )}
      </div>
      <Icon name="arrow-right" className="size-4 shrink-0 text-accent" />
    </li>
  );
}

function PathTile({ path: p }: { path: BrowsePath }) {
  const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
  const cta = p.done ? "Revisit path" : p.started ? "Continue" : "Start path";
  return (
    <li className="group relative flex flex-col gap-3">
      {p.thumbnail ? <StoryVisual {...p.thumbnail} alt="" className="aspect-[16/10] rounded-2xl" /> : <div className="aspect-[16/10] rounded-2xl bg-tealtint" aria-hidden />}
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
        {p.topics} {p.topics === 1 ? "topic" : "topics"} · {formatHoursMinutes(p.minutes)}
        {p.audience && ` · ${p.audience}`}
      </p>
      {(p.selfEnrolled || p.assigned) && <p className="-mt-1 font-mulish text-sm font-bold text-success">{p.assigned ? "Assigned to you" : "Enrolled"}</p>}
      <h3 className="font-serif text-xl font-semibold leading-snug">
        <Link href={`/paths/${p.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4">
          {p.name}
        </Link>
      </h3>
      {p.description && <p className="line-clamp-3 text-ink-muted">{p.description}</p>}
      {p.dueDate && !p.done && <p className="font-mulish text-sm font-bold text-warm">Due {formatDate(p.dueDate)}</p>}
      {p.started && (
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${p.completed} of ${p.total} topics finished`}>
            <div className="h-full bg-action" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-ink-muted">
            {p.completed} of {p.total}
          </span>
        </div>
      )}
      <span className="mt-auto inline-flex items-center gap-1 font-semibold text-accent">
        {cta} <Icon name="arrow-right" className="size-4" />
      </span>
    </li>
  );
}
