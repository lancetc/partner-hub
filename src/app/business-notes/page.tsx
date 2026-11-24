import type { Metadata } from "next";
import { BusinessHeader } from "@/components/business/BusinessHeader";
import { BusinessDeck } from "@/components/business/BusinessDeck";
import { PlanCapacityCard } from "@/components/tools/PlanCapacityCard";

// For verified principals only, and personal to them: kept out of search engines. The cards come from the API, which checks access.
export const metadata: Metadata = { title: "Business Field Notes", robots: { index: false, follow: false } };

/** Care Partner Business Field Notes (docs/business-field-notes.md): the business edition of Notes to a Younger Me. */
export default function BusinessNotesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pt-8">
      <BusinessHeader />
      {/* Plan capacity: only for someone who may plan the business; renders nothing for anyone else. */}
      <PlanCapacityCard />
      <BusinessDeck />
    </div>
  );
}
