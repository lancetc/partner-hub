import type { Metadata } from "next";
import Link from "next/link";
import { AllLifeMoments } from "@/components/community/LifeMoments";

export const metadata: Metadata = { title: "Meanwhile, in their lives", robots: { index: false } };

/** Every Life Moment that's out, newest first (docs/lives-in-progress.md): the homepage row's "See all". */
export default function MomentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:pt-8">
      <Link
        href="/community#digital"
        className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#008282] hover:underline dark:text-[#3cb8b9]"
      >
        <span aria-hidden>←</span> All digital members
      </Link>
      <p className="mt-4 font-mulish text-xs font-extrabold uppercase tracking-[0.14em] text-[#007373] dark:text-[#3cb8b9]">Lives in Progress</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold">Meanwhile, in their lives…</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">
        Little moments from the people we support. They’re fictional people, written for Trilogy Care training.
      </p>
      <div className="mt-8">
        <AllLifeMoments />
      </div>
    </div>
  );
}
