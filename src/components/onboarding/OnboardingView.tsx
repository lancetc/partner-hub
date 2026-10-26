"use client";

import { useHub, useHydrated } from "@/lib/store";
import { Welcome } from "./Welcome";
import { Checklist } from "./Checklist";

export function OnboardingView() {
  const hydrated = useHydrated();
  const welcomed = useHub((s) => s.onboarding.welcomed);
  if (!hydrated) return <div className="mx-auto min-h-[60vh] max-w-5xl px-4 pt-10" aria-busy="true" />;
  return welcomed ? <Checklist /> : <Welcome />;
}
