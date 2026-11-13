import type { Metadata } from "next";
import { LearningPathList } from "@/components/admin/LearningPaths";

export const metadata: Metadata = { title: "My Training" };

export default function LearningPathsPage() {
  return <LearningPathList />;
}
