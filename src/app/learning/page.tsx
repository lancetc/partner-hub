import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { lessons } from "@/content/lessons";
import { getDb } from "@/server/db";
import { LessonList } from "@/components/LessonList";
import { MyLearningPaths } from "@/components/MyLearningPaths";
import { WaitingSurveys } from "@/components/WaitingSurveys";

export const metadata: Metadata = { title: "Learning" };

export default function LearningPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Learning</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Short, practical lessons you can finish between visits. Your place is saved as you go.</p>
      <div className="mt-8 max-w-2xl empty:hidden">
        <WaitingSurveys heading="Survey waiting for you" />
      </div>
      <MyLearningPaths />
      {/* Reinforcement lessons arrive as follow ups in a learning sequence, not from the catalogue. */}
      <Suspense>
        <Catalogue />
      </Suspense>
    </div>
  );
}

/** Read per request: authors can publish new lessons from the editor at any time. */
async function Catalogue() {
  await connection();
  getDb();
  return <LessonList lessons={lessons.filter((l) => l.track !== "reinforcement")} />;
}
