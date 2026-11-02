import { Suspense } from "react";
import type { Metadata } from "next";
import { ChallengePage } from "@/components/ChallengePage";

export const metadata: Metadata = { title: "Trilogy Challenge", robots: { index: false } };

export default function Challenge({ params }: PageProps<"/challenge/[id]">) {
  return (
    <Suspense>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/challenge/[id]">, "params">) {
  const { id } = await params;
  return <ChallengePage id={id} />;
}
