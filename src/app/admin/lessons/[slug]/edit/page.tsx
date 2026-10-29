import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { lessons } from "@/content/lessons";
import { LessonEditor } from "@/components/admin/LessonEditor";
import { getDb } from "@/server/db";
import { editorLesson } from "@/server/authoredLessons";

export const metadata: Metadata = { title: "Edit topic" };

export function generateStaticParams() {
  return lessons.filter((l) => l.track !== "reinforcement").map((l) => ({ slug: l.slug }));
}

export default function EditLessonPage({ params, searchParams }: PageProps<"/admin/lessons/[slug]/edit">) {
  return (
    <Suspense>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ params, searchParams }: Pick<PageProps<"/admin/lessons/[slug]/edit">, "params" | "searchParams">) {
  const { slug } = await params;
  // ?card=<id> opens straight on that card (links from Content review).
  const { card } = await searchParams;
  // Opens the latest saved draft, so always read it fresh.
  await connection();
  const found = editorLesson(getDb(), slug);
  if (!found) notFound();
  return <LessonEditor key={slug} initial={found.lesson} status={found.status} isNew={false} card={typeof card === "string" ? card : undefined} />;
}
