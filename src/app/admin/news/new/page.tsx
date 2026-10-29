import { Suspense } from "react";
import type { Metadata } from "next";
import { StoryEditor } from "@/components/admin/NewsAdmin";

export const metadata: Metadata = { title: "New story" };

export default function NewStoryPage() {
  return (
    <Suspense>
      <StoryEditor />
    </Suspense>
  );
}
