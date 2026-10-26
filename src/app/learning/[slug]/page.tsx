import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { lessonBySlug, lessons } from "@/content/lessons";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";
import { editorLesson } from "@/server/authoredLessons";
import { canSkipHolds } from "@/server/learningPaths";

export function generateStaticParams() {
  return lessons.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learning/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  getDb();
  return { title: lessonBySlug(slug)?.title ?? "Lesson" };
}

export default function LessonPage({ params, searchParams }: PageProps<"/learning/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Lesson params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Lesson({ params, searchParams }: Pick<PageProps<"/learning/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  // Lessons can be published from the editor at any time, so read the current version.
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  // ?preview=1 lets an author play their latest saved draft. Nothing is recorded.
  if (query.preview === "1" && canAuthor(user)) {
    const draft = editorLesson(db, slug);
    if (draft) return <LessonPlayer lesson={draft.lesson} preview />;
  }
  const lesson = lessonBySlug(slug);
  if (!lesson) notFound();
  // ?instance=<id> plays the lesson as a step in a learning sequence.
  const instance = query.instance;
  return (
    <LessonPlayer
      lesson={lesson}
      instanceId={typeof instance === "string" && /^\d+$/.test(instance) ? instance : undefined}
      skipHolds={canSkipHolds(db, user.id, lesson.slug)}
    />
  );
}
