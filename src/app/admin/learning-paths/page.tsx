import type { Metadata } from "next";
import { LearningPathList } from "@/components/admin/LearningPaths";

export const metadata: Metadata = { title: "Discovery Paths" };

export default function LearningPathsPage() {
  return <LearningPathList />;
}
