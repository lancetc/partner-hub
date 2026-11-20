import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { MyCapabilities } from "@/components/capability/MyCapabilities";

// Personal to the signed-in person, so kept out of search results.
export const metadata: Metadata = { title: "My Capabilities", robots: { index: false, follow: false } };

/** My Capabilities (docs/capability-intelligence.md): what a person's role asks for, and the evidence recorded for each. */
export default function MyCapabilitiesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHero eyebrow="My training" title="My Capabilities">
        What your role asks you to be able to do, and the evidence the Hub has for each. It shows what has been recorded, not a score.
      </PageHero>
      <MyCapabilities />
    </div>
  );
}
