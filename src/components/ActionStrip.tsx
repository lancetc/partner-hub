"use client";

import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { useHub, useHydrated } from "@/lib/store";
import { lessons } from "@/content/lessons";
import { onboardingTasks } from "@/content/onboarding";
import { computeReadiness } from "@/lib/readiness";
import { useApi, type FollowUpListItem } from "@/lib/api";

/** A slim strip of genuine next steps. Renders nothing when there is nothing useful to show. */
export function ActionStrip() {
  const hydrated = useHydrated();
  const hub = useHub((s) => s);
  const followUps = useApi<{ items: FollowUpListItem[] }>("/api/follow-ups").data?.items ?? [];
  if (!hydrated) return null;

  const actions: { href: string; icon: IconName; text: string; cta: string; urgent?: boolean }[] = [];

  const correction = onboardingTasks.find((t) => hub.onboarding.tasks[t.id]?.status === "action_required");
  if (correction) {
    actions.push({
      href: `/onboarding#task-${correction.id}`,
      icon: "alert",
      text: `${correction.title} needs a correction`,
      cta: "See what to fix",
      urgent: true,
    });
  }

  const nextFollowUp = followUps.find((f) => f.status === "in_progress") ?? followUps.find((f) => f.status === "available");
  if (nextFollowUp) {
    actions.push({
      href: nextFollowUp.href,
      icon: "spark",
      text: `Quick follow up: ${nextFollowUp.title}`,
      cta: nextFollowUp.status === "in_progress" ? "Continue" : "Start",
    });
  }

  const inProgress = lessons.find((l) => hub.lessons[l.slug]?.status === "in_progress");
  if (inProgress) {
    actions.push({ href: `/learning/${inProgress.slug}`, icon: "play", text: `Resume “${inProgress.title}”`, cta: "Keep learning" });
  }

  const readiness = computeReadiness(hub);
  if (!correction && readiness.state !== "ready") {
    actions.push({
      href: "/onboarding",
      icon: "list",
      text: hub.onboarding.welcomed ? `${readiness.remainingForYou} setup task${readiness.remainingForYou === 1 ? "" : "s"} left for you` : "Set up your partner profile",
      cta: hub.onboarding.welcomed ? "Continue setup" : "Get started",
    });
  }

  if (!actions.length) return null;

  return (
    <section aria-label="Your next steps" className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {actions.slice(0, 2).map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={
            "group flex min-h-12 flex-1 items-center gap-3 rounded-2xl border px-4 py-2 sm:max-w-md " +
            (a.urgent ? "border-danger/60 bg-surface" : "border-line bg-tealtint")
          }
        >
          <Icon name={a.icon} className={a.urgent ? "size-5 shrink-0 text-danger" : "size-5 shrink-0 text-accent"} />
          <span className="flex-1 text-[0.95rem]">{a.text}</span>
          <span className="flex items-center gap-1 text-sm font-semibold text-accent group-hover:underline">
            {a.cta} <Icon name="arrow-right" className="size-4" />
          </span>
        </Link>
      ))}
    </section>
  );
}
