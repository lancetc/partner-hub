import type { Metadata } from "next";
import Link from "next/link";
import { NetworkBuilderTool } from "@/components/tools/NetworkBuilderTool";

// Private business planning: kept out of search results.
export const metadata: Metadata = { title: "Contractor Network Builder", robots: { index: false, follow: false } };

/**
  The Contractor Network Builder (docs/network-builder.md): where planned services can't yet be reliably delivered, and
  how to build the right local capacity. A shell over demo data only, for the business owner and the people they
  authorise, until Trilogy Care approves the real data sources.
*/
export default function NetworkBuilderPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
        Work Tools
      </Link>
      <header className="mt-2 rounded-3xl bg-gradient-to-br from-[#102a43] to-[#0e5c5b] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Business planning · Work Tool · Demo data</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Contractor Network Builder</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          Where planned services can’t yet be reliably delivered, who could help, and what still has to happen before they can. Interest isn’t approval, and
          approval isn’t availability.
        </p>
      </header>
      <NetworkBuilderTool />
    </div>
  );
}
