"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { api, useApi } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { cx } from "@/lib/format";
import { locatePassage } from "@/lib/passageMatch";
import type { PageMark, PassageKind } from "@/server/favourites";
import { Icon } from "../Icon";

/*
  A subtle marker on passages this reader saved earlier (docs/job-aids.md, PRD 4.2). Theirs only: the server works
  out which of their own Favourites are on this page, and marks only words that are there now exactly as they were
  saved. A passage whose wording changed or went, or whose source was published again and not yet checked, isn't
  marked: Favourites says what happened to it.

  - The words get a tint and a dotted underline, drawn with the CSS Custom Highlight API, so the published text
    itself is never changed or wrapped. Never colour alone: a labelled "Your highlight" button follows the part of
    the page the passage is in, for keyboard and screen readers, and the underline is there without colour.
  - Focusing that button, or clicking the marked words, or selecting inside them, offers Open in Favourites and
    Remove. Hidden when printed (globals.css), and drawn with the theme's colours in dark mode.
  - Browsers without the Highlight API still get the buttons.
*/

/** Sent after anything adds to or removes from Favourites, so the marks on the page catch up. */
export const FAVOURITES_CHANGED = "tc-favourites-changed";
export const favouritesChanged = () => window.dispatchEvent(new Event(FAVOURITES_CHANGED));

type Marks = {
  marks: PageMark[];
  open: string | null;
  setOpen: (id: string | null) => void;
  setActive: (id: string | null) => void;
  remove: (id: string) => Promise<void>;
  /** The saved passage a selection sits wholly inside, if there is one. */
  markIn: (range: Range) => PageMark | null;
};
const MarksContext = createContext<Marks | null>(null);
export const useMarks = () => useContext(MarksContext);

// Every marker on the page paints into the same two highlights, so two marked areas don't wipe each other out.
const painted = new Map<object, { all: Range[]; active: Range[] }>();
function flush() {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return;
  const all = [...painted.values()].flatMap((p) => p.all);
  const active = [...painted.values()].flatMap((p) => p.active);
  CSS.highlights.set("tc-saved", new Highlight(...all));
  CSS.highlights.set("tc-saved-active", new Highlight(...active));
}

/** The part of the page a passage is in: a block marked for highlighting, a Magazine block, or the area itself. */
function partOf(host: HTMLElement, id: string) {
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, "");
  return host.dataset.hl === id ? host : (host.querySelector<HTMLElement>(`[data-hl="${esc}"]`) ?? host.querySelector<HTMLElement>(`#block-${esc}`));
}

/** Elements that sit inside a line of text (bold, a link) rather than starting a new one. */
const INLINE = /^(A|ABBR|B|BDI|BDO|CITE|CODE|DFN|EM|I|KBD|MARK|Q|S|SAMP|SMALL|SPAN|STRONG|SUB|SUP|TIME|U|VAR)$/;

/** The words of a saved passage in a part of the page, as a Range over its text. Buttons and labels added around the text don't count. */
export function rangeOf(el: HTMLElement, quote: string): Range | null {
  const nodes: Text[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest("[data-hl-skip], script, style") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text);
  // Text in a different paragraph, heading or list item from the one before reads as a new line, though the page has no space there.
  const line = (n: Node) => {
    let e = n.parentElement;
    while (e && e !== el && INLINE.test(e.tagName)) e = e.parentElement;
    return e;
  };
  const span = locatePassage(
    nodes.map((n) => n.data),
    quote,
    nodes.map((n, i) => i > 0 && line(n) !== line(nodes[i - 1])),
  );
  if (!span) return null;
  const r = document.createRange();
  r.setStart(nodes[span.start[0]], span.start[1]);
  r.setEnd(nodes[span.end[0]], span.end[1]);
  return r;
}

/** Where a click landed in the text, in browsers that say. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
  if (typeof d.caretPositionFromPoint === "function") {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/**
  Marks this reader's earlier highlights in `root`, and gives the buttons beside them (SavedMarkChips) and the
  selection button (Highlighter) what they need. `page` is a guide's page or a Topic's card.
*/
export function SavedMarks({
  root,
  source,
  id,
  page,
  off,
  children,
}: {
  root: RefObject<HTMLElement | null>;
  source: PassageKind;
  id: string;
  page?: string;
  off?: boolean;
  children: ReactNode;
}) {
  const url = off ? null : `/api/favourites?${new URLSearchParams({ marks: source, id, ...(page && { page }) })}`;
  const loaded = useApi<{ marks: PageMark[] }>(url);
  const marks = useMemo(() => (off ? [] : (loaded.data?.marks ?? [])), [off, loaded.data]);
  const [open, setOpen] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const ranges = useRef(new Map<string, Range>());
  const key = useRef({});
  const { reload } = loaded;

  // A save or a removal anywhere on the page: fetch the marks again.
  useEffect(() => {
    if (off) return;
    window.addEventListener(FAVOURITES_CHANGED, reload);
    return () => window.removeEventListener(FAVOURITES_CHANGED, reload);
  }, [off, reload]);

  // Paint the marks, and again whenever the text under them is redrawn (a section revealed, a card's details opened).
  useEffect(() => {
    const host = root.current;
    const me = key.current;
    const paint = () => {
      ranges.current = new Map();
      const all: Range[] = [];
      const lit: Range[] = [];
      for (const m of marks) {
        const el = host && partOf(host, m.blockId);
        const r = el && rangeOf(el, m.quote);
        if (!r) continue;
        ranges.current.set(m.id, r);
        all.push(r);
        if (m.id === active || m.id === open) lit.push(r);
      }
      painted.set(me, { all, active: lit });
      flush();
    };
    paint();
    let timer = 0;
    const watch =
      host && marks.length
        ? new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(paint, 120);
          })
        : null;
    if (watch && host) watch.observe(host, { childList: true, subtree: true, characterData: true });
    return () => {
      watch?.disconnect();
      window.clearTimeout(timer);
      painted.delete(me);
      flush();
    };
  }, [root, marks, active, open]);

  // Clicking the marked words offers what can be done with them, beside them.
  useEffect(() => {
    const host = root.current;
    if (!host || !marks.length) return;
    const onClick = (e: MouseEvent) => {
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed) return;
      const at = caretAt(e.clientX, e.clientY);
      if (!at) return;
      for (const [id, r] of ranges.current)
        if (r.isPointInRange(at.node, at.offset)) {
          setOpen(id);
          return;
        }
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [root, marks]);

  const remove = useCallback(async (id: string) => {
    const ok = await confirmAction("This highlight is removed from your Favourites. The guidance itself isn’t changed.", { confirmLabel: "Remove" });
    if (!ok) return;
    await api("/api/favourites", { body: { action: "remove", id } });
    setOpen(null);
    setActive(null);
    favouritesChanged();
  }, []);
  const markIn = useCallback(
    (range: Range) => {
      for (const m of marks) {
        const r = ranges.current.get(m.id);
        if (r && range.compareBoundaryPoints(Range.START_TO_START, r) >= 0 && range.compareBoundaryPoints(Range.END_TO_END, r) <= 0) return m;
      }
      return null;
    },
    [marks],
  );
  const value = useMemo(() => ({ marks, open, setOpen, setActive, remove, markIn }), [marks, open, remove, markIn]);
  return <MarksContext.Provider value={value}>{children}</MarksContext.Provider>;
}

/**
  After a part of the page with a saved passage in it: a labelled button per passage. Focusing it lights the words
  up and offers Open in Favourites and Remove. Nothing at all when there's no saved passage here.
*/
export function SavedMarkChips({ blockId, className }: { blockId: string; className?: string }) {
  const ctx = useMarks();
  const mine = ctx?.marks.filter((m) => m.blockId === blockId) ?? [];
  if (!ctx || !mine.length) return null;
  return (
    <div data-hl-skip className={cx("flex select-none flex-col items-start gap-1 print:hidden", className)}>
      {mine.map((m) => (
        <MarkChip key={m.id} mark={m} ctx={ctx} />
      ))}
    </div>
  );
}

function MarkChip({ mark, ctx }: { mark: PageMark; ctx: Marks }) {
  const open = ctx.open === mark.id;
  const [error, setError] = useState("");
  return (
    <div
      className="group/mark flex flex-wrap items-center gap-x-1 text-sm"
      onMouseEnter={() => ctx.setActive(mark.id)}
      onMouseLeave={() => ctx.setActive(null)}
      onFocus={() => ctx.setActive(mark.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) ctx.setActive(null);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => ctx.setOpen(open ? null : mark.id)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-[#8a6100] bg-[#ffc72c]/20 px-3 font-semibold hover:bg-[#ffc72c]/35 dark:border-[#ffd97a] dark:bg-[#ffc72c]/15 dark:hover:bg-[#ffc72c]/30"
      >
        <Icon name="bookmark-filled" className="size-4 shrink-0" />
        Your highlight
        <span className="sr-only">: “{mark.quote}”</span>
      </button>
      {/* Shown while it has focus, when it's pressed, or when the marked words were clicked: never hover-only. */}
      <span className={cx(open ? "inline-flex" : "hidden group-focus-within/mark:inline-flex group-hover/mark:inline-flex", "flex-wrap items-center")}>
        {/* Which passage, in words: several can be in one part, and one can be words this page doesn't show (a Job Aid's quick action). */}
        <span aria-hidden className="px-2 opacity-80">
          “{mark.quote.length > 70 ? `${mark.quote.slice(0, 70).replace(/\s+\S*$/, "")}…` : mark.quote}”
        </span>
        <Link href={`/favourites#${mark.id}`} className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-2">
          Open in Favourites
        </Link>
        <button
          type="button"
          className="min-h-11 px-2 font-semibold underline underline-offset-2"
          onClick={() => {
            setError("");
            ctx.remove(mark.id).catch((e: unknown) => setError(e instanceof Error ? e.message : "That couldn’t be removed. Try again."));
          }}
        >
          Remove
        </button>
      </span>
      {error && (
        <span role="alert" className="basis-full font-semibold text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
