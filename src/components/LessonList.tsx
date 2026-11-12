"use client";

import Link from "next/link";
import type { Lesson } from "@/content/lessons";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { TopicSummary } from "@/lib/topicSummary";
import { SUBJECTS, subjectLabel } from "@/lib/subjects";
import { useHub, useHydrated } from "@/lib/store";
import { StoryVisual } from "./StoryVisual";
import { SaveButton } from "./SaveButton";
import { Icon } from "./Icon";
import { cx, formatDate } from "@/lib/format";
import { formatWhen, useApi, type FollowUpListItem, type Me } from "@/lib/api";

const trackLabel: Record<Lesson["track"], string> = {
  core: "For everyone",
  reinforcement: "Follow ups",
  partner: "Service partners",
  coordinator: "Coordinators",
  briefing: "Policy briefings",
};

type Sort = "recommended" | "newest" | "az" | "shortest" | "longest";
type Status = "any" | "not-started" | "in-progress" | "completed";
type Length = "any" | "short" | "medium" | "long";
type View = "grid" | "list";

const SORTS: { value: Sort; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest first" },
  { value: "az", label: "A to Z" },
  { value: "shortest", label: "Shortest first" },
  { value: "longest", label: "Longest first" },
];
const LENGTHS: { value: Length; label: string; test: (m: number) => boolean }[] = [
  { value: "any", label: "Any length", test: () => true },
  { value: "short", label: "Under 6 min", test: (m) => m < 6 },
  { value: "medium", label: "6 to 10 min", test: (m) => m >= 6 && m <= 10 },
  { value: "long", label: "Over 10 min", test: (m) => m > 10 },
];
const PAGE = 24;
const select = "h-11 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium";

/*
  The Learning page's catalogue, built for hundreds of topics: search, a subject to browse by,
  filters for who it's for, progress and length, sorting, a grid or a compact list, and "Show more".
  The choices live in the page address, so a filtered view can be bookmarked or shared.
*/
export function LessonList({ topics }: { topics: TopicSummary[] }) {
  const hydrated = useHydrated();
  const attempts = useHub((s) => s.lessons);
  const me = useApi<Me>("/api/me").data;
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [subject, setSubject] = useState<string>(params.get("subject") ?? "all");
  const [track, setTrack] = useState<string>(params.get("for") ?? "all");
  const [status, setStatusFilter] = useState<Status>((params.get("status") as Status) || "any");
  const [length, setLength] = useState<Length>((params.get("length") as Length) || "any");
  const [sort, setSort] = useState<Sort>((params.get("sort") as Sort) || "recommended");
  const [view, setView] = useState<View>((params.get("view") as View) || "grid");
  const [shown, setShown] = useState(PAGE);

  // Keep the choices in the address (without reloading), so Back and bookmarks bring them back.
  useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (subject !== "all") next.set("subject", subject);
    if (track !== "all") next.set("for", track);
    if (status !== "any") next.set("status", status);
    if (length !== "any") next.set("length", length);
    if (sort !== "recommended") next.set("sort", sort);
    if (view !== "grid") next.set("view", view);
    const qs = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [q, subject, track, status, length, sort, view]);

  const stateOf = (t: TopicSummary): Exclude<Status, "any"> => {
    const a = hydrated ? attempts[t.slug] : undefined;
    return !a ? "not-started" : a.status === "completed" ? "completed" : "in-progress";
  };
  const label = (t: TopicSummary) => {
    if (!hydrated) return null;
    const a = attempts[t.slug];
    if (!a) return { text: "Not started", cta: "Start" };
    if (a.status === "completed") return { text: `Completed ${a.completedAt ? formatDate(a.completedAt) : ""}`, cta: "Review", done: true };
    return { text: `In progress · step ${(t.stepOf[a.nodeId] ?? 0) + 1} of ${t.steps}`, cta: "Keep learning" };
  };

  const assigned = topics.filter((t) => t.assignment?.required);
  // Topics they enrolled in themselves (newest first), apart from ones already shown as assigned.
  const enrolments = useApi<{ topics: { slug: string }[] }>("/api/enrolments").data?.topics ?? [];
  const enrolledSlugs = new Set(enrolments.map((e) => e.slug));
  const enrolled = enrolments
    .map((e) => topics.find((t) => t.slug === e.slug))
    .filter((t): t is TopicSummary => Boolean(t) && !t!.assignment?.required)
    // Finished ones move to the end.
    .sort((a, b) => Number(stateOf(a) === "completed") - Number(stateOf(b) === "completed"));
  const spaced = useApi<{ lessons: Record<string, { stage: string; gap: number }[]> }>("/api/lessons/spaced").data?.lessons ?? {};
  const followUps = useApi<{ items: FollowUpListItem[] }>("/api/follow-ups").data?.items ?? [];
  const stepsFor = (slug: string) => followUps.filter((f) => f.base?.slug === slug);
  const signoffs = useApi<{ signoffs: Record<string, Signoff> }>("/api/signoffs").data?.signoffs ?? {};

  // Their own track first in "Recommended": a coordinator sees coordinator topics before partner ones.
  const mine = me?.user.audience === "coordinator" ? "coordinator" : me?.user.audience === "partner" ? "partner" : null;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const lengthTest = LENGTHS.find((x) => x.value === length)!.test;
  const base = topics.filter(
    (t) =>
      (track === "all" || t.track === track) &&
      (status === "any" || stateOf(t) === status) &&
      lengthTest(t.minutes) &&
      words.every((w) => `${t.title} ${t.summary} ${t.outcome} ${subjectLabel(t.subject)}`.toLowerCase().includes(w)),
  );
  // Subject counts reflect the other filters, so a chip never promises topics that aren't there.
  const counts = new Map<string, number>();
  for (const t of base) counts.set(t.subject ?? "other", (counts.get(t.subject ?? "other") ?? 0) + 1);
  const filtered = base.filter((t) => subject === "all" || (t.subject ?? "other") === subject);
  const rank = (t: TopicSummary) => {
    const s = stateOf(t);
    return (
      (s === "in-progress" ? 0 : s === "not-started" ? 2 : 4) - (t.assignment?.required ? 1 : 0) + (mine && t.track !== mine && t.track !== "core" ? 0.5 : 0)
    );
  };
  const subjectOrder = (t: TopicSummary) => {
    const i = SUBJECTS.findIndex((s) => s.id === t.subject);
    return i === -1 ? SUBJECTS.length : i;
  };
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "az") return a.title.localeCompare(b.title);
    if (sort === "shortest") return a.minutes - b.minutes || a.title.localeCompare(b.title);
    if (sort === "longest") return b.minutes - a.minutes || a.title.localeCompare(b.title);
    if (sort === "newest") return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || a.title.localeCompare(b.title);
    return rank(a) - rank(b) || subjectOrder(a) - subjectOrder(b) || a.title.localeCompare(b.title);
  });
  const filtering = Boolean(words.length) || subject !== "all" || track !== "all" || status !== "any" || length !== "any";
  const reset = () => {
    setQ("");
    setSubject("all");
    setTrack("all");
    setStatusFilter("any");
    setLength("any");
    setShown(PAGE);
  };
  const tracks = (["core", "partner", "coordinator", "briefing"] as const).filter((tr) => topics.some((t) => t.track === tr));

  return (
    <div className="mt-8 flex flex-col gap-12">
      {assigned.length > 0 && (
        <section aria-labelledby="assigned">
          <h2 id="assigned" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            Assigned to you
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {assigned.map((l) => {
              const s = label(l);
              return (
                <li key={l.slug} className="relative flex gap-4 rounded-3xl border-2 border-action/40 bg-tealtint p-4">
                  <StoryVisual {...l.visual} alt="" className="size-24 shrink-0 rounded-2xl" iconSize="size-6" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-mulish text-xs font-bold text-warm">Required{l.assignment?.due && ` · due ${formatDate(l.assignment.due)}`}</p>
                    <h3 className="font-serif text-xl font-semibold leading-snug">
                      <Link href={`/learning/${l.slug}`} className="after:absolute after:inset-0 after:content-['']">
                        {l.title}
                      </Link>
                    </h3>
                    <p className="text-sm text-ink-muted">{s?.text ?? " "}</p>
                    <span className="mt-auto inline-flex items-center gap-1 font-semibold text-accent">
                      {s?.cta ?? "Open"} <Icon name="arrow-right" className="size-4" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {enrolled.length > 0 && (
        <section aria-labelledby="enrolled">
          <h2 id="enrolled" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            Your topics
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {enrolled.map((l) => {
              const s = label(l);
              return (
                <li key={l.slug} className="relative flex gap-4 rounded-3xl border border-line bg-surface p-4">
                  <StoryVisual {...l.visual} alt="" className="size-24 shrink-0 rounded-2xl" iconSize="size-6" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="font-mulish text-xs font-bold text-accent">
                      Enrolled · {subjectLabel(l.subject)} · {l.minutes} min
                    </p>
                    <h3 className="font-serif text-xl font-semibold leading-snug">
                      <Link href={`/learning/${l.slug}`} className="after:absolute after:inset-0 after:content-['']">
                        {l.title}
                      </Link>
                    </h3>
                    <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                      {s?.done && <Icon name="check" className="size-4 text-accent" />}
                      {s?.text ?? " "}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1 font-semibold text-accent">
                      {s?.cta ?? "Open"} <Icon name="arrow-right" className="size-4" />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-topics">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="all-topics" className="font-serif text-2xl font-semibold">
            All topics <span className="text-base font-normal text-ink-muted">({topics.length})</span>
          </h2>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 sm:max-w-sm">
            <Icon name="search" className="size-4 shrink-0 text-ink-muted" />
            <span className="sr-only">Search topics</span>
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setShown(PAGE);
              }}
              placeholder="Search topics"
              className="min-h-11 w-full bg-transparent outline-none placeholder:text-ink-muted"
            />
          </label>
        </div>

        {/* Subjects: the main way to browse. */}
        <div
          role="group"
          aria-label="Subject"
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {[{ id: "all", label: "All subjects", icon: "list" as const }, ...SUBJECTS].map((s) => {
            const n = s.id === "all" ? base.length : (counts.get(s.id) ?? 0);
            const active = subject === s.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                disabled={!active && !n}
                onClick={() => {
                  setSubject(s.id);
                  setShown(PAGE);
                }}
                className={cx(
                  "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium disabled:opacity-40",
                  active ? "border-action bg-action text-on-action" : "border-line-strong hover:bg-muted",
                )}
              >
                <Icon name={s.icon} className="size-4" /> {s.label}
                <span className={cx("tabular-nums", active ? "text-on-action/80" : "text-ink-muted")}>{n}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="filter-for">
            Who it’s for
          </label>
          <select id="filter-for" className={select} value={track} onChange={(e) => (setTrack(e.target.value), setShown(PAGE))}>
            <option value="all">Everyone’s topics</option>
            {tracks.map((tr) => (
              <option key={tr} value={tr}>
                {trackLabel[tr]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-status">
            Your progress
          </label>
          <select id="filter-status" className={select} value={status} onChange={(e) => (setStatusFilter(e.target.value as Status), setShown(PAGE))}>
            <option value="any">Any progress</option>
            <option value="not-started">Not started</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
          <label className="sr-only" htmlFor="filter-length">
            Length
          </label>
          <select id="filter-length" className={select} value={length} onChange={(e) => (setLength(e.target.value as Length), setShown(PAGE))}>
            {LENGTHS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <span className="flex-1" />
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Sort
            <select className={select} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
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
        </div>

        <p role="status" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          {filtering ? `${filtered.length} of ${topics.length} topics` : `${topics.length} topics`}
          {filtering && (
            <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
              Clear filters
            </button>
          )}
        </p>

        {!sorted.length ? (
          <p className="mt-6 rounded-3xl border border-dashed border-line-strong p-8 text-center text-ink-muted">
            No topics match. Try another word, or{" "}
            <button type="button" onClick={reset} className="font-semibold text-accent hover:underline">
              clear the filters
            </button>
            .
          </p>
        ) : view === "grid" ? (
          <ul className="mt-5 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.slice(0, shown).map((l) => {
              const s = label(l);
              return (
                <li key={l.slug} className="group relative flex flex-col gap-3">
                  <StoryVisual {...l.visual} alt="" className="aspect-[16/10] rounded-2xl" />
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                      {subjectLabel(l.subject)} · {l.minutes} min{enrolledSlugs.has(l.slug) && " · Enrolled"}
                    </p>
                    <SaveButton id={`lesson:${l.slug}`} title={l.title} className="-mr-2 -mt-3" />
                  </div>
                  <h3 className="font-serif text-xl font-semibold leading-snug">
                    <Link
                      href={`/learning/${l.slug}`}
                      className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4"
                    >
                      {l.title}
                    </Link>
                  </h3>
                  <p className="text-ink-muted">{l.summary}</p>
                  <p className="flex items-center gap-2 font-mulish text-sm font-semibold">
                    {s?.done && <Icon name="check" className="size-4 text-accent" />}
                    {s?.text ?? " "}
                  </p>
                  {spaced[l.slug] && <SpacedStatus stages={spaced[l.slug]} steps={stepsFor(l.slug)} signoff={signoffs[l.slug]} slug={l.slug} />}
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="mt-5 flex flex-col divide-y divide-line rounded-3xl border border-line bg-surface">
            {sorted.slice(0, shown).map((l) => {
              const s = label(l);
              return (
                <li key={l.slug} className="group relative flex items-center gap-4 p-3 sm:px-4">
                  <StoryVisual {...l.visual} alt="" className="size-16 shrink-0 rounded-xl" iconSize="size-5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mulish text-xs font-bold uppercase tracking-[0.1em] text-accent">
                      {subjectLabel(l.subject)} · {l.minutes} min · {trackLabel[l.track]}
                      {enrolledSlugs.has(l.slug) && " · Enrolled"}
                    </p>
                    <h3 className="font-semibold leading-snug">
                      <Link
                        href={`/learning/${l.slug}`}
                        className="after:absolute after:inset-0 after:content-[''] group-hover:underline group-hover:underline-offset-4"
                      >
                        {l.title}
                      </Link>
                    </h3>
                    <p className="hidden truncate text-sm text-ink-muted sm:block">{l.summary}</p>
                  </div>
                  <p className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold sm:flex">
                    {s?.done && <Icon name="check" className="size-4 text-accent" />}
                    {s?.text.replace(/ · step.*/, "") ?? ""}
                  </p>
                  <SaveButton id={`lesson:${l.slug}`} title={l.title} />
                </li>
              );
            })}
          </ul>
        )}

        {sorted.length > shown && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-5 font-semibold hover:bg-muted"
            >
              Show more <span className="font-normal text-ink-muted">({sorted.length - shown} more)</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Where a learner is in a lesson's spaced follow ups. The next one ready links straight to it. */
type Signoff = { status: "after_follow_ups" | "waiting" | "confirmed" | "support"; manager: string | null; by?: string; at?: string; note?: string };

function SpacedStatus({ stages, steps, signoff, slug }: { stages: { stage: string }[]; steps: FollowUpListItem[]; signoff?: Signoff; slug: string }) {
  const ready = steps.find((f) => f.status === "available" || f.status === "in_progress");
  const next = steps.find((f) => f.status === "upcoming");
  const done = steps.filter((f) => f.status === "completed").length;
  const total = steps.length || stages.length;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="route" className="size-4 text-accent" /> Spaced learning
        {steps.length > 0 && (
          <span className="font-normal text-ink-muted">
            · {done} of {total} follow ups done
          </span>
        )}
      </p>
      <ol className="flex gap-1.5" aria-label="Follow ups">
        {(steps.length ? steps.map((f) => ({ stage: f.stage ?? f.title, status: f.status })) : stages.map((x) => ({ stage: x.stage, status: "planned" }))).map(
          (x, i) => (
            <li
              key={i}
              className={
                "rounded-full px-2 py-0.5 font-mulish text-xs font-bold " +
                (x.status === "completed"
                  ? "bg-action text-on-action"
                  : x.status === "available" || x.status === "in_progress"
                    ? "bg-gold text-ink"
                    : "border border-line-strong text-ink-muted")
              }
            >
              {x.status === "completed" && "✓ "}
              {x.stage}
            </li>
          ),
        )}
        {signoff && (
          <li
            className={cx(
              "rounded-full px-2 py-0.5 font-mulish text-xs font-bold",
              signoff.status === "confirmed"
                ? "bg-action text-on-action"
                : signoff.status === "after_follow_ups"
                  ? "border border-dashed border-line-strong text-ink-muted"
                  : "bg-gold text-ink",
            )}
          >
            {signoff.status === "confirmed" && "✓ "}Sign-off
          </li>
        )}
      </ol>
      {signoff?.status === "waiting" ? (
        <p className="text-ink-muted">All follow ups done. {signoff.manager ?? "Your manager"} will confirm you’re putting it into practice.</p>
      ) : signoff?.status === "confirmed" ? (
        <p>
          <span className="font-semibold">Signed off</span> by {signoff.by}
          {signoff.at && `, ${formatDate(signoff.at)}`}.{signoff.note && <span className="block text-ink-muted">“{signoff.note}”</span>}
        </p>
      ) : signoff?.status === "support" ? (
        <div>
          <p>
            <span className="font-semibold">{signoff.by} suggested more support:</span> “{signoff.note}”
          </p>
          <Link
            href={`/learning/${slug}`}
            className="relative z-10 inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline-offset-4 hover:underline"
          >
            Go over the topic again <Icon name="arrow-right" className="size-4" />
          </Link>
        </div>
      ) : ready ? (
        <Link
          href={ready.href}
          className="relative z-10 inline-flex min-h-11 items-center gap-1 self-start font-semibold text-accent underline-offset-4 hover:underline"
        >
          {ready.stage ?? "Follow up"} is ready <Icon name="arrow-right" className="size-4" />
        </Link>
      ) : next?.plannedRelease ? (
        <p className="text-ink-muted">
          {next.stage ?? "Next follow up"} arrives {formatWhen(next.plannedRelease, next.timezone)}
        </p>
      ) : !steps.length ? (
        <p className="text-ink-muted">Starts when you finish the topic.</p>
      ) : null}
    </div>
  );
}
