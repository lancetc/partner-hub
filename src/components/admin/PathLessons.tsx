"use client";

import { useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { Badge, input } from "./ui";
import { Icon } from "../Icon";

/*
  Adding and ordering a learning path's lessons. The picker is search-first, so it stays usable with
  hundreds of lessons: filter by audience and status, then add from the first 20 matches (or more).
  The order list is dragged by its handle (or moved with the arrow keys on the handle).
*/

export type PathLesson = { slug: string; title: string; summary?: string; minutes: number; track?: string | null; draft?: boolean };

export const trackLabel: Record<string, string> = {
  core: "Everyone",
  partner: "Service partners",
  coordinator: "Coordinators",
  briefing: "Policy briefings",
};

const PAGE = 20;

export function LessonPicker({
  catalogue,
  picked,
  onToggle,
  toolbar,
}: {
  catalogue: PathLesson[];
  picked: string[];
  onToggle: (slug: string, add: boolean) => void;
  /** Extra controls beside the filters, such as which chapter to add to. */
  toolbar?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [track, setTrack] = useState("all");
  const [status, setStatus] = useState<"all" | "published" | "draft">("all");
  const [limit, setLimit] = useState(PAGE);
  const tracks = useMemo(() => [...new Set(catalogue.map((l) => l.track).filter((t): t is string => Boolean(t)))], [catalogue]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      catalogue
        .filter(
          (l) =>
            (track === "all" || l.track === track) &&
            (status === "all" || (status === "draft") === Boolean(l.draft)) &&
            (!q || `${l.title} ${l.summary ?? ""}`.toLowerCase().includes(q)),
        )
        .sort((a, b) => a.title.localeCompare(b.title, "en-AU", { sensitivity: "base" })),
    [catalogue, track, status, q],
  );
  const shown = matches.slice(0, limit);
  const reset = () => setLimit(PAGE);

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">1. Add topics</h2>
        <span className="text-sm text-ink-muted">
          {picked.length} added · {catalogue.length} available
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm font-semibold">
          Search
          <span className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              className={cx(input, "pl-9 font-normal")}
              placeholder="Title or topic"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Audience
          <select
            className={cx(input, "w-auto font-normal")}
            value={track}
            onChange={(e) => {
              setTrack(e.target.value);
              reset();
            }}
          >
            <option value="all">All audiences</option>
            {tracks.map((t) => (
              <option key={t} value={t}>
                {trackLabel[t] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Status
          <select
            className={cx(input, "w-auto font-normal")}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              reset();
            }}
          >
            <option value="all">Published and drafts</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </label>
        {toolbar}
      </div>
      <p className="mt-3 text-sm text-ink-muted" role="status">
        {matches.length ? `Showing ${shown.length} of ${matches.length} ${matches.length === 1 ? "lesson" : "lessons"}` : "No topics match."}
      </p>
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-line rounded-2xl border border-line">
          {shown.map((l) => {
            const added = picked.includes(l.slug);
            return (
              <li key={l.slug} className={cx("flex items-center gap-3 px-3 py-2.5", added && "bg-tealtint/50")}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold leading-snug">{l.title}</span>
                    {l.draft && <Badge tone="warn">Draft</Badge>}
                  </span>
                  <span className="block truncate text-sm text-ink-muted">
                    {l.minutes} min · {trackLabel[l.track ?? ""] ?? "Everyone"}
                    {l.summary ? ` · ${l.summary}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onToggle(l.slug, !added)}
                  aria-pressed={added}
                  aria-label={added ? `Remove ${l.title} from the path` : `Add ${l.title} to the path`}
                  className={cx(
                    "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
                    added ? "bg-action text-on-action hover:bg-action-hover" : "border border-line-strong hover:bg-muted",
                  )}
                >
                  <Icon name={added ? "check" : "plus"} className="size-4" /> {added ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > shown.length && (
        <button type="button" className="mt-3 font-semibold text-accent hover:underline" onClick={() => setLimit((n) => n + PAGE)}>
          Show {Math.min(PAGE, matches.length - shown.length)} more
        </button>
      )}
    </section>
  );
}

/** The path's lessons in order. Drag the handle to move one; on the handle, the arrow keys move it too. */
export function OrderedLessons({
  slugs,
  info,
  canEdit,
  onReorder,
  onRemove,
}: {
  slugs: string[];
  info: (slug: string) => PathLesson | undefined;
  canEdit: boolean;
  onReorder: (from: number, to: number) => void;
  onRemove: (slug: string) => void;
}) {
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; startY: number; mids: number[] } | null>(null);
  const [announce, setAnnounce] = useState("");
  const [landed, setLanded] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (to === from || to < 0 || to >= slugs.length) return;
    const slug = slugs[from];
    onReorder(from, to);
    setLanded(slug);
    setAnnounce(`${info(slug)?.title ?? "Topic"} moved to position ${to + 1} of ${slugs.length}.`);
  };

  // Where the dragged lesson would land: the number of other lessons whose middle is above the pointer.
  const targetFor = (y: number, from: number, mids: number[]) => mids.filter((m, i) => i !== from && m < y).length;

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <ol className={cx("relative flex flex-col gap-2", drag && "select-none")}>
        {slugs.map((slug, i) => {
          const l = info(slug);
          const dragging = drag?.from === i;
          // The drop line sits above the lesson that will follow the dropped one.
          const lineBefore = drag && drag.to !== drag.from && (drag.to < drag.from ? i === drag.to : i === drag.to + 1);
          return (
            <li
              key={slug}
              ref={(el) => void (items.current[i] = el)}
              className={cx(
                "relative flex items-center gap-3 rounded-2xl bg-muted p-3 transition-shadow",
                dragging && "z-10 shadow-xl ring-2 ring-action",
                landed === slug && !drag && "animate-card-in",
              )}
              style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
            >
              {lineBefore && (
                <span aria-hidden className="absolute -top-[5px] left-2 right-2 h-1 rounded-full bg-action shadow-[0_0_0_3px_rgb(0_130_138/0.2)]" />
              )}
              {drag && drag.to === slugs.length - 1 && drag.from !== slugs.length - 1 && i === slugs.length - 1 && (
                <span aria-hidden className="absolute -bottom-[5px] left-2 right-2 h-1 rounded-full bg-action shadow-[0_0_0_3px_rgb(0_130_138/0.2)]" />
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Move ${l?.title ?? slug}. Drag, or use the up and down arrow keys.`}
                  title="Drag to reorder"
                  className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink active:cursor-grabbing"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const mids = items.current.slice(0, slugs.length).map((el) => {
                      const r = el!.getBoundingClientRect();
                      return r.top + r.height / 2;
                    });
                    setDrag({ from: i, to: i, dy: 0, startY: e.clientY, mids });
                  }}
                  onPointerMove={(e) => {
                    if (!drag || drag.from !== i) return;
                    const pointer = drag.mids[i] + (e.clientY - drag.startY);
                    setDrag({ ...drag, dy: e.clientY - drag.startY, to: targetFor(pointer, i, drag.mids) });
                  }}
                  onPointerUp={() => {
                    if (!drag) return;
                    const { from, to } = drag;
                    setDrag(null);
                    move(from, to);
                  }}
                  onPointerCancel={() => setDrag(null)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                      e.preventDefault();
                      move(i, i + (e.key === "ArrowUp" ? -1 : 1));
                    }
                  }}
                >
                  <Icon name="grip" className="size-5" />
                </button>
              )}
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-action font-mulish text-sm font-extrabold text-on-action">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold leading-snug">{l?.title ?? slug}</span>
                  {l?.draft && <Badge tone="warn">Draft · coming soon for learners</Badge>}
                </span>
                <span className="text-sm text-ink-muted">
                  {l?.minutes ?? 0} min · {trackLabel[l?.track ?? ""] ?? "Everyone"}
                </span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onRemove(slug)}
                  aria-label={`Remove ${l?.title ?? slug}`}
                  title="Remove from the path"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface hover:text-danger"
                >
                  <Icon name="close" className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
