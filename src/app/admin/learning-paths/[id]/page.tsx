import { Suspense } from "react";
import type { Metadata } from "next";
import { LearningPathEditor } from "@/components/admin/LearningPaths";

export const metadata: Metadata = { title: "Learning path" };

export default function LearningPathPage({ params }: PageProps<"/admin/learning-paths/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/learning-paths/[id]">, "params">) {
  const { id } = await params;
  return <LearningPathEditor id={id} />;
}
