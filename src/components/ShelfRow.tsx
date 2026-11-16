"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
  One row to browse (Recently added, Popular with your colleagues…): a title and a line about it, back
  and forward buttons on a computer, "See all", and the tiles scrolling sideways. Topics and Discovery
  Paths both use it; the tiles are the page's own, passed as children (each an <li>).
*/
export function ShelfRow({
  id,
  title,
  blurb,
  count,
  onSeeAll,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  /** How many tiles, so the buttons know when the row changes. */
  count: number;
  onSeeAll: () => void;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const measure = () => {
    const el = row.current;
    if (el) setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(measure, [count]);
  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };
  const headingId = `shelf-${id}`;
  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-serif text-xl font-semibold">
            {title}
          </h3>
          <p className="text-sm text-ink-muted">{blurb}</p>
        </div>
        <div className="hidden gap-1 sm:flex">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => page(dir)}
              disabled={dir === -1 ? edges.start : edges.end}
              aria-label={`${dir === -1 ? "Back" : "More"}: ${title}`}
              className="grid size-10 place-items-center rounded-full border border-line-strong hover:bg-muted disabled:opacity-30"
            >
              <Icon name={dir === -1 ? "arrow-left" : "arrow-right"} className="size-4" />
            </button>
          ))}
        </div>
        <button type="button" onClick={onSeeAll} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-semibold text-accent hover:underline">
          See all <Icon name="arrow-right" className="size-4" />
        </button>
      </div>
      <ul
        ref={row}
        onScroll={measure}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
    </section>
  );
}
