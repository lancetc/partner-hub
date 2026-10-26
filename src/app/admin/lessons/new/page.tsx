import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import { LessonEditor } from "@/components/admin/LessonEditor";
import { blankLesson } from "@/content/blankLesson";

export const metadata: Metadata = { title: "New lesson" };

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
  return <LessonEditor initial={blankLesson()} isNew />;
}
