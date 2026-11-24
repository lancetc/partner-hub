"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { RECOMMENDATION_LABELS, type RecommendationKind } from "@/lib/hiringWindow";
import type { plannerHome } from "@/server/caseloadPlanner";
import { Icon } from "../Icon";

/*
  Plan capacity (Care Partner Hiring Runway PRD, section 7): the business owner's way into the private Work Tool, with
  their latest saved plan if they chose to save one. Shown only to someone who may plan the business (the API checks
  business_planner_access); everyone else sees nothing. It carries the plan's name, when it was saved and its decision
  window in months, never a margin, a salary or cash, so it can sit in the business area without exposing figures.
*/
export function PlanCapacityCard() {
  const home = useApi<ReturnType<typeof plannerHome>>("/api/tools/caseload").data;
  if (!home?.access) return null;
  const latest = home.plans[0];
  const w = latest?.window;
  return (
    <section aria-labelledby="plan-capacity-h" className="mt-6 rounded-3xl bg-[#102a43] p-5 text-white sm:p-6">
      <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-[#7fd4d4]">Private to {home.access.orgName}</p>
      <h2 id="plan-capacity-h" className="mt-1 font-serif text-2xl font-semibold">
        Plan capacity
      </h2>
      <p className="mt-1 max-w-3xl text-white/90">
        When might your team be stretched, when would recruitment need to start, and what would a hire do to cash? A window under your own assumptions, never a
        hiring order.
      </p>
      {latest ? (
        <p className="mt-2 text-sm">
          Latest saved plan: <span className="font-semibold">{latest.name}</span> ({latest.versions} version{latest.versions === 1 ? "" : "s"}, saved{" "}
          {new Date(latest.updatedAt).toLocaleDateString("en-AU")})
          {w
            ? ` · ${RECOMMENDATION_LABELS[w.kind as RecommendationKind] ?? w.kind}${w.startFrom !== null ? `, recruitment start Month ${w.startFrom}${w.startTo !== w.startFrom ? ` to ${w.startTo}` : ""}` : ""}`
            : " · saved before the decision window: open it to see one"}
        </p>
      ) : (
        <p className="mt-2 text-sm text-white/80">No saved plan yet. Nothing is saved unless you choose to.</p>
      )}
      <Link
        href="/tools/caseload-margin"
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#7fd4d4] px-5 font-semibold text-[#102a43] hover:opacity-90"
      >
        <Icon name="sliders" className="size-4" /> {latest ? "Open Plan my business" : "Start Plan my business"}
      </Link>
    </section>
  );
}
