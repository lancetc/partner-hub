import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { currentUser } from "@/server/auth";
import { now } from "@/server/clock";
import { learnerDirectory } from "@/server/activityCatalogue";
import { PageHero } from "@/components/PageHero";
import { ActivityDirectory } from "@/components/activities/ActivityDirectory";

export const metadata: Metadata = {
  title: "Interactive activities",
  description: "Simulators, conversations, calculators, games and the tools for work you can open, filtered by role, kind and what you want to get better at.",
  alternates: { canonical: "/activities" },
};

/*
  Every interactive activity a person can open (docs/activity-catalogue-audit.md), from the Activity Catalogue: the
  published courses built around a simulator, roleplay, calculator or practice block, and the Work Tools and games their
  role and access allow. The homepage features a few; this is the whole collection.
*/
export default function ActivitiesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <PageHero eyebrow="Learn by doing" title="Interactive activities" back={{ href: "/", label: "Home" }}>
        Practise a decision on a fictional case, rehearse a conversation, test the numbers, or open a tool for the job in front of you.
      </PageHero>
      <Suspense fallback={<p className="mt-8 text-ink-muted">Loading…</p>}>
        <Directory />
      </Suspense>
    </div>
  );
}

/** Personal: what's here depends on who's signed in. */
async function Directory() {
  await connection();
  const db = getDb();
  const user = await currentUser(db);
  const d = learnerDirectory(db, user, now(db));
  return <ActivityDirectory items={d.items} audience={d.role} />;
}
