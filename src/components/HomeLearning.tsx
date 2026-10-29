"use client";

import Link from "next/link";
import { useApi, type FollowUpListItem, type Me } from "@/lib/api";
import { useHub, useHydrated } from "@/lib/store";
import { cx, formatDate, formatDuration } from "@/lib/format";
import { subjectLabel } from "@/lib/subjects";
import type { TopicSummary } from "@/lib/topicSummary";
import { Icon } from "./Icon";
import { StoryVisual } from "./StoryVisual";
import type { MyPath } from "./MyLearningPaths";

/*
  On the homepage, before the news: where each person is in their learning. What to pick up again,
  their learning paths and what's next in each, follow ups that are ready, what's assigned and due,
  and, for someone just starting, a few topics to begin with.
*/

export function HomeLearning({ topics }: { topics: TopicSummary[] }) {
  const hydrated = useHydrated();
  const attempts = useHub((s) => s.lessons);
  const me = useApi<Me>("/api/me").data;
  const paths = useApi<{ paths: (MyPath & { done?: boolean; assigned?: boolean })[] }>("/api/learning-paths?started=1").data?.paths ?? [];
  const followUps = useApi<{ items: FollowUpListItem[] }>("/api/follow-ups").data?.items ?? [];
  const certificates = useApi<{ certificates: { id: string }[] }>("/api/me/certificates").data?.certificates.length ?? 0;
  if (!hydrated) return <div className="mt-6 min-h-40" aria-hidden />;

  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const inProgress = Object.entries(attempts)
    .filter(([slug, a]) => a.status === "in_progress" && bySlug.has(slug))
    .sort(([, a], [, b]) => (b.savedAt ?? b.startedAt).localeCompare(a.savedAt ?? a.startedAt))
    .map(([slug, a]) => ({ topic: bySlug.get(slug)!, step: (bySlug.get(slug)!.stepOf[a.nodeId] ?? 0) + 1 }));
  const completed = Object.values(attempts).filter((a) => a.status === "completed").length;
  const ready = followUps.filter((f) => f.status === "available" || f.status === "in_progress");
  const due = topics.filter((t) => t.assignment?.required && attempts[t.slug]?.status !== "completed");
  const mine = me?.user.audience === "coordinator" ? "coordinator" : "partner";
  const starters = topics
    .filter((t) => !attempts[t.slug] && (t.track === "core" || t.track === mine))
    .sort((a, b) => Number(b.subject === "getting-started") - Number(a.subject === "getting-started") || a.minutes - b.minutes)
    .slice(0, 3);
  const isDone = (p: MyPath, slug: string) => Boolean(p.steps.find((s) => s.slug === slug)?.completedAt) || attempts[slug]?.status === "completed";
  const newcomer = !inProgress.length && !completed && !paths.length;

  return (
    <section aria-labelledby="your-learning" className="mt-6 rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="your-learning" className="font-serif text-2xl font-semibold">
            {newcomer ? "Start learning" : "Your learning"}
          </h2>
          <p className="mt-1 text-ink-muted">
            {newcomer
              ? "Short topics of five to ten minutes, built around real visits. Your place is saved as you go."
              : `${completed} ${completed === 1 ? "topic" : "topics"} completed${certificates ? ` · ${certificates} ${certificates === 1 ? "certificate" : "certificates"}` : ""}`}
          </p>
        </div>
        <Link href="/learning" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          Browse all {topics.length} topics <Icon name="arrow-right" className="size-4" />
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {/* Pick up where you left off: the most recent topic first. */}
        {inProgress[0] && (
          <Link
            href={`/learning/${inProgress[0].topic.slug}`}
            className="group flex gap-4 rounded-2xl bg-[#DCECE5] p-4 text-[#102a43] ring-1 ring-[#0e7c7b]/15 hover:ring-[#0e7c7b]/40"
          >
            <StoryVisual {...inProgress[0].topic.visual} alt="" className="size-20 shrink-0 rounded-xl" iconSize="size-6" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#0e7c7b]">Continue where you left off</span>
              <span className="font-serif text-lg font-semibold leading-snug group-hover:underline">{inProgress[0].topic.title}</span>
              <span className="text-sm">
                Step {inProgress[0].step} of {inProgress[0].topic.steps} · {inProgress[0].topic.minutes} min topic
              </span>
              <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/70" aria-hidden>
                <span className="block h-full rounded-full bg-[#0e7c7b]" style={{ width: `${(inProgress[0].step / inProgress[0].topic.steps) * 100}%` }} />
              </span>
            </span>
          </Link>
        )}

        {/* Each learning path: how far through, and what's next. */}
        {paths.slice(0, 2).map((p) => {
          const live = p.steps.filter((s) => !s.draft);
          const done = live.filter((s) => isDone(p, s.slug)).length;
          const next = live.find((s) => !isDone(p, s.slug));
          const left = p.steps.filter((s) => !isDone(p, s.slug)).reduce((n, s) => n + s.minutes, 0);
          const percent = live.length ? Math.round((done / live.length) * 100) : 0;
          return (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">
                    {p.assigned === false ? "Learning path you’ve started" : "Learning path"}
                  </span>
                  <Link href={`/paths/${encodeURIComponent(p.id)}`} className="font-serif text-lg font-semibold leading-snug hover:underline">
                    {p.name}
                  </Link>
                </span>
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold tabular-nums">{percent}%</span>
              </div>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-[#0e7c7b]" style={{ width: `${percent}%` }} />
              </span>
              <p className="text-sm text-ink-muted">
                {done} of {live.length} topics{left > 0 && ` · ${formatDuration(left).replace(/^About/, "about")} to go`}
                {p.dueDate && done < live.length && ` · due ${formatDate(p.dueDate)}`}
              </p>
              {next ? (
                <Link
                  href={`/learning/${next.slug}`}
                  className="inline-flex min-h-10 items-center gap-1.5 self-start font-semibold text-accent hover:underline"
                >
                  Next: {next.title} <Icon name="arrow-right" className="size-4" />
                </Link>
              ) : (
                <Link
                  href={`/paths/${encodeURIComponent(p.id)}/certificate`}
                  className="inline-flex min-h-10 items-center gap-1.5 self-start font-semibold text-success hover:underline"
                >
                  <Icon name="star" className="size-4" /> Path complete: get your certificate
                </Link>
              )}
            </div>
          );
        })}

        {/* Ready now: spaced follow ups, and topics assigned with a due date. */}
        {(ready.length > 0 || due.length > 0) && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line p-4">
            <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Ready for you</span>
            <ul className="flex flex-col gap-1">
              {ready.slice(0, 3).map((f) => (
                <li key={f.id}>
                  <Link href={f.href} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-muted">
                    <Icon name="refresh" className="size-4 shrink-0 text-action" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{f.title}</span>
                      <span className="block text-xs text-ink-muted">Quick follow up{f.base ? ` to ${f.base.title}` : ""}</span>
                    </span>
                    <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
              {due.slice(0, 3).map((t) => (
                <li key={t.slug}>
                  <Link href={`/learning/${t.slug}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-muted">
                    <Icon name="flag" className="size-4 shrink-0 text-warm" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{t.title}</span>
                      <span className="block text-xs text-ink-muted">Required{t.assignment?.due ? ` · due ${formatDate(t.assignment.due)}` : ""}</span>
                    </span>
                    <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Other topics started, after the most recent. */}
        {inProgress.length > 1 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-line p-4">
            <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">Also in progress</span>
            <ul className="flex flex-col gap-1">
              {inProgress.slice(1, 4).map(({ topic, step }) => (
                <li key={topic.slug}>
                  <Link href={`/learning/${topic.slug}`} className="flex min-h-11 items-center gap-2.5 rounded-xl px-2 hover:bg-muted">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-snug">{topic.title}</span>
                      <span className="block text-xs text-ink-muted">
                        Step {step} of {topic.steps} · {subjectLabel(topic.subject)}
                      </span>
                    </span>
                    <Icon name="arrow-right" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Just starting, or nothing on the go: a few short topics to begin with. */}
      {!inProgress.length && starters.length > 0 && (
        <div className="mt-5">
          <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-ink-muted">{newcomer ? "Good places to begin" : "Try next"}</p>
          <ul className={cx("mt-3 grid gap-4 sm:grid-cols-3")}>
            {starters.map((t) => (
              <li key={t.slug} className="group relative flex flex-col gap-2">
                <StoryVisual {...t.visual} alt="" className="aspect-[16/10] rounded-2xl" iconSize="size-8" />
                <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                  {subjectLabel(t.subject)} · {t.minutes} min
                </span>
                <Link
                  href={`/learning/${t.slug}`}
                  className="font-serif text-lg font-semibold leading-snug after:absolute after:inset-0 after:content-[''] group-hover:underline"
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
