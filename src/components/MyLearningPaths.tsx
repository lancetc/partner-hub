"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { useHub, useHydrated } from "@/lib/store";
import { cx, formatDate } from "@/lib/format";
import { Icon } from "./Icon";

type Step = { slug: string; title: string; minutes: number; completedAt: string | null };
type MyPath = { id: string; name: string; description: string; inOrder: boolean; dueDate: string | null; steps: Step[] };

/** Learning paths assigned to the signed-in person: progress, what's next and the due date. */
export function MyLearningPaths() {
  const { data } = useApi<{ paths: MyPath[] }>("/api/learning-paths");
  const hydrated = useHydrated();
  const attempts = useHub((s) => s.lessons);
  if (!data?.paths.length) return null;

  // Completions recorded on this device count too, so progress matches the lesson tiles.
  const isDone = (s: Step) => Boolean(s.completedAt) || (hydrated && attempts[s.slug]?.status === "completed");

  return (
    <section aria-labelledby="my-paths" className="mt-8">
      <h2 id="my-paths" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
        Your learning paths
      </h2>
      <ul className="grid gap-4 lg:grid-cols-2">
        {data.paths.map((p) => {
          const done = p.steps.filter(isDone).length;
          const nextIndex = p.steps.findIndex((s) => !isDone(s));
          const next = p.steps[nextIndex];
          const started = done > 0 || (hydrated && p.steps.some((s) => attempts[s.slug]));
          return (
            <li key={p.id} className="flex flex-col gap-4 rounded-3xl border-2 border-action/30 bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl font-semibold leading-snug">{p.name}</h3>
                  {p.description && <p className="mt-1 text-ink-muted">{p.description}</p>}
                </div>
                {next && p.dueDate && <span className="rounded-full bg-gold/25 px-3 py-1 font-mulish text-xs font-bold">Due {formatDate(p.dueDate)}</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${done} of ${p.steps.length} lessons done`}>
                  <div className="h-full rounded-full bg-action transition-[width]" style={{ width: `${(done / p.steps.length) * 100}%` }} />
                </div>
                <span className="font-mulish text-sm font-bold">
                  {done} of {p.steps.length}
                </span>
              </div>
              <ol className="flex flex-col gap-1">
                {p.steps.map((s, i) => {
                  const complete = isDone(s);
                  const locked = p.inOrder && !complete && nextIndex !== -1 && i > nextIndex;
                  const current = i === nextIndex;
                  const row = (
                    <>
                      <span
                        className={cx(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mulish text-xs font-extrabold",
                          complete ? "bg-action text-on-action" : current ? "bg-gold text-ink" : "border border-line-strong text-ink-muted",
                        )}
                      >
                        {complete ? <Icon name="check" className="size-3.5" /> : locked ? <Icon name="lock" className="size-3.5" /> : i + 1}
                      </span>
                      <span className={cx("min-w-0 flex-1 leading-snug", locked && "text-ink-muted", current && "font-semibold")}>{s.title}</span>
                      <span className="shrink-0 text-sm text-ink-muted">{complete ? "Done" : locked ? "After the one before" : `${s.minutes} min`}</span>
                    </>
                  );
                  return (
                    <li key={s.slug}>
                      {locked ? (
                        <span className="flex min-h-11 items-center gap-3 rounded-xl px-2">{row}</span>
                      ) : (
                        <Link href={`/learning/${s.slug}`} className={cx("flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted", current && "bg-tealtint")}>
                          {row}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
              {next ? (
                <Link href={`/learning/${next.slug}`} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full bg-action px-5 font-semibold text-on-action hover:bg-action-hover">
                  {started ? "Continue" : "Start"}: {next.title} <Icon name="arrow-right" className="size-4" />
                </Link>
              ) : (
                <p className="flex items-center gap-2 font-semibold text-accent">
                  <Icon name="check" className="size-5" /> Path complete
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
