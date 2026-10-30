import { Suspense } from "react";
import type { Metadata } from "next";
import { FollowUpPlayer } from "@/components/player/FollowUpPlayer";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "Follow up", robots: { index: false, follow: false } };

export default function FollowUpPage({ params }: PageProps<"/learning/follow-ups/[id]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 bg-strong" aria-busy="true" />}>
      <Player params={params} />
    </Suspense>
  );
}

async function Player({ params }: { params: PageProps<"/learning/follow-ups/[id]">["params"] }) {
  const { id } = await params;
  return <FollowUpPlayer id={id} />;
}
