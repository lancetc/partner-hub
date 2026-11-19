import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { CourseOverview, GuideReader } from "@/components/magazine/GuideReader";
import { EditGuideLink } from "@/components/magazine/EditGuideLink";
import { loadGuide } from "@/components/magazine/loadGuide";

export const metadata: Metadata = { title: "Magazine" };

/** A Magazine: a one-page guide opens on its article, a course on its overview. Who may read it depends on who's signed in. */
export default function GuidePage({ params }: PageProps<"/magazine/[slug]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Guide params={params} />
    </Suspense>
  );
}

async function Guide({ params }: Pick<PageProps<"/magazine/[slug]">, "params">) {
  const { slug } = await params;
  await connection();
  const { guide, base, canEdit } = await loadGuide(slug, false);
  return (
    <>
      {canEdit && <EditGuideLink id={guide.id} />}
      {guide.doc.pages.length > 1 ? <CourseOverview guide={guide} base={base} /> : <GuideReader guide={guide} pageId={guide.doc.pages[0].id} base={base} />}
    </>
  );
}
