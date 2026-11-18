import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { learnerCourses } from "@/server/elearning/service";
import { catalogueTopics } from "@/server/catalogue";
import { HeroStats, PageHero } from "@/components/PageHero";
import { HomeLearning } from "@/components/HomeLearning";
import { ElearnBrowser, type BrowseCourse } from "@/components/elearning/ElearnBrowser";

export const metadata: Metadata = {
  title: "eLearn",
  description: "eLearning courses built in Articulate Rise and Storyline, tracked alongside your other learning in the Partner Hub.",
  alternates: { canonical: "/elearning" },
};

/* Laid out like Topics and Discovery Paths: the heading, the "Your learning" panel, then every course to browse with search and filters. */
export default function ElearnPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Trilogy Care learning"
        title="eLearn"
        aside={
          <Suspense>
            <CourseStats />
          </Suspense>
        }
      >
        Longer interactive courses built in Articulate. Your place, answers and scores are saved as you go, so you can stop and pick up again later.
      </PageHero>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <Suspense>
        <Courses />
      </Suspense>
    </div>
  );
}

/** The signed-in person's published courses, with where they are in each. */
async function courses(): Promise<BrowseCourse[]> {
  const db = getDb();
  const { courses } = learnerCourses(db, await currentUser(db));
  return courses.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    edition: c.edition,
    publishedAt: c.publishedAt,
    attempt: c.attempt && {
      number: c.attempt.number,
      outcome: c.attempt.outcome,
      score: c.attempt.score,
      scoreMax: c.attempt.scoreMax,
      totalSeconds: c.attempt.totalSeconds,
      lastActivityAt: c.attempt.lastActivityAt,
    },
  }));
}

/** The courses at a glance, for the banner. */
async function CourseStats() {
  await connection();
  const list = await courses();
  const outcome = (c: BrowseCourse) => c.attempt?.outcome ?? "not_started";
  return (
    <HeroStats
      stats={[
        { label: "courses", value: list.length },
        { label: "in progress", value: list.filter((c) => outcome(c) === "in_progress").length },
        { label: "completed", value: list.filter((c) => outcome(c) === "completed" || outcome(c) === "passed").length },
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

/** Read per request: progress is the signed-in person's, and admins can publish courses at any time. */
async function Courses() {
  await connection();
  return <ElearnBrowser courses={await courses()} />;
}
