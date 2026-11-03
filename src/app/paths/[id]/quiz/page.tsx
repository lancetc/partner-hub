import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { PathQuiz } from "@/components/PathQuiz";
import { getDb } from "@/server/db";
import { canAuthor, currentUser } from "@/server/auth";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Upfront quiz", robots: { index: false, follow: false } };

/** A learning path's upfront quiz: pass it to complete the path without working through every topic. */
export default function PathQuizPage({ params, searchParams }: PageProps<"/paths/[id]/quiz">) {
  return (
    <Suspense>
      <Page params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Page({ params, searchParams }: Pick<PageProps<"/paths/[id]/quiz">, "params" | "searchParams">) {
  const { id } = await params;
  // ?preview=1 lets an author try the quiz from the path preview. Nothing is recorded.
  const { preview } = await searchParams;
  await connection();
  const author = preview === "1" && canAuthor(await currentUser(getDb()));
  return <PathQuiz id={id} preview={author} />;
}
