import type { Metadata } from "next";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { BusinessContribute } from "@/components/business/BusinessContribute";

export const metadata: Metadata = { title: "Contribute a Business Field Note", robots: { index: false, follow: false } };

/** "Contribute a note" for verified Care Partner principals (docs/business-field-notes.md). Optional, and reviewed with the contributor. */
export default function ContributeBusinessNotePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <BusinessHeader back={{ href: "/business-notes", label: "Business Field Notes" }} />
      <BusinessContribute />
    </div>
  );
}
