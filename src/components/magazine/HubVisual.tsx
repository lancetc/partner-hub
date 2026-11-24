"use client";

import Link from "next/link";
import type { HubVisualBlock } from "@/lib/magazine";
import { HUB_VISUALS } from "@/lib/magazine";
import { ONBOARDING, type OnboardingModelId } from "@/content/partnerOnboarding";
import { JourneyEmbed } from "../journey/JourneyMap";
import { PartnerOnboardingDiagram } from "../resources/PartnerOnboarding";
import { Icon } from "../Icon";

/*
  A Hub diagram in a Magazine article (lib/magazine HUB_VISUALS): the client journey map or a partner model's
  onboarding diagram, drawn from the same content as their own pages, so an article never shows an out-of-date copy.
  The article's own blocks explain it; this block shows it, with a caption and a link to the full page.
*/

const ONBOARDING_OF: Partial<Record<HubVisualBlock["visual"], OnboardingModelId>> = {
  "onboarding-p1": "p1",
  "onboarding-brokered": "brokered",
  "onboarding-coordinator": "coordinator",
};

export function HubVisual({ block: b }: { block: HubVisualBlock }) {
  const model = ONBOARDING_OF[b.visual];
  const full = model ? { href: ONBOARDING[model].href, label: "Open it on its own page" } : { href: "/journey", label: "Open the full journey map" };
  return (
    <figure aria-label={HUB_VISUALS[b.visual]} className="mx-auto w-full max-w-[72rem]">
      {model ? <PartnerOnboardingDiagram model={model} /> : <JourneyEmbed />}
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm text-ink-muted">
        <span>{b.caption || HUB_VISUALS[b.visual]}</span>
        <Link href={full.href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
          {full.label} <Icon name="arrow-right" className="size-4" />
        </Link>
      </figcaption>
    </figure>
  );
}
