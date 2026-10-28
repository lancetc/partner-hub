import type { Metadata } from "next";
import { SavedList } from "@/components/SavedList";

export const metadata: Metadata = { title: "Saved items" };

export default function SavedPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Saved items</h1>
      <p className="mt-2 text-lg text-ink-muted">Stories, lessons, resources and lesson cards you’ve bookmarked. Saving isn’t the same as completing.</p>
      <SavedList />
    </div>
  );
}
