import type { Metadata } from "next";
import Link from "next/link";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "You’re offline", robots: { index: false, follow: false } };

/* Shown by the service worker when a page that hasn't been kept on this device is opened offline. */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-16 text-center sm:px-6">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">You’re offline</h1>
      <p className="mt-3 text-lg text-ink-muted">This page isn’t saved on your device yet. It will open once you’re back online.</p>
      <p className="mt-3 text-ink-muted">Topics you’ve downloaded still work, and anything you do is saved and will sync later.</p>
      <Link href="/topics" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-action px-5 font-semibold text-on-action">
        Go to Learning
      </Link>
    </div>
  );
}
