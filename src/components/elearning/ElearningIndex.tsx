"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { cx } from "@/lib/format";
import { PageHero } from "../PageHero";
import { outcomeText, outcomeTone, type Outcome } from "./status";

/*
  eLearning, Phase 1: the published courses and where the learner is up to on each. The full catalogue
  (search, filters, categories, assignments) comes in Phase 2.
*/

type Course = { id: string; title: string; description: string; edition: string; attempt: { outcome: Outcome; score: number | null; scoreMax: number | null } | null };

export function ElearningIndex() {
  const { data, error } = useApi<{ courses: Course[] }>("/api/elearning");
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <PageHero eyebrow="Courses" title="eLearning">
        Longer courses built in Articulate, tracked alongside your topics and paths.
      </PageHero>
      {error && <p className="mt-6 text-danger">{error}</p>}
      {!data ? (
        <p className="mt-8 text-ink-muted">Loading…</p>
      ) : !data.courses.length ? (
        <p className="mt-8 rounded-3xl border border-dashed border-line-strong p-6 text-center text-ink-muted">No eLearning courses yet.</p>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.courses.map((c) => {
            const o = c.attempt?.outcome ?? "not_started";
            return (
              <li key={c.id} className="group relative flex flex-col gap-3 rounded-3xl border border-line bg-surface p-5 hover:border-line-strong">
                <span className={cx("self-start rounded-full px-2.5 py-0.5 font-mulish text-xs font-bold", outcomeTone[o])}>
                  {outcomeText[o]}
                  {c.attempt?.score != null ? ` · ${c.attempt.score}${c.attempt.scoreMax ? `/${c.attempt.scoreMax}` : ""}` : ""}
                </span>
                <h2 className="font-serif text-xl font-semibold leading-snug">
                  <Link href={`/elearning/${c.id}`} className="after:absolute after:inset-0 after:content-[''] group-hover:underline">
                    {c.title}
                  </Link>
                </h2>
                {c.description && <p className="text-ink-muted">{c.description}</p>}
                <span className="mt-auto font-semibold text-accent">{o === "in_progress" ? "Resume" : o === "not_started" ? "Start" : "Open"} →</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
