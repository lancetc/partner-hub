import type { Metadata } from "next";
import Link from "next/link";
import { TrustCheckTool } from "@/components/tools/TrustCheckTool";

// Private business follow-up: kept out of search results.
export const metadata: Metadata = { title: "28-Day Trust Check", robots: { index: false, follow: false } };

/**
  The 28-Day Trust Check Work Tool (docs/trust-check.md): a staged, role-restricted service-recovery workbench. A shell
  over demo data only, for the business owner and the people they authorise, until Trilogy Care approves the real data
  sources.
*/
export default function TrustCheckPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
        Work Tools
      </Link>
      <header className="mt-2 rounded-3xl bg-gradient-to-br from-[#102a43] to-[#0e5c5b] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Service recovery · Work Tool · Demo data</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">28-Day Trust Check</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          Notice a service problem, ask the person what they want, make sure someone owns the fix, and check it helped. A signal is a reason to look, never a
          prediction about anyone, and choosing to leave is the person’s right.
        </p>
      </header>
      <TrustCheckTool />
    </div>
  );
}
