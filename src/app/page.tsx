import { stories } from "@/content/stories";
import { NewsGrid } from "@/components/NewsGrid";
import { ActionStrip } from "@/components/ActionStrip";

export default function NewsHome() {
  const ordered = [...stories].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:pt-8">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-[2.75rem]">The latest at Trilogy</h1>
          <p className="mt-1 max-w-2xl text-lg text-ink-muted">
            News, practical learning and updates for our service partners and care coordinators.
          </p>
        </div>
        <p className="font-mulish text-sm font-semibold text-ink-muted">
          <span className="rounded-full bg-muted px-3 py-1">Demonstration content</span>
        </p>
      </header>
      <ActionStrip />
      <div className="mt-6">
        <NewsGrid stories={ordered} />
      </div>
    </div>
  );
}
