import { Suspense } from "react";
import type { Metadata } from "next";
import { StoryEditor } from "@/components/admin/NewsAdmin";

export const metadata: Metadata = { title: "Edit story" };

export default function EditStoryPage({ params }: PageProps<"/admin/news/[slug]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/news/[slug]">, "params">) {
  const { slug } = await params;
  return <StoryEditor slug={slug} />;
}
