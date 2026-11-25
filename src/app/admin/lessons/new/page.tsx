import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonEditor } from "@/components/admin/LessonEditor";
import { blankLesson } from "@/content/blankLesson";
import { getDb } from "@/server/db";
import { seededDefaultPresenter } from "@/server/introPresenters";

export const metadata: Metadata = { title: "New topic" };

export default function NewLessonPage() {
  return (
    <Suspense>
      <NewLesson />
    </Suspense>
  );
}

/** Rendered per visit: the editor's checks compare dates with today. */
async function NewLesson() {
  await connection();
  // Its Introduction card shows the default presenter's placeholder (lib/topicIntro.ts).
  return <LessonEditor initial={blankLesson(seededDefaultPresenter(getDb()))} isNew />;
}
