"use client";

import Link from "next/link";

/*
  What a person sees after saving to Favourites (docs/job-aids.md). The first time, it says where Favourites is;
  after that, just that it's saved. Announced to assistive technology either way.
*/
export function SaveNotice({ first, what, onClose }: { first: boolean; what?: string; onClose?: () => void }) {
  return (
    <div role="status" aria-live="polite" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-tealtint px-4 py-3 text-sm">
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Saved to Favourites.</span>{" "}
        {first ? (
          <>
            Open it from Favourites <span className="hidden lg:inline">in the header.</span>
            <span className="lg:hidden">in the bar at the bottom.</span>
          </>
        ) : (
          what
        )}
      </p>
      <Link href="/favourites" className="inline-flex min-h-11 items-center rounded-full bg-action px-4 font-semibold text-on-action">
        View Favourites
      </Link>
      {onClose && (
        <button type="button" onClick={onClose} className="min-h-11 px-2 font-semibold underline underline-offset-2">
          Dismiss
        </button>
      )}
    </div>
  );
}
