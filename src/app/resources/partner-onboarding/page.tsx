import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PartnerOnboardingDiagram, PartnerRoles } from "@/components/resources/PartnerOnboarding";

export const metadata: Metadata = {
  title: "Your first steps as a Trilogy Care partner",
  description: "P1 partner onboarding: from referral to your first service, and who you’ll work with at Trilogy Care.",
  alternates: { canonical: "/resources/partner-onboarding" },
};

/* A referring (P1) partner's first steps, and who they'll work with. Reached from its box on Resources. */
export default function PartnerOnboardingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
      <p className="mt-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">P1 partner onboarding</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Your first steps as a Trilogy Care partner</h1>
      <div className="mt-3 max-w-3xl space-y-2 text-lg text-ink-muted">
        <p>
          From referral to your first service, onboarding takes five steps. We handle the call, the client agreement and the budget meeting. You make the
          referral, sign your contractor agreement and deliver the care.
        </p>
        <p className="font-semibold text-ink">All you need to start is one referral code.</p>
      </div>
      <div className="mt-8">
        <PartnerOnboardingDiagram />
      </div>
      <h2 className="mt-10 font-serif text-2xl font-semibold">Who you’ll work with</h2>
      <div className="mt-4">
        <PartnerRoles />
      </div>
    </div>
  );
}
