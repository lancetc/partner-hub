import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CourseOverview, GuideReader } from "@/components/magazine/GuideReader";
import { loadGuide } from "@/components/magazine/loadGuide";

export const metadata: Metadata = { title: "Magazine preview", robots: { index: false, follow: false } };

/** An author's preview of a course's saved draft, drawn exactly as learners will see it. Nothing is recorded. */
export default function GuideDraftPage({ params }: PageProps<"/magazine/draft/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Draft params={params} />
    </Suspense>
  );
}

async function Draft({ params }: Pick<PageProps<"/magazine/draft/[id]">, "params">) {
  const { id } = await params;
  await connection();
  const { guide, base } = await loadGuide(id, true);
  return guide.doc.pages.length > 1 ? <CourseOverview guide={guide} base={base} preview /> : <GuideReader guide={guide} pageId={guide.doc.pages[0].id} base={base} preview />;
}
