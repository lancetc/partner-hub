import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { getDb } from "@/server/db";
import { getLesson } from "@/server/lessonStore";
import { canAuthor, currentUser } from "@/server/auth";

/* Short lessons in a learning sequence, including Claude-written drafts stored in the database. */

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Follow up", robots: { index: false, follow: false } };

export default function SequenceLessonPage({ params, searchParams }: PageProps<"/learning/s/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Player params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Player({ params, searchParams }: Pick<PageProps<"/learning/s/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const query = await searchParams;
  const db = getDb();
  const lesson = getLesson(db, slug);
  if (!lesson) notFound();
  const preview = query.preview === "1";
  // Drafts are only visible to authors previewing them.
  if ("generated" in lesson && lesson.generated?.status !== "approved" && !(preview && canAuthor(await currentUser(db)))) notFound();
  const instance = typeof query.instance === "string" && /^\d+$/.test(query.instance) ? query.instance : undefined;
  const { generated: _g, ...plain } = lesson as typeof lesson & { generated?: unknown };
  return <LessonPlayer lesson={plain} instanceId={preview ? undefined : instance} preview={preview} />;
}
