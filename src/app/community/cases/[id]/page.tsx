import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { CaseThread } from "@/components/caseThreads/CaseThread";

// The page holds no case content: the API decides whether this reader's role may see the thread. Kept out of search engines.
export const metadata: Metadata = { title: "Case thread", robots: { index: false, follow: false } };

/** One "What Would You Do?" case thread in Community (docs/case-threads.md): the same canonical thread the Magazine block shows. */
export default function CaseThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <Link href="/community" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]">
        <span aria-hidden>←</span> Community
      </Link>
      <Suspense fallback={<p className="py-10 text-ink-muted">Loading…</p>}>
        <Thread params={params} />
      </Suspense>
    </div>
  );
}

async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mt-4">
      <CaseThread threadId={id} place="community" />
    </div>
  );
}
