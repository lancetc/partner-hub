import { OnboardingPage, onboardingMetadata } from "@/components/resources/OnboardingPage";

/* A coordinator managed partner's first steps, and who they'll work with. */
export const metadata = onboardingMetadata("coordinator");

export default function CoordinatorManagedOnboardingPage() {
  return <OnboardingPage model="coordinator" />;
}
