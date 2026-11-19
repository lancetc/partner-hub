import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { GuideReader } from "@/components/magazine/GuideReader";
import { loadGuide } from "@/components/magazine/loadGuide";

export const metadata: Metadata = { title: "Magazine preview", robots: { index: false, follow: false } };

/** A page of an author's preview. Nothing is recorded. */
export default function GuideDraftPagePage({ params }: PageProps<"/magazine/draft/[id]/[page]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: Pick<PageProps<"/magazine/draft/[id]/[page]">, "params">) {
  const { id, page } = await params;
  await connection();
  const { guide, base } = await loadGuide(id, true);
  if (!guide.doc.pages.some((p) => p.id === page)) notFound();
  return <GuideReader key={page} guide={guide} pageId={page} base={base} preview />;
}
