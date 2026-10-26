import type { Metadata } from "next";
import { LearningPathEditor } from "@/components/admin/LearningPaths";

export const metadata: Metadata = { title: "New learning path" };

export default function NewLearningPathPage() {
  return <LearningPathEditor />;
}
