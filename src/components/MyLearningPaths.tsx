"use client";

import { OfflineButton } from "./OfflineButton";
import Link from "next/link";
import { useApi } from "@/lib/api";
import { useHub, useHydrated } from "@/lib/store";
import { cx, formatDate, formatDuration } from "@/lib/format";
import { Icon } from "./Icon";
import { Confetti } from "./Confetti";
import { celebrated, markCelebrated } from "@/lib/celebrations";
import { useEffect, useState } from "react";

/** `draft`: still being written. Shown as coming soon, not counted, can't be opened yet. */
type Step = { slug: string; title: string; minutes: number; completedAt: string | null; draft?: boolean };
export type PathChapter = { id: string; title: string; description: string; stage: string; slugs: string[] };
export type MyPath = {
  id: string;
  name: string;
  description: string;
  inOrder: boolean;
  dueDate: string | null;
  steps: Step[];
  chapters?: PathChapter[];
  /** The overview on the path's own page. */
  whoFor?: string;
  outcomes?: string[];
  reward?: string;
};
/** "about 2 hours" in the middle of a sentence. */
const lowerDuration = (m: number) => formatDuration(m).replace(/^About/, "about");

/** Learning paths assigned to the signed-in person: progress, what's next and the due date. */
export function MyLearningPaths() {
  const { data } = useApi<{ paths: MyPath[] }>("/api/learning-paths");
  if (!data?.paths.length) return null;

  return (
    <section aria-labelledby="my-paths" className="mt-8">
      <h2 id="my-paths" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
        Your learning paths
      </h2>
      <ul className="grid gap-4 lg:grid-cols-2">
        {data.paths.map((p) => (
          <PathCard key={p.id} path={p} />
        ))}
      </ul>
    </section>
  );
}

/**
  One learning path: progress, its lessons in order, the due date and what to do next.
  `preview`: an author checking the path. Every lesson opens, drafts included, and nothing is recorded.
  `intro`: false on the path's own page, which shows the name and overview above the card.
*/
export function PathCard({ path: p, preview = false, intro = true }: { path: MyPath; preview?: boolean; intro?: boolean }) {
  const hydrated = useHydrated();
  const attempts = useHub((s) => s.lessons);
  // Completions recorded on this device count too, so progress matches the lesson tiles.
  const isDone = (s: Step) => !preview && (Boolean(s.completedAt) || (hydrated && attempts[s.slug]?.status === "completed"));
  const live = p.steps.filter((s) => !s.draft);
  const done = live.filter(isDone).length;
  const nextIndex = preview ? 0 : p.steps.findIndex((s) => !s.draft && !isDone(s));
  const href = (slug: string) => (preview ? `/learning/${slug}?preview=1&path=${encodeURIComponent(p.id)}` : `/learning/${slug}`);
  const next = p.steps[nextIndex];
  const soon = p.steps.length - live.length;
  // Time still to go, counting lessons that are coming soon.
  const left = p.steps.filter((s) => !isDone(s)).reduce((n, s) => n + s.minutes, 0);
  // Finished, but not yet celebrated on this device: confetti.
  const [party, setParty] = useState(false);
  // Only a whole path counts: nothing still coming soon.
  const finished = live.length > 0 && done === live.length && soon === 0;
  useEffect(() => {
    if (!hydrated || !finished || celebrated(p.id)) return;
    // Marked only when it actually starts, so a re-run effect can't cancel it after marking.
    const t = window.setTimeout(() => {
      markCelebrated(p.id);
      setParty(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, [hydrated, finished, p.id]);

  /** One topic row; `number` is its place in its chapter (or in the path). */
  const topic = (s: Step, i: number, number: number) => {
    const complete = !s.draft && isDone(s);
    const locked = !preview && !s.draft && p.inOrder && !complete && nextIndex !== -1 && i > nextIndex;
    const current = i === nextIndex;
    const closed = locked || (s.draft && !preview);
    const row = (
      <>
        <span
          className={cx(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mulish text-xs font-extrabold",
            complete ? "bg-action text-on-action" : current ? "bg-gold text-ink" : "border border-line-strong text-ink-muted",
          )}
        >
          {complete ? <Icon name="check" className="size-3.5" /> : closed ? <Icon name="lock" className="size-3.5" /> : number}
        </span>
        <span className={cx("min-w-0 flex-1 leading-snug", closed && "text-ink-muted", current && "font-semibold")}>{s.title}</span>
        <span className="shrink-0 text-sm text-ink-muted">
          {s.draft ? (preview ? `Draft · ${s.minutes} min` : "Coming soon") : complete ? "Done" : locked ? "After the one before" : `${s.minutes} min`}
        </span>
      </>
    );
    return (
      <li key={s.slug}>
        {closed ? (
          <span className="flex min-h-11 items-center gap-3 rounded-xl px-2">{row}</span>
        ) : (
          <Link href={href(s.slug)} className={cx("flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted", current && "bg-tealtint")}>
            {row}
          </Link>
        )}
      </li>
    );
  };
  const started = done > 0 || (hydrated && p.steps.some((s) => attempts[s.slug]));
  return (
    <li className="flex flex-col gap-4 rounded-3xl border-2 border-action/30 bg-surface p-5">
      {party && <Confetti />}
      {(intro || (next && p.dueDate)) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {intro && (
            <div className="min-w-0">
              <h3 className="font-serif text-2xl font-semibold leading-snug">{p.name}</h3>
              {p.description && <p className="mt-1 text-ink-muted">{p.description}</p>}
              <p className="mt-1 text-sm text-ink-muted">
                {formatDuration(p.steps.reduce((n, s) => n + s.minutes, 0))} in {p.steps.length} short {p.steps.length === 1 ? "lesson" : "lessons"}.{" "}
                <Link href={`/paths/${encodeURIComponent(p.id)}`} className="font-semibold text-accent hover:underline">
                  About this path
                </Link>
              </p>
            </div>
          )}
          {next && p.dueDate && <span className="rounded-full bg-gold/25 px-3 py-1 font-mulish text-xs font-bold">Due {formatDate(p.dueDate)}</span>}
        </div>
      )}
      {preview ? (
        <p className="font-mulish text-sm font-bold">
          {p.steps.length} {p.steps.length === 1 ? "lesson" : "lessons"}
          {soon > 0 && <span className="font-normal text-ink-muted"> · {soon} still in draft</span>}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${done} of ${live.length} lessons done`}>
              <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${live.length ? (done / live.length) * 100 : 0}%` }} />
            </div>
            <span className="font-mulish text-sm font-bold">
              {done} of {live.length}
              {soon > 0 && <span className="font-normal text-ink-muted"> · {soon} coming soon</span>}
            </span>
          </div>
          {done > 0 && !finished && left > 0 && <p className="-mt-2 text-sm text-ink-muted">{formatDuration(left)} to go. Your place is saved.</p>}
          <OfflineButton lessons={live.map((s) => ({ slug: s.slug }))} />
        </>
      )}
      {p.chapters?.length ? (
        <div className="flex flex-col gap-2">
          {p.chapters.map((c, ci) => {
            const steps = c.slugs.map((slug) => p.steps.find((x) => x.slug === slug)).filter((x): x is Step => Boolean(x));
            const liveHere = steps.filter((x) => !x.draft);
            const doneHere = liveHere.filter(isDone).length;
            const hasNext = Boolean(next && c.slugs.includes(next.slug));
            const showStage = c.stage && (ci === 0 || p.chapters![ci - 1].stage !== c.stage);
            return (
              <div key={c.id}>
                {showStage && <p className="mb-1 mt-3 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{c.stage}</p>}
                <details open={hasNext} className="group rounded-2xl border border-line">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-3">
                    <span className="font-serif text-lg font-semibold text-accent tabular-nums">{String(ci + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{c.title}</span>
                      <span className="block text-sm text-ink-muted">
                        {steps.length} {steps.length === 1 ? "topic" : "topics"} · {lowerDuration(steps.reduce((n, x) => n + x.minutes, 0))}
                        {!preview && liveHere.length > 0 && ` · ${doneHere} of ${liveHere.length} done`}
                      </span>
                      {c.description && <span className="mt-0.5 block text-sm text-ink-muted">{c.description}</span>}
                    </span>
                    {liveHere.length > 0 && liveHere.length === steps.length && doneHere === liveHere.length ? (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-on-action">
                        <Icon name="check" className="size-4" />
                      </span>
                    ) : (
                      <Icon name="chevron-down" className="mt-1 size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                    )}
                  </summary>
                  <ol className="flex flex-col gap-1 px-2 pb-2">{steps.map((x, ti) => topic(x, p.steps.indexOf(x), ti + 1))}</ol>
                </details>
              </div>
            );
          })}
        </div>
      ) : (
        <ol className="flex flex-col gap-1">{p.steps.map((x, i) => topic(x, i, i + 1))}</ol>
      )}
      {next ? (
        <Link
          href={href(next.slug)}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
        >
          {preview ? "Start preview" : started ? "Continue" : "Start"}: {next.title} <Icon name="arrow-right" className="size-4" />
        </Link>
      ) : live.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold text-accent">
            <Icon name="check" className="size-5" /> {soon ? "All available lessons done. More are coming soon." : "Path complete"}
          </p>
          {finished && !preview && (
            <Link
              href={`/paths/${encodeURIComponent(p.id)}/certificate`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
            >
              <Icon name="star" className="size-4" /> Get your certificate
            </Link>
          )}
        </div>
      ) : (
        <p className="text-ink-muted">The lessons in this path are coming soon.</p>
      )}
    </li>
  );
}
