import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { LessonList } from "@/components/LessonList";
import { HomeLearning } from "@/components/HomeLearning";
import { WaitingSurveys } from "@/components/WaitingSurveys";
import { ChallengeBanner } from "@/components/ChallengePage";
import { catalogueTopics, topicPopularity } from "@/server/catalogue";
import { now } from "@/server/clock";
import { currentUser } from "@/server/auth";
import { pathTopicOrder } from "@/server/learningPaths";
import { HeroStats, PageHero } from "@/components/PageHero";
import { LearnTile } from "@/components/LearnMenu";
import { SUBJECTS } from "@/lib/subjects";

export const metadata: Metadata = {
  title: "Topics",
  description: "Short, practical topics for Trilogy Care’s Care Partners and care coordinators, built around real visits.",
  alternates: { canonical: "/topics" },
};

/*
  Learning and Learning paths share one layout: the heading, the "Your learning" panel from the
  homepage, then everything to browse with the same search and filters ("All topics" here, "All paths"
  there).
*/
export default function LearningPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero
        eyebrow="Short and practical"
        title="Topics"
        tile={<LearnTile href="/topics" />}
        // A gardener at his potting-shed table reading a Trilogy Care topic on his phone, on the right, with lawn behind the words.
        image={{ src: "/images/hero-gardener-topic.webp", width: 1914, height: 822, position: "80% 36%", minHeight: 336 }}
        aside={
          <Suspense>
            <TopicStats />
          </Suspense>
        }
      >
        Quick topics to finish between visits. Pick one up when you have ten minutes, and your place is saved as you go.
      </PageHero>
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

/** The catalogue at a glance, for the banner. */
async function TopicStats() {
  await connection();
  const db = getDb();
  // Counted from the topics this person can see, so the banner matches the list under it.
  const topics = catalogueTopics(db, (await currentUser(db)).id);
  const minutes = topics.length ? Math.round(topics.reduce((n, t) => n + t.minutes, 0) / topics.length) : 0;
  const subjects = SUBJECTS.filter((s) => topics.some((t) => t.subject === s.id)).length;
  return (
    <HeroStats
      stats={[
        { label: "topics", value: topics.length },
        { label: "subjects", value: subjects },
        { label: "minutes on average", value: minutes },
      ]}
    />
  );
}

/** Where they are in their learning, as on the homepage, with a link across to the paths. */
async function YourLearning() {
  await connection();
  const db = getDb();
  return <HomeLearning topics={catalogueTopics(db, (await currentUser(db)).id)} browse={{ href: "/paths", label: "Go to Discovery Paths" }} />;
}

/** Read per request: authors can publish new topics, and change subjects, at any time. */
async function Catalogue() {
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  return (
    <LessonList
      topics={catalogueTopics(db, user.id)}
      // For "Sort by: Learning path", which groups topics under each path in its own order (only paths for this person).
      paths={pathTopicOrder(db, user)}
      // For the "Popular with your colleagues" row and "Sort by: Most popular".
      popularity={topicPopularity(db, now(db))}
    />
  );
}
