import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { browseLearningPaths, myCertificates, slugsFor } from "@/server/learningPaths";
import { HeroStats, PageHero } from "@/components/PageHero";
import { lessonBySlug } from "@/content/lessons";
import { PathsBrowser } from "@/components/PathsBrowser";
import { HomeLearning } from "@/components/HomeLearning";
import { catalogueTopics, topicPopularity } from "@/server/catalogue";
import { now } from "@/server/clock";
import { missionSlugs } from "@/server/challenges";

export const metadata: Metadata = {
  title: "Discovery Paths",
  description: "Sets of Trilogy Care topics to work through in order, from the basics of aged care to getting invoices paid.",
  alternates: { canonical: "/paths" },
};

/* Laid out like Learning: the heading, the "Your learning" panel, then every path to browse with the same search and filters. */
export default function LearningPathsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Trilogy Care learning"
        title="Discovery Paths"
        aside={
          <Suspense>
            <PathStats />
          </Suspense>
        }
      >
        Build your knowledge and skills through training programs made up of short, practical topics. Complete each topic in order to earn your certificate.
      </PageHero>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <Suspense>
        <Paths />
      </Suspense>
    </div>
  );
}

/** The paths at a glance, for the banner: how many, the topics in them, and the person's certificates. */
async function PathStats() {
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  const paths = browseLearningPaths(db, user, missionSlugs(db));
  const topics = new Set(paths.flatMap((p) => slugsFor(db, p.id)));
  return (
    <HeroStats
      stats={[
        { label: "paths", value: paths.length },
        { label: "topics in them", value: topics.size },
        { label: "your certificates", value: myCertificates(db, user).length },
      ]}
    />
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
  const user = await currentUser(db);
  const paths = browseLearningPaths(db, user, missionSlugs(db));
  if (!paths.length) return <p className="mt-10 text-ink-muted">There are no learning paths yet. New ones will appear here.</p>;
  // Popular paths: how often colleagues have finished the topics in each lately (the same figures as Topics).
  const popular = topicPopularity(db, now(db));
  return (
    <PathsBrowser
      audience={user.audience}
      paths={paths.map((p) => {
        const slugs = slugsFor(db, p.id);
        return {
          ...p,
          popularity: slugs.reduce((n, s) => n + (popular[s] ?? 0), 0),
          // Each path's topic titles, so searching for a topic finds the path it's in.
          topicTitles: slugs.map((s) => lessonBySlug(s)?.title ?? "").filter(Boolean),
        };
      })}
    />
  );
}
