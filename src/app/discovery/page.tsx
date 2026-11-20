import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { MyDiscovery } from "@/components/discovery/MyDiscovery";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "My Discovery", robots: { index: false, follow: false } };

/** My Discovery (docs/discovery-paths.md): the learner's own Discovery Paths, and where a new one starts. */
export default function MyDiscoveryPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero eyebrow="My training" title="My Discovery">
        Your own routes through Hub learning, built around what you want to get better at. Only you can see them.
      </PageHero>
      <p className="mt-4 text-ink-muted">
        Training you’ve been assigned, and the paths that earn a certificate, are on{" "}
        <Link href="/paths" className="font-semibold text-accent underline-offset-4 hover:underline">
          Discovery Paths
        </Link>{" "}
        and{" "}
        <Link href="/topics" className="font-semibold text-accent underline-offset-4 hover:underline">
          Topics
        </Link>
        . Nothing on this page changes those.
      </p>
      <MyDiscovery />
    </div>
  );
}
