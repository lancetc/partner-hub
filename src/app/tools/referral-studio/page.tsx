import type { Metadata } from "next";
import Link from "next/link";
import { ReferralStudioTool } from "@/components/tools/ReferralStudioTool";

// Private business practice: kept out of search results.
export const metadata: Metadata = { title: "Local Referral Studio", robots: { index: false, follow: false } };

/**
  The Local Referral Studio (docs/local-referral-studio.md): practise a truthful conversation with a fictional local
  referrer, then make an approved, co-branded one-pager, pitch card and email drafts. For the business owner and the
  people they authorise. Fictional practice, and drafts only: nothing contacts a GP or hospital, creates a referral or
  sends a message.
*/
export default function ReferralStudioPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/tools" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline underline-offset-2">
        Work Tools
      </Link>
      <header className="mt-2 rounded-3xl bg-gradient-to-br from-[#102a43] to-[#0e5c5b] p-6 text-white sm:p-8">
        <p className="font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#7fd4d4]">Business growth · Work Tool · Training mode</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Local Referral Studio</h1>
        <p className="mt-2 max-w-3xl text-lg text-white/90">
          Rehearse how you’d explain the pathway to a GP practice or hospital team, handle their concern honestly, and leave with approved material for the
          older person’s stage. Find out the stage first; promise nothing you can’t check.
        </p>
      </header>
      <ReferralStudioTool />
    </div>
  );
}
