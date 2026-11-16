"use client";

import { useLinkStatus } from "next/link";
import { cx } from "@/lib/format";

/**
  A thin bar along the bottom of a menu item while its page is on the way, so a click is answered at
  once even when the page takes a moment (a page's first visit on the dev server is built on demand).
  Goes inside a <Link> with `relative` on it. Always rendered and faded in, so nothing shifts.
*/
export function NavPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cx(
        "pointer-events-none absolute h-0.5 origin-left rounded-full bg-action opacity-0 transition-opacity duration-150",
        pending && "nav-pending opacity-100",
        className,
      )}
    />
  );
}
