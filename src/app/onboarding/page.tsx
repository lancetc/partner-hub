import type { Metadata } from "next";
import { OnboardingView } from "@/components/onboarding/OnboardingView";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "My onboarding", robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return <OnboardingView />;
}
