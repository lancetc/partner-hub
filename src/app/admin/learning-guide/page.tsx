import type { Metadata } from "next";
import { LearningGuideAdmin } from "@/components/admin/LearningGuideAdmin";

export const metadata: Metadata = { title: "AI Learning Guide" };

export default function AdminLearningGuidePage() {
  return <LearningGuideAdmin />;
}
