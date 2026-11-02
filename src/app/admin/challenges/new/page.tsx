import type { Metadata } from "next";
import { ChallengeEditor } from "@/components/admin/Challenges";

export const metadata: Metadata = { title: "New challenge" };

export default function NewChallengePage() {
  return <ChallengeEditor />;
}
