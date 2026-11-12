import { stories } from "@/content/stories";
import { NewsGrid } from "@/components/NewsGrid";
import { HomeLearning } from "@/components/HomeLearning";
import { lessons } from "@/content/lessons";
import { topicSummary } from "@/lib/topicSummary";
import { topicDates, topicSubjects } from "@/server/topicSubjects";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { ChallengeBanner } from "@/components/ChallengePage";
import { HomeCommunity } from "@/components/community/HomeCommunity";
import { missionSlugs } from "@/server/challenges";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewsHome() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-[2.75rem]">The latest at Trilogy</h1>
          <p className="mt-1 max-w-2xl text-lg text-ink-muted">News, practical learning and updates for our Care Partners and care coordinators.</p>
        </div>
        <p className="font-mulish text-sm font-semibold text-ink-muted">
          <span className="rounded-full bg-muted px-3 py-1">Demonstration content</span>
        </p>
      </header>
      <div className="max-w-3xl empty:hidden">
        <ChallengeBanner />
      </div>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <Learning />
      </Suspense>
      <HomeCommunity />
      <div className="mt-6">
        <Suspense>
          <Stories />
        </Suspense>
      </div>
    </div>
  );
}

/** Read per request: stories can be edited and published in admin at any time. */
async function Stories() {
  await connection();
  getDb();
  const ordered = [...stories].sort((a, b) => b.date.localeCompare(a.date));
  return <NewsGrid stories={ordered} />;
}

/** Where the person is in their learning, read per request (topics are published at any time). */
async function Learning() {
  await connection();
  const db = getDb();
  const subjects = topicSubjects(db);
  const dates = topicDates(db);
  const missions = missionSlugs(db);
  return (
    <HomeLearning
      topics={lessons
        .filter((l) => l.track !== "reinforcement" && !missions.has(l.slug))
        .map((l) => topicSummary(l, subjects[l.slug] ?? null, dates[l.slug] ?? null))}
    />
  );
}
