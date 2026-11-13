"use client";

import { useApi, type Me } from "@/lib/api";
import { useHydrated } from "@/lib/store";

/** "Good morning" before midday, "Good afternoon" until 5 pm, then "Good evening". */
export const greeting = (d: Date) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 17 ? "Good afternoon" : "Good evening");

/**
  The homepage's welcome, by first name: "Good afternoon, Jordan". Worked out in the browser, where the
  person and their time of day are known; until then the line keeps its space, so nothing jumps.
*/
export function HomeWelcome() {
  const hydrated = useHydrated();
  const me = useApi<Me>("/api/me").data;
  const first = me?.user.name.trim().split(/\s+/)[0];
  return (
    <p className="min-h-7 font-mulish text-lg font-bold text-accent" aria-live="polite">
      {hydrated && first ? (
        // The first part of the homepage to rise in after signing in.
        <span data-build-step style={{ "--step": 0 } as React.CSSProperties} className="inline-block">
          {greeting(new Date())}, {first} <span aria-hidden>👋</span>
          <span className="block font-sans text-base font-normal text-ink-muted sm:ml-2 sm:inline">Welcome back to the Partner Hub.</span>
        </span>
      ) : null}
    </p>
  );
}
