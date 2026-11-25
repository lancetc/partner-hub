import type { Metadata } from "next";
import { PathIntroductionManager } from "@/components/admin/PathExciter";

export const metadata: Metadata = { title: "Discovery Path introductions" };

/** The Discovery Path Introduction Manager: every path's Discovery Exciter, with bulk actions (docs/discovery-exciter.md). */
export default function PathIntroductionsPage() {
  return <PathIntroductionManager />;
}
