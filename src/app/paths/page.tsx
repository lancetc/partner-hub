import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { browseLearningPaths, myCertificates, slugsFor } from "@/server/learningPaths";
import { HeroStats, PageHero } from "@/components/PageHero";
import { LearnTile } from "@/components/LearnMenu";
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
        eyebrow="Step by step"
        title="Discovery Paths"
        tile={<LearnTile href="/paths" />}
        // A colleague on a garden bench working through something on her phone, on the right, with lawn behind the words.
        image={{ src: "/images/hero-bench-reading.webp", width: 1914, height: 822, position: "80% 14%", minHeight: 336 }}
        aside={
          <Suspense>
            <PathStats />
          </Suspense>
        }
      >
        Topics set in order to build a skill from the ground up. Follow a path through to the end and earn its certificate.
      </PageHero>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <MyDiscoveryPanel />
      <Suspense>
        <Paths />
      </Suspense>
    </div>
  );
}

/** The way to My Discovery: the learner's own paths, which are kept apart from the ones set for them. */
function MyDiscoveryPanel() {
  return (
    <section aria-labelledby="my-discovery" className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-3xl bg-surface p-5 ring-1 ring-line">
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="my-discovery" className="font-serif text-xl font-semibold">
          My Discovery
        </h2>
        <p className="mt-1 text-ink-muted">
          Make your own path around something you want to get better at. Tell the Hub your goal and it suggests a short route through what’s published, or build
          one yourself. It’s yours to change, and separate from the training below.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/discovery" className="inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action hover:opacity-90">
          Create a Discovery Path
        </Link>
        <Link href="/discovery" className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold hover:bg-muted">
          Open My Discovery
        </Link>
        <Link href="/capabilities" className="inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 font-semibold hover:bg-muted">
          My Capabilities
        </Link>
      </div>
    </section>
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
