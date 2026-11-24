import { Suspense } from "react";
import type { Metadata } from "next";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { BusinessDeck } from "@/components/business/BusinessDeck";

// A direct link to one card. The page holds no card content: the API decides whether this reader may see it.
export const metadata: Metadata = { title: "Business Field Note", robots: { index: false, follow: false } };

export default function BusinessNotePage({ params, searchParams }: PageProps<"/business-notes/[id]">) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <BusinessHeader back={{ href: "/business-notes", label: "Business Field Notes" }} />
      <Suspense>
        <Deck params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Deck({ params, searchParams }: Pick<PageProps<"/business-notes/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  // ?v= from an old bookmark or copied link; ?chapter= from a check-in notice.
  const { v, chapter } = await searchParams;
  return (
    <BusinessDeck
      key={id}
      initialId={id}
      fromVersion={typeof v === "string" ? v : undefined}
      openChapter={typeof chapter === "string" && Number(chapter) > 0 ? Number(chapter) : undefined}
    />
  );
}
