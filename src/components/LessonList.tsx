"use client";

import Link from "next/link";
import type { Lesson } from "@/content/lessons";
import { useHub, useHydrated } from "@/lib/store";
import { StoryVisual } from "./StoryVisual";
import { SaveButton } from "./SaveButton";
import { Icon } from "./Icon";
import { cx, formatDate } from "@/lib/format";
import { formatWhen, useApi, type FollowUpListItem } from "@/lib/api";

const trackLabel: Record<Lesson["track"], string> = {
  core: "For everyone",
  reinforcement: "Follow ups",
  partner: "Service partner track",
  coordinator: "Coordinator track",
  briefing: "Policy briefings",
};

export function LessonList({ lessons }: { lessons: Lesson[] }) {
  const hydrated = useHydrated();
  const attempts = useHub((s) => s.lessons);

  const status = (l: Lesson) => {
    if (!hydrated) return null;
    const a = attempts[l.slug];
    if (!a) return { text: "Not started", cta: "Start" };
    if (a.status === "completed") return { text: `Completed ${a.completedAt ? formatDate(a.completedAt) : ""}`, cta: "Review", done: true };
    const beat = l.nodes[a.nodeId]?.beat ?? 0;
    return { text: `In progress · step ${beat + 1} of ${l.beats.length}`, cta: "Keep learning" };
  };

  const assigned = lessons.filter((l) => l.assignment?.required);
  // Spaced learning is switched on per master lesson; its follow ups show on that lesson's tile.
  const spaced = useApi<{ lessons: Record<string, { stage: string; gap: number }[]> }>("/api/lessons/spaced").data?.lessons ?? {};
  const followUps = useApi<{ items: FollowUpListItem[] }>("/api/follow-ups").data?.items ?? [];
  const stepsFor = (slug: string) => followUps.filter((f) => f.base?.slug === slug);
  const signoffs = useApi<{ signoffs: Record<string, Signoff> }>("/api/signoffs").data?.signoffs ?? {};

  return (
    <div className="mt-8 flex flex-col gap-12">
      {assigned.length > 0 && (
        <section aria-labelledby="assigned">
          <h2 id="assigned" className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
            Assigned to you
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {assigned.map((l) => {
              const s = status(l);
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

      {(["core", "partner", "coordinator", "briefing"] as const).map((track) => {
        const items = lessons.filter((l) => l.track === track);
        if (!items.length) return null;
        return (
          <section key={track} aria-labelledby={`track-${track}`}>
            <h2 id={`track-${track}`} className="mb-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em]">
              {trackLabel[track]}
            </h2>
            <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((l) => {
                const s = status(l);
                return (
                  <li key={l.slug} className="group relative flex flex-col gap-3">
                    <StoryVisual {...l.visual} alt="" className="aspect-[16/10] rounded-2xl" />
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
                        {l.minutes} min · {l.beats.length} cards
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
          </section>
        );
      })}
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
