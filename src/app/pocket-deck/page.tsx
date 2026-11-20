import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PocketDeck } from "@/components/notes/PocketDeck";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Pocket Deck", robots: { index: false, follow: false } };

export default function PocketDeckPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <Link href="/saved" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline">
        <Icon name="arrow-left" className="size-4" /> Saved items
      </Link>
      <h1 className="mt-1 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Pocket Deck</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-muted">Notes to a younger me that you’ve kept, from colleagues further along. Peer wisdom, not policy.</p>
      <PocketDeck />
    </div>
  );
}
