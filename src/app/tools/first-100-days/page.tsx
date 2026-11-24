import type { Metadata } from "next";
import Link from "next/link";
import { First100DaysTool } from "@/components/tools/First100DaysTool";

// Private business workbench: kept out of search results.
export const metadata: Metadata = { title: "First 100 Days", robots: { index: false, follow: false } };

/**
  The First 100 Days coaching workbench (docs/shadow-and-coach.md): a staged, role-restricted shell over demo data only,
  for the business owner and the people they authorise, until Trilogy Care approves real data sources. Never a
  performance, disciplinary or HR record, and nobody is scored or ranked.
*/
export default function First100DaysPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
        Work Tools
      </Link>
      <header className="mt-2 rounded-3xl bg-gradient-to-br from-[#102a43] to-[#0e5c5b] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Your team · Work Tool · Demo data</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">First 100 Days</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          Support a new coordinator with evidence and outstanding checks, approved learning and observed work. Progress is what you’ve seen in their work, never
          a bar that reaches “competent” on day 100.
        </p>
      </header>
      <First100DaysTool />
    </div>
  );
}
