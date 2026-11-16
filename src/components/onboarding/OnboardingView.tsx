"use client";

import { useHub, useHydrated } from "@/lib/store";
import { Welcome } from "./Welcome";
import { AllSet } from "./AllSet";

/*
  First-run setup, then "You're all set" with their sample topic. The document checklist (Checklist)
  is left out for now, while the documents new people need are worked out.
*/
export function OnboardingView() {
  const hydrated = useHydrated();
  const welcomed = useHub((s) => s.onboarding.welcomed);
  if (!hydrated) return <div className="mx-auto min-h-[60vh] max-w-5xl px-4 pt-10" aria-busy="true" />;
  return welcomed ? <AllSet /> : <Welcome />;
}
