import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { browseLearningPaths, slugsFor } from "@/server/learningPaths";
import { lessonBySlug } from "@/content/lessons";
import { PathsBrowser } from "@/components/PathsBrowser";
import { HomeLearning } from "@/components/HomeLearning";
import { catalogueTopics } from "@/server/catalogue";
import { missionSlugs } from "@/server/challenges";

export const metadata: Metadata = {
  title: "My Training",
  description: "Sets of Trilogy Care topics to work through in order, from the basics of aged care to getting invoices paid.",
  alternates: { canonical: "/paths" },
};

/* Laid out like Learning: the heading, the "Your learning" panel, then every path to browse with the same search and filters. */
export default function LearningPathsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">My Training</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Learning paths: topics grouped to work through in order. Finish every topic in a path to earn a certificate.</p>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <Suspense>
        <Paths />
      </Suspense>
    </div>
  );
}

/** Where they are in their learning, as on the homepage, with a link across to every topic. */
async function YourLearning() {
  await connection();
  const db = getDb();
  const topics = catalogueTopics(db, (await currentUser(db)).id);
  return <HomeLearning topics={topics} browse={{ href: "/topics", label: `Browse all ${topics.length} topics` }} />;
}

/** Read per request: progress is the signed-in person's, and authors can add paths at any time. */
async function Paths() {
  await connection();
  const db = getDb();
  // Paths holding challenge missions stay out unless assigned: missions open one a day, from the challenge page.
  const paths = browseLearningPaths(db, await currentUser(db), missionSlugs(db));
  if (!paths.length) return <p className="mt-10 text-ink-muted">There are no learning paths yet. New ones will appear here.</p>;
  // Each path's topic titles, so searching for a topic finds the path it's in.
  return <PathsBrowser paths={paths.map((p) => ({ ...p, topicTitles: slugsFor(db, p.id).map((s) => lessonBySlug(s)?.title ?? "").filter(Boolean) }))} />;
}
