import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { browseLearningPaths } from "@/server/learningPaths";
import { missionSlugs } from "@/server/challenges";
import { StoryVisual } from "@/components/StoryVisual";
import { Icon } from "@/components/Icon";
import { formatDate, formatHoursMinutes } from "@/lib/format";

export const metadata: Metadata = {
  title: "Learning paths",
  description: "Sets of Trilogy Care topics to work through in order, from the basics of aged care to getting invoices paid.",
  alternates: { canonical: "/paths" },
};

export default function LearningPathsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Learning paths</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Topics grouped into a path, to work through in order. Finish every topic to earn a certificate.</p>
      <Suspense>
        <Paths />
      </Suspense>
    </div>
  );
}

type Path = ReturnType<typeof browseLearningPaths>[number];

/** Read per request: progress is the signed-in person's, and authors can add paths at any time. */
async function Paths() {
  await connection();
  const db = getDb();
  // Paths holding challenge missions stay out unless assigned: missions open one a day, from the challenge page.
  const paths = browseLearningPaths(db, await currentUser(db), missionSlugs(db));
  const mine = paths.filter((p) => p.assigned);
  const rest = paths.filter((p) => !p.assigned);
  if (!paths.length) return <p className="mt-10 text-ink-muted">There are no learning paths yet. New ones will appear here.</p>;
  return (
    <>
      {mine.length > 0 && <PathGrid id="assigned" heading="Assigned to you" paths={mine} />}
      {rest.length > 0 && <PathGrid id="explore" heading={mine.length ? "More paths" : "All paths"} paths={rest} />}
    </>
  );
}

function PathGrid({ id, heading, paths }: { id: string; heading: string; paths: Path[] }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="font-serif text-2xl font-semibold">
        {heading} <span className="text-base font-normal text-ink-muted">({paths.length})</span>
      </h2>
      <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {paths.map((p) => (
          <PathTile key={p.id} path={p} />
        ))}
      </ul>
    </section>
  );
}

function PathTile({ path: p }: { path: Path }) {
  const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0;
  const cta = p.done ? "Revisit path" : p.started ? "Continue" : "Start path";
  return (
    <li className="group relative flex flex-col gap-3">
      {p.thumbnail ? (
        <StoryVisual {...p.thumbnail} alt="" className="aspect-[16/10] rounded-2xl" />
      ) : (
        <div className="aspect-[16/10] rounded-2xl bg-tealtint" aria-hidden />
      )}
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">
        {p.topics} {p.topics === 1 ? "topic" : "topics"} · {formatHoursMinutes(p.minutes)}
        {p.audience && ` · ${p.audience}`}
      </p>
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
