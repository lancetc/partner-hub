import type { Metadata } from "next";
import { Suspense } from "react";
import { CoursePlayer } from "@/components/elearning/CoursePlayer";

export const metadata: Metadata = { title: "eLearning course" };

/** An eLearning course's player. The course id (and ?window=1) are only known per request, so the page streams in. */
export default function ElearningCoursePage({ params }: PageProps<"/elearning/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: Pick<PageProps<"/elearning/[id]">, "params">) {
  const { id } = await params;
  return <CoursePlayer id={id} />;
}
