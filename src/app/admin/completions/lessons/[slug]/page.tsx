import { Suspense } from "react";
import type { Metadata } from "next";
import { LessonCompletions } from "@/components/admin/Completions";

export const metadata: Metadata = { title: "Lesson completions" };

export default function AdminLessonCompletionsPage({ params }: PageProps<"/admin/completions/lessons/[slug]">) {
  return (
    <Suspense>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/admin/completions/lessons/[slug]">, "params">) {
  const { slug } = await params;
  return <LessonCompletions slug={slug} />;
}
