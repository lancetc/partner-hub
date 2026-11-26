import { Suspense } from "react";
import type { Metadata } from "next";
import { FirstRun } from "@/components/onboarding/FirstRun";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Getting started", robots: { index: false, follow: false } };

/** The first sign-in (docs/onboarding.md, "Starting courses"): how to use the Hub, who it has you as, and your first course. */
export default function GettingStartedPage({ searchParams }: PageProps<"/onboarding/start">) {
  return (
    <Suspense>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}

async function Start({ searchParams }: Pick<PageProps<"/onboarding/start">, "searchParams">) {
  const { step } = await searchParams;
  return <FirstRun start={typeof step === "string" ? step : undefined} />;
}
