import { OnboardingPage, onboardingMetadata } from "@/components/resources/OnboardingPage";

/* A brokered partner's first steps, and who they'll work with. */
export const metadata = onboardingMetadata("brokered");

export default function BrokeredOnboardingPage() {
  return <OnboardingPage model="brokered" />;
}
