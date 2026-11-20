import type { Metadata } from "next";
import { StoryReportView } from "@/components/admin/story/StoryReportView";

export const metadata: Metadata = { title: "Story report" };

export default function Page() {
  return <StoryReportView />;
}
