import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { GuideReader } from "@/components/magazine/GuideReader";
import { EditGuideLink } from "@/components/magazine/EditGuideLink";
import { loadGuide } from "@/components/magazine/loadGuide";

export const metadata: Metadata = { title: "Magazine" };

/** One page of a Magazine course. */
export default function GuidePagePage({ params }: PageProps<"/magazine/[slug]/[page]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Reader params={params} />
    </Suspense>
  );
}

async function Reader({ params }: Pick<PageProps<"/magazine/[slug]/[page]">, "params">) {
  const { slug, page } = await params;
  await connection();
  const { guide, base, canEdit } = await loadGuide(slug, false);
  if (!guide.doc.pages.some((p) => p.id === page)) notFound();
  return (
    <>
      {canEdit && <EditGuideLink id={guide.id} pageId={page} />}
      <GuideReader key={page} guide={guide} pageId={page} base={base} />
    </>
  );
}
