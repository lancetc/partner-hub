import type { Metadata } from "next";
import { ChallengesAdmin } from "@/components/admin/Challenges";

export const metadata: Metadata = { title: "Challenges" };

export default function ChallengesPage() {
  return <ChallengesAdmin />;
}
