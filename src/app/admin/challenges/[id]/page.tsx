import { Suspense } from "react";
import type { Metadata } from "next";
import { ChallengeEditor } from "@/components/admin/Challenges";

export const metadata: Metadata = { title: "Challenge" };

export default function ChallengePage({ params }: PageProps<"/admin/challenges/[id]">) {
  return (
    <Suspense>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/challenges/[id]">, "params">) {
  const { id } = await params;
  return <ChallengeEditor id={id} />;
}
