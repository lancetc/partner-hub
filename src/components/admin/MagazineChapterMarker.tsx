"use client";

import type { Page } from "@/lib/magazine";
import { chapterOf } from "@/lib/magazineChapters";
import { Icon } from "../Icon";
import { InlineText } from "./MagazineEditParts";
import { btn } from "./ui";
import { cx } from "@/lib/format";

/*
  Chapters in the course outline (lib/magazineChapters): a page can start a chapter, which runs until the next page that
  starts one. On a page that starts a chapter: its title and introduction, edited in place, and Remove chapter. On any
  other page of a course: which chapter it's in, and Start a chapter here.
*/
export function ChapterMarker({
  page,
  pages,
  updatePage,
}: {
  page: Page;
  pages: Page[];
  updatePage: (pid: string, fn: (p: Page) => void, tag?: string) => void;
}) {
  if (pages.length < 2) return null;
  const ch = chapterOf(pages, page.id);
  if (page.chapter && ch)
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border-l-[3px] border-accent bg-tealtint px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mulish text-xs font-extrabold uppercase tracking-[0.12em] text-accent">Chapter {ch.number} starts here</span>
          <button
            type="button"
            className={cx(btn.quiet, "min-h-8 text-sm")}
            onClick={() => updatePage(page.id, (x) => void delete x.chapter)}
            aria-label={`Remove chapter ${ch.number}`}
          >
            <Icon name="close" className="size-4" /> Remove chapter
          </button>
        </div>
        <InlineText
          value={page.chapter.title}
          onChange={(v) => updatePage(page.id, (x) => void (x.chapter = { ...x.chapter, title: v }), `${page.id}:chapter-title`)}
          placeholder="Chapter title"
          className="font-serif text-lg font-semibold"
        />
        <InlineText
          value={page.chapter.intro ?? ""}
          onChange={(v) =>
            updatePage(
              page.id,
              (x) => {
                const title = x.chapter?.title ?? "";
                x.chapter = v.trim() ? { title, intro: v } : { title };
              },
              `${page.id}:chapter-intro`,
            )
          }
          placeholder="A short introduction to the chapter (optional)"
          multiline
          className="text-sm text-ink-muted"
        />
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
      {ch && <span className="font-mulish text-xs font-bold uppercase tracking-[0.1em]">In chapter {ch.number}</span>}
      <button
        type="button"
        className={cx(btn.quiet, "min-h-8 text-sm")}
        onClick={() => updatePage(page.id, (x) => void (x.chapter = { title: "" }))}
        aria-label={`Start a chapter at “${page.title || "this page"}”`}
      >
        <Icon name="plus" className="size-4" /> Start a chapter here
      </button>
    </div>
  );
}
