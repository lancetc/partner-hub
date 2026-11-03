import { Suspense } from "react";
import type { Metadata } from "next";
import { PathQuiz } from "@/components/PathQuiz";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Upfront quiz", robots: { index: false, follow: false } };

/** A learning path's upfront quiz: pass it to complete the path without working through every topic. */
export default function PathQuizPage({ params }: PageProps<"/paths/[id]/quiz">) {
  return (
    <Suspense>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/paths/[id]/quiz">, "params">) {
  const { id } = await params;
  return <PathQuiz id={id} />;
}
