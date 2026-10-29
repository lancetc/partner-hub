import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonPlayer } from "@/components/player/LessonPlayer";
import { ReviewJoin } from "@/components/ReviewJoin";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { editorLesson } from "@/server/authoredLessons";
import { factValues } from "@/server/facts";
import { applyFacts } from "@/lib/facts";
import { linkLesson } from "@/server/reviews";
import { currentReviewer } from "@/server/reviewSession";

// A private link: keep it out of search engines and away from other sites.
export const metadata: Metadata = { title: "Topic review", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ReviewPage({ params }: PageProps<"/review/[token]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Review params={params} />
    </Suspense>
  );
}

/* A lesson opened from its review link: the latest saved draft, with Comments on every card. */
async function Review({ params }: Pick<PageProps<"/review/[token]">, "params">) {
  const { token } = await params;
  await connection();
  const db = getDb();
  const slug = linkLesson(db, token);
  const draft = slug ? editorLesson(db, slug) : undefined;
  if (!slug || !draft) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-3xl font-semibold">This review link isn’t active</h1>
        <p className="mt-3 text-ink-muted">The author may have switched it off. Ask the person who sent it to you for a new link.</p>
      </main>
    );
  }
  const who = await currentReviewer(db, await currentUser(db));
  if (!who) return <ReviewJoin token={token} title={draft.lesson.title} />;
  return (
    <LessonPlayer
      lesson={applyFacts(draft.lesson, factValues(db))}
      preview
      reviewToken={token}
      backTo={{ href: `/review/${token}`, label: "Back to the start" }}
    />
  );
}
