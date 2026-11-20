import type { Metadata } from "next";
import { OnboardingAdmin } from "@/components/admin/OnboardingAdmin";

export const metadata: Metadata = { title: "Onboarding" };

export default function AdminOnboardingPage() {
  return <OnboardingAdmin />;
}
