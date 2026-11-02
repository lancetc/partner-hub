"use client";

import { OfflineButton } from "./OfflineButton";
import Link from "next/link";
import { useApi } from "@/lib/api";
import { useHub, useHydrated } from "@/lib/store";
import { cx, formatDate, formatDuration } from "@/lib/format";
import { Icon, type IconName } from "./Icon";
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
  whoPhoto?: string;
  outcomes?: string[];
  reward?: string;
};

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

  // The topic people are partway through, if any, so its row says "In progress" rather than "Up next".
  const inProgress = (s: Step) => hydrated && !isDone(s) && attempts[s.slug]?.status === "in_progress";

  /** One topic: completed, continue (the next one), not started, locked, or coming soon. */
  const topic = (s: Step, i: number) => {
    const complete = !s.draft && isDone(s);
    const locked = !preview && !s.draft && p.inOrder && !complete && nextIndex !== -1 && i > nextIndex;
    const current = i === nextIndex;
    const closed = locked || (s.draft && !preview);
    const status = s.draft
      ? preview
        ? `Draft · ${s.minutes} min`
        : "Coming soon"
      : complete
        ? `Completed · ${s.minutes} min`
        : locked
          ? "Opens after the one before"
          : current
            ? `${inProgress(s) ? "In progress" : "Up next"} · ${s.minutes} min`
            : inProgress(s)
              ? `In progress · ${s.minutes} min`
              : `${s.minutes} min`;
    const marker = complete ? (
      <Icon name="circle-check" className="size-6 shrink-0 text-success" label="Completed" />
    ) : current ? (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0e7c7b] text-white">
        <Icon name="play" className="size-3.5" label="Continue learning" />
      </span>
    ) : closed ? (
      <Icon name="lock" className="size-5 shrink-0 text-ink-muted" label={s.draft ? "Coming soon" : "Locked"} />
    ) : (
      <span role="img" aria-label="Not started" className="mx-1 size-4 shrink-0 rounded-full bg-[#9aa3ad]" />
    );
    const row = (
      <>
        <span className="grid w-8 shrink-0 place-items-center">{marker}</span>
        <span className="min-w-0 flex-1">
          <span className={cx("block leading-snug", closed ? "text-ink-muted" : "font-medium", current && "text-[#0b4f4e] dark:text-ink")}>{s.title}</span>
          <span className="block text-xs text-ink-muted">{status}</span>
        </span>
        {complete && <Icon name="check" className="size-4 shrink-0 text-success" />}
        {current && <Icon name="arrow-right" className="size-4 shrink-0 text-action" />}
      </>
    );
    return (
      <li key={s.slug}>
        {closed ? (
          <span className="flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2">{row}</span>
        ) : (
          <Link
            href={href(s.slug)}
            className={cx(
              "flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2",
              current ? "bg-[#DCECE5] ring-1 ring-[#0e7c7b]/15 hover:bg-[#d1e6dc] dark:bg-tealtint" : "hover:bg-surface",
            )}
          >
            {row}
          </Link>
        )}
      </li>
    );
  };
  const started = done > 0 || (hydrated && p.steps.some((s) => attempts[s.slug]));
  /** Every topic in a stage's chapters. */
  const stageSteps = (stage: string) =>
    (p.chapters ?? [])
      .filter((x) => x.stage === stage)
      .flatMap((x) => x.slugs)
      .map((slug) => p.steps.find((x) => x.slug === slug))
      .filter((x): x is Step => Boolean(x));
  const percent = live.length ? Math.round((done / live.length) * 100) : 0;
  return (
    <li className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      {party && <Confetti />}
      {/* The path, how far through it they are, and how long is left. */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {!intro && !preview && <h2 className="text-xl font-semibold leading-snug">Your progress</h2>}
          {intro && (
            <>
              <p className="font-mulish text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">Your learning path</p>
              <h3 className="mt-1 text-xl font-semibold leading-snug">{p.name}</h3>
              {p.description && <p className="mt-1 text-sm text-ink-muted">{p.description}</p>}
              <p className="mt-1 text-sm">
                <Link href={`/paths/${encodeURIComponent(p.id)}`} className="font-semibold text-accent hover:underline">
                  About this path
                </Link>
              </p>
            </>
          )}
          {next && p.dueDate && (
            <span className="mt-2 inline-block rounded-full bg-muted px-3 py-1 font-mulish text-xs font-bold">Due {formatDate(p.dueDate)}</span>
          )}
        </div>
        {!preview && (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-lg font-semibold tabular-nums" aria-hidden>
            {percent}%
          </span>
        )}
      </div>
      {preview ? (
        <p className="font-mulish text-sm font-bold">
          {p.steps.length} {p.steps.length === 1 ? "topic" : "topics"}
          {soon > 0 && <span className="font-normal text-ink-muted"> · {soon} still in draft</span>}
        </p>
      ) : (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${percent}% complete: ${done} of ${live.length} topics`}>
            <div className="h-full rounded-full bg-[#0e7c7b] transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>
              {done} of {live.length} topics completed{soon > 0 && ` · ${soon} coming soon`}
            </span>
            {!finished && left > 0 && <span>{formatDuration(left)} remaining</span>}
          </p>
        </div>
      )}

      {p.chapters?.length ? (
        <div className="flex flex-col gap-3">
          {p.chapters.map((c, ci) => {
            const steps = c.slugs.map((slug) => p.steps.find((x) => x.slug === slug)).filter((x): x is Step => Boolean(x));
            const liveHere = steps.filter((x) => !x.draft);
            const doneHere = liveHere.filter(isDone).length;
            const hasNext = Boolean(next && c.slugs.includes(next.slug));
            const chapterDone = !preview && liveHere.length > 0 && liveHere.length === steps.length && doneHere === liveHere.length;
            const chapterGoing = !preview && !chapterDone && (doneHere > 0 || liveHere.some(inProgress));
            const showStage = c.stage && (ci === 0 || p.chapters![ci - 1].stage !== c.stage);
            const stageNumber = showStage
              ? new Set(
                  p
                    .chapters!.slice(0, ci + 1)
                    .map((x) => x.stage)
                    .filter(Boolean),
                ).size
              : 0;
            return (
              <div key={c.id}>
                {showStage && (
                  <div className="mb-2 mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="flex items-center gap-2 font-mulish text-xs font-bold uppercase tracking-[0.12em]">
                      <Icon name={stageIcon(c.stage, stageNumber)} className="size-4 text-ink-muted" />
                      {/* Names may already say "Stage 1: …"; the number is shown once. */}
                      Stage {stageNumber} · {c.stage.replace(/^\s*stage\s*\d+\s*[:.·–-]\s*/i, "")}
                    </p>
                    <StageTime steps={stageSteps(c.stage)} isDone={isDone} preview={preview} />
                  </div>
                )}
                <details open={hasNext} className="group rounded-2xl border border-line bg-muted/50">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-3 sm:p-4">
                    <span
                      className={cx(
                        "grid size-11 shrink-0 place-items-center rounded-xl",
                        chapterDone
                          ? "bg-success/15 text-success"
                          : chapterGoing
                            ? "bg-[#DCECE5] text-[#0e7c7b] dark:bg-tealtint"
                            : "bg-surface text-ink-muted",
                      )}
                    >
                      <Icon name={chapterIcon(c.title)} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">
                        {String(ci + 1).padStart(2, "0")} · {c.title}
                      </span>
                      {c.description && <span className="mt-0.5 block text-sm text-ink-muted">{c.description}</span>}
                      <span className="mt-0.5 block text-xs text-ink-muted">
                        {steps.length} {steps.length === 1 ? "topic" : "topics"} · {formatDuration(steps.reduce((n, x) => n + x.minutes, 0))}
                        {chapterDone && <span className="font-semibold text-success"> · Completed</span>}
                        {chapterGoing && <span className="font-semibold text-[#0e7c7b] dark:text-action"> · In progress</span>}
                      </span>
                    </span>
                    <Icon name="chevron-down" className="mt-1 size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                  </summary>
                  {!preview && liveHere.length > 0 && doneHere > 0 && (
                    <div className="mx-3 mb-3 h-1.5 overflow-hidden rounded-full bg-line sm:mx-4" aria-hidden>
                      <div className="h-full rounded-full bg-[#0e7c7b]" style={{ width: `${(doneHere / liveHere.length) * 100}%` }} />
                    </div>
                  )}
                  {/* Topics sit indented under their chapter, on a line down from the chapter's icon. */}
                  <div className="border-t border-line py-2 pr-2">
                    <ol className="ml-[33px] flex flex-col gap-1 border-l-2 border-line pl-2 sm:ml-[37px]">{steps.map((x) => topic(x, p.steps.indexOf(x)))}</ol>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      ) : (
        <ol className="flex flex-col gap-1">{p.steps.map((x, i) => topic(x, i))}</ol>
      )}

      {next ? (
        <Link
          href={href(next.slug)}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover"
        >
          {preview ? "Start preview" : started ? "Continue learning" : "Start"}: {next.title} <Icon name="arrow-right" className="size-4" />
        </Link>
      ) : live.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-semibold text-success">
            <Icon name="circle-check" className="size-5" /> {soon ? "All available topics done. More are coming soon." : "Path complete"}
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
        <p className="text-ink-muted">The topics in this path are coming soon.</p>
      )}
      {!preview && live.length > 0 && <OfflineButton lessons={live.map((s) => ({ slug: s.slug }))} />}
    </li>
  );
}

/** A chapter's icon, from what it's about. */
function chapterIcon(title: string): IconName {
  const t = title.toLowerCase();
  const rules: [RegExp, IconName][] = [
    [/team|contact|people|who /, "people"],
    [/trilogy|organisation|about us|company|our model/, "building"],
    [/sector|system|act\b|law|legislat|rules|government|aged care/, "landmark"],
    [/right|obligation|safety|risk|complian|quality|incident|safeguard/, "shield"],
    [/coordinat|responsib|monitor|document|record|note|plan/, "clipboard"],
    [/money|fund|budget|invoic|billing|payment|price/, "money"],
    [/communicat|talk|conversation|client/, "chat"],
    [/learn|support|development|leader/, "book"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "book";
}

/** A stage's icon: the first builds a foundation; later ones are the work itself. */
function stageIcon(stage: string, n: number): IconName {
  const t = stage.toLowerCase();
  if (/foundation|basic|getting started|welcome|start/.test(t)) return "layers";
  if (/work|practice|role|job|day to day/.test(t)) return "briefcase";
  return n === 1 ? "layers" : "briefcase";
}

/** "16 topics · about 2½ hours" beside a stage, or how much is left once it's started. */
function StageTime({ steps, isDone, preview }: { steps: Step[]; isDone: (s: Step) => boolean; preview: boolean }) {
  const total = steps.reduce((n, s) => n + s.minutes, 0);
  const left = steps.filter((s) => !isDone(s)).reduce((n, s) => n + s.minutes, 0);
  const done = steps.filter((s) => !s.draft && isDone(s)).length;
  const lower = (m: number) => formatDuration(m).replace(/^About/, "about");
  const count = `${steps.length} ${steps.length === 1 ? "topic" : "topics"}`;
  return (
    <span className="text-xs text-ink-muted">
      {!preview && done && !left ? (
        <span className="font-semibold text-success">Completed</span>
      ) : !preview && done ? (
        `${count} · ${lower(left)} left`
      ) : (
        `${count} · ${lower(total)}`
      )}
    </span>
  );
}
