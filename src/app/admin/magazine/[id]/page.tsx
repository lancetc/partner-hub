import type { Metadata } from "next";
import { Suspense } from "react";
import { MagazineEditor } from "@/components/admin/MagazineEditor";

export const metadata: Metadata = { title: "Edit guide" };

/** The Magazine editor. The guide's id is only known per request, so the page streams in. */
export default function AdminMagazineGuidePage({ params }: PageProps<"/admin/magazine/[id]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-ink-muted">Loading…</p>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/magazine/[id]">, "params">) {
  const { id } = await params;
  return <MagazineEditor id={id} />;
}
