import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { FavouritesList } from "@/components/favourites/FavouritesList";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Favourites", robots: { index: false, follow: false } };

/** A person's own saved Job Aids and highlighted passages (docs/job-aids.md). One action from anywhere in the Hub. */
export default function FavouritesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="flex items-center gap-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
        <Icon name="bookmark-filled" className="size-8 text-accent" /> Favourites
      </h1>
      <p className="mt-2 text-lg text-ink-muted">The Job Aids and passages you’ve saved, to open again when the task comes up.</p>
      <Link href="/tools" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted">
        <Icon name="clipboard" className="size-4" /> All Work Tools
      </Link>
      <FavouritesList />
    </div>
  );
}
