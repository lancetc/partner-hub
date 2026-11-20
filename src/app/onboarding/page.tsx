import type { Metadata } from "next";
import { YourSetup } from "@/components/onboarding/YourSetup";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Your setup", robots: { index: false, follow: false } };

/** Your setup (docs/onboarding.md): a wizard the first time, then a task list to come back to. */
export default function OnboardingPage() {
  return <YourSetup />;
}
