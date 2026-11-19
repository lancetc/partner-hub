import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";
import { learnerGuides } from "@/server/magazine";
import { coursePopularity, learnerCourses } from "@/server/elearning/service";
import { now } from "@/server/clock";
import { catalogueTopics } from "@/server/catalogue";
import { HomeLearning } from "@/components/HomeLearning";
import { HeroStats, PageHero } from "@/components/PageHero";
import { MagazineBrowser, type BrowseGuide } from "@/components/magazine/MagazineBrowser";

export const metadata: Metadata = {
  title: "Magazine",
  description: "Longer guides to read at a desk: real situations, worked examples and the decisions care coordinators make.",
  alternates: { canonical: "/magazine" },
};

/* Laid out like Topics and Discovery Paths: the banner, the "Your learning" panel, then "All magazines" (rows to browse and every story). It holds the Magazine guides and courses and the eLearning courses. */
export default function MagazinePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Trilogy Care learning"
        title="Magazine"
        aside={
          <Suspense>
            <GuideStats />
          </Suspense>
        }
      >
        Longer reads for your desk: guides, courses and interactive eLearning, built around real situations and the decisions you make.
      </PageHero>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <Suspense fallback={<div className="mt-8 min-h-64" aria-hidden />}>
        <Guides />
      </Suspense>
    </div>
  );
}

/** Everything in Magazine the signed-in person can read: its guides and courses, and the eLearning courses, with where they are in each. */
async function guides(): Promise<BrowseGuide[]> {
  const db = getDb();
  const user = await currentUser(db);
  const at = now(db);
  const magazine: BrowseGuide[] = learnerGuides(db, user, at).map((g) => ({
    id: g.id,
    kind: "magazine",
    href: `/magazine/${g.slug}`,
    editHref: `/admin/magazine/${g.id}`,
    title: g.title,
    standfirst: g.standfirst,
    cover: g.cover,
    pages: g.pages,
    minutes: g.minutes,
    publishedAt: g.publishedAt,
    popularity: g.popularity,
    state: g.state,
  }));
  const popular = coursePopularity(db, at);
  const elearning: BrowseGuide[] = learnerCourses(db, user).courses.map((c) => {
    const o = c.attempt?.outcome ?? "not_started";
    return {
      id: c.id,
      kind: "elearning",
      href: `/elearning/${c.id}`,
      editHref: "/admin/elearning",
      title: c.title,
      standfirst: c.description,
      cover: c.poster,
      pages: 0,
      minutes: null,
      edition: c.edition,
      publishedAt: c.publishedAt ?? "",
      popularity: popular.get(c.id) ?? 0,
      state: o === "completed" || o === "passed" ? "completed" : o === "not_started" ? "new" : "started",
    };
  });
  return [...magazine, ...elearning];
}

async function GuideStats() {
  await connection();
  const list = await guides();
  return (
    <HeroStats
      stats={[
        { label: list.length === 1 ? "story" : "stories", value: list.length },
        { label: "started", value: list.filter((g) => g.state === "started").length },
        { label: "completed", value: list.filter((g) => g.state === "completed").length },
      ]}
    />
  );
}

/** Where they are in their learning, as on Topics and Discovery Paths, with a link across to every topic. */
async function YourLearning() {
  await connection();
  const db = getDb();
  const topics = catalogueTopics(db, (await currentUser(db)).id);
  return <HomeLearning topics={topics} browse={{ href: "/topics", label: `Browse all ${topics.length} topics` }} />;
}

/** Read per request: what someone can see depends on who they are, and authors publish at any time. */
async function Guides() {
  await connection();
  const db = getDb();
  return <MagazineBrowser guides={await guides()} canEdit={canAuthor(await currentUser(db))} />;
}
