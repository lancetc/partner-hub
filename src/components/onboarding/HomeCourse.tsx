"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { useHydrated } from "@/lib/store";
import type { MyCourses } from "@/server/onboardingCourses";

/*
  Onboarding at first sign-in (the owner, Nov 2026): the homepage has no getting-started card. Someone who hasn't been
  through the welcome yet (docs/onboarding.md, "Starting courses") is taken straight to it, /onboarding/start, when
  they arrive at the homepage. Afterwards it's in the profile menu as "Getting started". Only once per browser
  session, so leaving the welcome part-way never traps anyone: they can use the Hub and come back to it from the menu.
*/

const OFFERED = "tc-first-run-offered";

export function HomeCourse() {
  const hydrated = useHydrated();
  const router = useRouter();
  const { data } = useApi<MyCourses>(hydrated ? "/api/onboarding/courses" : null);
  const due = Boolean(data && !data.firstRun.done && (data.primary || data.confirm));
  useEffect(() => {
    if (!due) return;
    try {
      if (sessionStorage.getItem(OFFERED)) return;
      sessionStorage.setItem(OFFERED, "1");
    } catch {
      // No session storage (private browsing): still offered, once per page load.
    }
    router.replace("/onboarding/start");
  }, [due, router]);
  return null;
}
