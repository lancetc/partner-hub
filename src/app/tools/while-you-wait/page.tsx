import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { LiveBridge } from "@/components/magazine/WhileYouWait";

// A staff tool for live calls: kept out of search results.
export const metadata: Metadata = { title: "While you wait", robots: { index: false, follow: false } };

/** While You Wait, live call (docs/while-you-wait.md): a staff information and quote aid. Nothing entered here is saved. */
export default function WhileYouWaitPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero eyebrow="Staff tools" title="While you wait">
        For a call with someone waiting for Support at Home funding: what can be arranged now, what it could cost, and what changes when funding is in place.
        Nothing you enter here is saved, sent, booked or referred.
      </PageHero>
      <LiveBridge />
    </div>
  );
}
