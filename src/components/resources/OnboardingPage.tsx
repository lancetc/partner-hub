import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "../Icon";
import { ONBOARDING, type OnboardingModelId } from "@/content/partnerOnboarding";
import { PartnerOnboardingDiagram } from "./PartnerOnboarding";

/* A partner model's onboarding page (P1, Brokered, Coordinator managed), reached from its box on Resources. */
export function OnboardingPage({ model }: { model: OnboardingModelId }) {
  const o = ONBOARDING[model];
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/resources" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Resources
      </Link>
      <p className="mt-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">{o.label}</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{o.title}</h1>
      <div className="mt-3 max-w-3xl space-y-2 text-lg text-ink-muted">
        <p>{o.intro}</p>
        <p className="font-semibold text-ink">{o.lead}</p>
      </div>
      <div className="mt-8">
        <PartnerOnboardingDiagram model={model} />
      </div>
    </div>
  );
}

export const onboardingMetadata = (model: OnboardingModelId): Metadata => ({
  title: ONBOARDING[model].title,
  description: `${ONBOARDING[model].label}: from referral to your first service, and who you’ll work with at Trilogy Care.`,
  alternates: { canonical: ONBOARDING[model].href },
});
