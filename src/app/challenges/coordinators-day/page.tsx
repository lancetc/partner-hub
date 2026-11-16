import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { CoordinatorsDay } from "@/components/coordinatorsDay/CoordinatorsDay";

export const metadata: Metadata = {
  title: "The Coordinator’s Day",
  description: "A solo board game: follow a care coordinator’s day from the first call to handover, where decisions move you forward and setbacks send you back.",
  robots: { index: false },
};

/* The Coordinator's Day: a solo board game, reached from Challenges. */
export default function CoordinatorsDayPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:pt-8">
      <Link href="/challenges" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Challenges
      </Link>
      <p className="mt-1 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-accent">Solo board game · about 15 minutes</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">The Coordinator’s Day</h1>
      <p className="mt-2 max-w-3xl text-lg text-ink-muted">
        From the first call of the morning to the end-of-day handover. Good decisions move you forward, setbacks send you back to replan, and opportunities handled
        well let you climb. What you learn early in the day can help you later.
      </p>
      <CoordinatorsDay />
    </div>
  );
}
