import { Suspense } from "react";
import type { Metadata } from "next";
import { PathBuilder } from "@/components/admin/PathBuilder";

export const metadata: Metadata = { title: "Learning path" };

export default function Page({ params }: PageProps<"/admin/schedules/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[60vh] max-w-7xl px-4 pt-8" aria-busy="true" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/schedules/[id]">["params"] }) {
  const { id } = await params;
  return <PathBuilder id={id} />;
}
