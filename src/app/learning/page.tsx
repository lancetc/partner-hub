import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { LessonList } from "@/components/LessonList";
import { HomeLearning } from "@/components/HomeLearning";
import { WaitingSurveys } from "@/components/WaitingSurveys";
import { ChallengeBanner } from "@/components/ChallengePage";
import { catalogueTopics } from "@/server/catalogue";
import { currentUser } from "@/server/auth";
import { pathTopicOrder } from "@/server/learningPaths";

export const metadata: Metadata = {
  title: "Topics",
  description: "Short, practical topics for Trilogy Care’s Care Partners and care coordinators, built around real visits.",
  alternates: { canonical: "/learning" },
};

/*
  Learning and Learning paths share one layout: the heading, the "Your learning" panel from the
  homepage, then everything to browse with the same search and filters ("All topics" here, "All paths"
  there).
*/
export default function LearningPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Topics</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Short, practical topics you can finish between visits. Your place is saved as you go.</p>
      <Suspense fallback={<div className="mt-6 min-h-20" aria-hidden />}>
        <YourLearning />
      </Suspense>
      <div className="max-w-2xl empty:hidden">
        <ChallengeBanner />
      </div>
      <div className="mt-8 max-w-2xl empty:hidden">
        <WaitingSurveys heading="Survey waiting for you" />
      </div>
      <Suspense>
        <Catalogue />
      </Suspense>
    </div>
  );
}

/** Where they are in their learning, as on the homepage, with a link across to the paths. */
async function YourLearning() {
  await connection();
  const db = getDb();
  return <HomeLearning topics={catalogueTopics(db, (await currentUser(db)).id)} browse={{ href: "/paths", label: "Browse learning paths" }} />;
}

/** Read per request: authors can publish new topics, and change subjects, at any time. */
async function Catalogue() {
  await connection();
  const db = getDb();
  return (
    <LessonList
      topics={catalogueTopics(db, (await currentUser(db)).id)}
      // For "Sort by: Learning path", which groups topics under each path in its own order.
      paths={pathTopicOrder(db)}
    />
  );
}
