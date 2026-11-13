"use client";

import { useState } from "react";
import { categories, type CategoryId, type Story } from "@/content/stories";
import { StoryTile } from "./StoryTile";
import { cx } from "@/lib/format";

export function NewsGrid({ stories }: { stories: Story[] }) {
  const [filter, setFilter] = useState<CategoryId | "all">("all");
  const filtered = filter === "all" ? stories : stories.filter((s) => s.category === filter);

  return (
    <>
      <div className="-mx-4 sm:-mx-6">
        <div role="group" aria-label="Filter stories by category" className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6">
          {[{ id: "all" as const, label: "All stories" }, ...categories].map((c) => {
            const active = filter === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(c.id)}
                className={cx(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  active ? "border-action bg-action text-on-action" : "border-line-strong text-ink hover:bg-muted",
                )}
              >
                {active && <span aria-hidden>✓</span>}
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="sr-only" role="status">
        {filter === "all" ? `Showing all ${stories.length} stories` : `Showing ${filtered.length} ${categories.find((c) => c.id === filter)?.label}`}
      </p>

      {filter === "all" ? <EditorialLayout stories={stories} /> : <FilteredLayout stories={filtered} />}
    </>
  );
}

function EditorialLayout({ stories }: { stories: Story[] }) {
  const lead = stories[0];
  const policy = stories.find((s) => s.policy && s !== lead)!;
  const rest = stories.filter((s) => s !== lead && s !== policy);
  const side = rest.slice(0, 3);
  const row = rest.slice(3, 7);
  const wide = rest[7];
  const more = rest.slice(8);

  return (
    <div data-build-tiles className="mt-6 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-12">
      <StoryTile story={lead} size="lead" className="order-1 sm:col-span-2 lg:order-2 lg:col-span-6" />
      <StoryTile story={policy} size="policy" className="order-2 sm:col-span-2 lg:order-3 lg:col-span-3" />
      <div className="order-3 flex flex-col gap-4 sm:col-span-2 lg:order-1 lg:col-span-3 lg:border-r lg:border-line lg:pr-8">
        <SectionHeading>Latest</SectionHeading>
        {side.map((s) => (
          <StoryTile key={s.slug} story={s} size="text" className="first-of-type:border-t-0 first-of-type:pt-0" />
        ))}
      </div>

      <div className="order-4 sm:col-span-2 lg:col-span-12">
        <SectionHeading>This week</SectionHeading>
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {row.map((s) => (
            <StoryTile key={s.slug} story={s} />
          ))}
        </div>
      </div>

      {wide && <StoryTile story={wide} size="wide" className="order-5 sm:col-span-2 lg:col-span-8" />}
      {more.length > 0 && (
        <div className="order-6 sm:col-span-2 lg:col-span-4">
          <SectionHeading>More updates</SectionHeading>
          <div className="flex flex-col gap-4">
            {more.map((s) => (
              <StoryTile key={s.slug} story={s} size="compact" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FilteredLayout({ stories }: { stories: Story[] }) {
  if (!stories.length) {
    return <p className="mt-10 rounded-2xl bg-muted p-6 text-ink-muted">No stories in this category yet.</p>;
  }
  return (
    <div data-build-tiles className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {stories.map((s) => (
        <StoryTile key={s.slug} story={s} size={s.policy ? "policy" : "standard"} />
      ))}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-5 flex items-center gap-4 font-mulish text-sm font-extrabold uppercase tracking-[0.14em] text-ink">
      {children}
      <span aria-hidden className="h-px flex-1 bg-line-strong" />
    </h2>
  );
}
