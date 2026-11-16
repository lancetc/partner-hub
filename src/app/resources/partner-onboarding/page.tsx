import { OnboardingPage, onboardingMetadata } from "@/components/resources/OnboardingPage";

/* A referring (P1) partner's first steps, and who they'll work with. */
export const metadata = onboardingMetadata("p1");

export default function PartnerOnboardingPage() {
  return <OnboardingPage model="p1" />;
}
