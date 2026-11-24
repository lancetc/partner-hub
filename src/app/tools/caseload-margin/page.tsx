import type { Metadata } from "next";
import Link from "next/link";
import { CaseloadPlanner } from "@/components/tools/CaseloadPlanner";

// Private business planning: kept out of search results.
export const metadata: Metadata = { title: "Caseload-to-Margin & Hiring Capacity", robots: { index: false, follow: false } };

/**
  The Caseload-to-Margin & Hiring Capacity Calculator (docs/caseload-margin-calculator.md): when to plan recruitment,
  which capacity option is feasible, and what could happen to service, operating result and cash as a Care Partner
  business grows. A fictional example for anyone, and Plan my business for the owner and the people they authorise.
*/
export default function CaseloadMarginPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
        Work Tools
      </Link>
      <header className="mt-2 rounded-3xl bg-gradient-to-br from-[#102a43] to-[#0e5c5b] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Business planning · Work Tool</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Caseload-to-Margin & Hiring Capacity</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          When to plan recruitment, which capacity option is feasible, and what could happen to service quality, operating result and cash as your business
          grows. A planning window under the assumptions you set, never a hiring order.
        </p>
      </header>
      <CaseloadPlanner />
    </div>
  );
}
