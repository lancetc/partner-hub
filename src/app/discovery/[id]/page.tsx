import type { Metadata } from "next";
import { Suspense } from "react";
import { DiscoveryPathView } from "@/components/discovery/DiscoveryPathView";

export const metadata: Metadata = { title: "My Discovery Path", robots: { index: false, follow: false } };

/** One of the learner's own Discovery Paths: follow it, and change it, on the same page. */
export default function DiscoveryPathPage({ params }: PageProps<"/discovery/[id]">) {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6 lg:pt-6">
      <Suspense fallback={<p className="mt-6 text-ink-muted">Loading your path…</p>}>
        <Path params={params} />
      </Suspense>
    </div>
  );
}

/** The id comes from the address, so it's read inside Suspense. The path itself loads in the browser, for the signed-in person only. */
async function Path({ params }: Pick<PageProps<"/discovery/[id]">, "params">) {
  const { id } = await params;
  return <DiscoveryPathView key={id} id={id} />;
}
