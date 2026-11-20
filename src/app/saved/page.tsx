import type { Metadata } from "next";
import Link from "next/link";
import { SavedList } from "@/components/SavedList";
import { Icon } from "@/components/Icon";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Saved items", robots: { index: false, follow: false } };

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Saved items</h1>
      <p className="mt-2 text-lg text-ink-muted">Stories, topics, resources and topic cards you’ve bookmarked. Saving isn’t the same as completing.</p>
      <Link
        href="/pocket-deck"
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 font-semibold hover:bg-muted"
      >
        <Icon name="mail" className="size-4" /> Pocket Deck: notes to a younger me you’ve kept
      </Link>
      <SavedList />
    </div>
  );
}
