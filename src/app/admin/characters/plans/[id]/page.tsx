import { Suspense } from "react";
import type { Metadata } from "next";
import { StoryPlanEditor } from "@/components/admin/story/StoryPlanEditor";

export const metadata: Metadata = { title: "Story plan" };

export default function Page({ params }: PageProps<"/admin/characters/plans/[id]">) {
  return (
    <Suspense>
      <Inner params={params} />
    </Suspense>
  );
}

async function Inner({ params }: Pick<PageProps<"/admin/characters/plans/[id]">, "params">) {
  const { id } = await params;
  return <StoryPlanEditor id={id} />;
}
