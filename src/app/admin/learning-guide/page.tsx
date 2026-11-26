import type { Metadata } from "next";
import { LearningGuideAdmin } from "@/components/admin/LearningGuideAdmin";

export const metadata: Metadata = { title: "Ava’s videos" };

export default function AdminLearningGuidePage() {
  return <LearningGuideAdmin />;
}
