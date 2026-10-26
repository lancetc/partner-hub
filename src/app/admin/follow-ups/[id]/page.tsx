import { Suspense } from "react";
import type { Metadata } from "next";
import { FollowUpEditor } from "@/components/admin/FollowUpEditor";

export const metadata: Metadata = { title: "Follow up" };

export default function Page({ params }: PageProps<"/admin/follow-ups/[id]">) {
  return (
    <Suspense fallback={<div className="mx-auto min-h-[60vh] max-w-7xl px-4 pt-8" aria-busy="true" />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: PageProps<"/admin/follow-ups/[id]">["params"] }) {
  const { id } = await params;
  return <FollowUpEditor id={id} />;
}
