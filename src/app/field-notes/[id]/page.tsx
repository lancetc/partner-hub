import { Suspense } from "react";
import type { Metadata } from "next";
import { OpenNote } from "@/components/living/FieldNotes";

export const metadata: Metadata = { title: "Opening a Field Note", robots: { index: false, follow: false } };

/** One note being opened: checked again, marked read, and followed to its page. */
export default function FieldNotePage({ params }: PageProps<"/field-notes/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:pt-10">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Field Notes from Ava</h1>
      <Suspense>
        <Open params={params} />
      </Suspense>
    </div>
  );
}

async function Open({ params }: Pick<PageProps<"/field-notes/[id]">, "params">) {
  const { id } = await params;
  return <OpenNote id={id} />;
}
