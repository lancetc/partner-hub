import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { FieldNotesList } from "@/components/living/FieldNotes";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Field Notes from Ava", robots: { index: false, follow: false } };

/** A person's own Field Notes (docs/living-cases.md): invitations back to a story or a task. All optional. */
export default function FieldNotesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="flex items-center gap-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
        <Icon name="mail" className="size-8 text-accent" /> Field Notes from Ava
      </h1>
      <p className="mt-2 text-lg text-ink-muted">
        Short invitations back to a story you’ve met, or to something that has changed for a task you do. None of them is required, and dismissing one never
        changes what you’ve completed.
      </p>
      <FieldNotesList />
    </div>
  );
}
