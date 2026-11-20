import type { Metadata } from "next";
import { StoryLibraryAdmin } from "@/components/admin/story/StoryLibraryAdmin";

export const metadata: Metadata = { title: "Characters and stories" };

export default function Page() {
  return <StoryLibraryAdmin />;
}
