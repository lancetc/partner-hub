import type { Metadata } from "next";
import { OnboardingView } from "@/components/onboarding/OnboardingView";

export const metadata: Metadata = { title: "My onboarding" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
