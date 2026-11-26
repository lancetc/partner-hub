import { Suspense } from "react";
import type { Metadata } from "next";
import { CourseView } from "@/components/onboarding/CourseView";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Your starting course", robots: { index: false, follow: false } };

/** One of the signed-in person's starting courses (docs/onboarding.md, "Starting courses"). Anyone else's is "not found". */
export default function StartingCoursePage({ params }: PageProps<"/onboarding/course/[id]">) {
  return (
    <Suspense>
      <Course params={params} />
    </Suspense>
  );
}

async function Course({ params }: Pick<PageProps<"/onboarding/course/[id]">, "params">) {
  const { id } = await params;
  return <CourseView id={id} />;
}
