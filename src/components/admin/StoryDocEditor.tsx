"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoryBlock } from "@/content/stories";
import { cx } from "@/lib/format";
import { safeHref } from "@/lib/richText";
import { figureHtml, storyFromDom, storyToHtml } from "@/lib/storyDoc";
import { Icon } from "../Icon";
import { DescribeButton, ImageLibraryDialog, type PickedPicture } from "./ImagePicker";

/*
  A news story's text as one document, like a word processor: a text style (paragraph, heading,
  subheading, quote), bold, italics, links, lists, tables and pictures, all in one place. What's
  stored is still the story's blocks (lib/storyDoc); pasted content is read into those blocks and
  drawn again, so nothing comes in except the formatting the story page supports.
*/

/** The open picture's details (the element itself is kept in a ref). */
type Figure = { alt: string; caption: string; align: Extract<StoryBlock, { type: "image" }>["align"]; lightbox?: boolean };

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);
const STYLES = [
  { value: "p", label: "Paragraph" },
  { value: "h2", label: "Heading" },
  { value: "h3", label: "Subheading" },
  { value: "blockquote", label: "Quote" },
];
const ALIGNS: { value: Figure["align"]; label: string }[] = [
  { value: "left", label: "Left, text beside" },
  { value: "right", label: "Right, text beside" },
  { value: "center", label: "Centre" },
  { value: "full", label: "Full width" },
];
const NEW_TABLE = "<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr></tbody></table><p><br></p>";

function blockOf(root: HTMLElement | null) {
  let n = document.getSelection()?.anchorNode ?? null;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n && root?.contains(n) ? (n as HTMLElement) : null;
}

export function StoryDocEditor({ value, onChange }: { value: StoryBlock[]; onChange: (blocks: StoryBlock[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef(JSON.stringify(value));
  const saved = useRef<Range | null>(null);
  const [initial] = useState(() => storyToHtml(value));
  const [style, setStyle] = useState("p");
  const [linking, setLinking] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  // A picture chosen in the library, put in once the library has closed: while that modal dialog is open the rest of the
  // page is inert, so the story can't take the cursor or the picture (the owner's bug report, Nov 2026).
  const [pending, setPending] = useState<PickedPicture | null>(null);
  const [figure, setFigure] = useState<Figure | null>(null);
  const figureEl = useRef<HTMLElement | null>(null);

  const emit = () => {
    if (!ref.current) return;
    const blocks = storyFromDom(ref.current);
    const json = JSON.stringify(blocks);
    if (json !== last.current) {
      last.current = json;
      onChange(blocks);
    }
  };

  // A whole new story from outside (Claude's draft, putting it back): redraw while not being edited.
  useEffect(() => {
    const el = ref.current;
    const json = JSON.stringify(value);
    if (el && json !== last.current && !el.contains(document.activeElement)) {
      el.innerHTML = storyToHtml(value);
      last.current = json;
    }
  }, [value]);

  // The text style menu follows the cursor.
  useEffect(() => {
    const update = () => {
      const b = blockOf(ref.current);
      const tag = b?.nodeName.toLowerCase();
      setStyle(tag === "h2" || tag === "h3" || tag === "blockquote" ? tag : "p");
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, []);

  const run = (fn: () => void) => {
    ref.current?.focus();
    fn();
    emit();
  };
  const keepSelection = () => {
    const sel = document.getSelection();
    saved.current = sel && sel.rangeCount && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
  };
  const restoreSelection = () => {
    ref.current?.focus();
    const sel = document.getSelection();
    if (!sel) return;
    if (saved.current) {
      sel.removeAllRanges();
      sel.addRange(saved.current);
    } else if (ref.current && !(sel.rangeCount && ref.current.contains(sel.anchorNode))) {
      // The cursor wasn't in the story: carry on at its end.
      const end = document.createRange();
      end.selectNodeContents(ref.current);
      end.collapse(false);
      sel.removeAllRanges();
      sel.addRange(end);
    }
  };

  function applyLink() {
    const href = safeHref(linking ?? "");
    setLinking(null);
    if (!href) return;
    restoreSelection();
    if (saved.current?.collapsed) exec("insertHTML", `<a href="${href.replace(/"/g, "&quot;")}">${href.replace(/</g, "&lt;")}</a>`);
    else exec("createLink", href);
    emit();
  }

  function insertPicture(p: PickedPicture) {
    restoreSelection();
    // A picture from the library brings its description with it.
    const alt = p.alt ?? "";
    exec("insertHTML", `${figureHtml({ type: "image", src: p.src, width: p.width, height: p.height, alt, align: "full" })}<p><br></p>`);
    emit();
    // Open its details straight away: it needs a description (or a check of the one it brought).
    const figs = ref.current?.querySelectorAll<HTMLElement>(`figure[data-src="${CSS.escape(p.src)}"]`);
    const el = figs?.[figs.length - 1];
    if (el) select(el, { alt, caption: "", align: "full" });
  }

  // The picture chosen in the library goes in once the library has closed.
  useEffect(() => {
    if (library || !pending) return;
    const p = pending;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(null);
    insertPicture(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, pending]);

  const wrapEl = useRef<HTMLDivElement>(null);
  const panelEl = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const fig = figureEl.current;
    const w = wrapEl.current;
    if (!figure || !fig || !w) {
      setPlace(null);
      return;
    }
    const measure = () => {
      const wr = w.getBoundingClientRect();
      const fr = fig.getBoundingClientRect();
      const width = Math.round(Math.min(wr.width - 16, Math.max(fr.width, 352)));
      const left = Math.round(Math.min(Math.max(8, fr.left - wr.left), wr.width - width - 8));
      const top = Math.round(fr.bottom - wr.top + 8);
      setPlace((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }));
      fig.style.marginBottom = `${(panelEl.current?.offsetHeight ?? 0) + 16}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(w);
    ro.observe(fig);
    if (panelEl.current) ro.observe(panelEl.current);
    return () => {
      ro.disconnect();
      fig.style.marginBottom = "";
    };
  }, [figure]);

  /** The picture whose details are open, outlined in the document. */
  function select(el: HTMLElement | null, f: Figure | null) {
    ref.current?.querySelectorAll("figure[data-selected]").forEach((x) => x.removeAttribute("data-selected"));
    el?.setAttribute("data-selected", "");
    figureEl.current = el;
    setFigure(f);
  }

  function updateFigure(patch: Partial<Figure>) {
    const el = figureEl.current;
    if (!figure || !el) return;
    const next = { ...figure, ...patch };
    el.dataset.alt = next.alt;
    el.dataset.caption = next.caption;
    el.dataset.align = next.align;
    if (next.lightbox) el.dataset.lightbox = "1";
    else delete el.dataset.lightbox;
    el.querySelector("img")?.setAttribute("alt", next.alt);
    // Under the picture: its caption, or else its description, as readers will see it.
    const shown = next.caption || next.alt;
    let cap = el.querySelector("figcaption");
    if (shown && !cap) cap = el.appendChild(document.createElement("figcaption"));
    if (cap) {
      if (shown) cap.textContent = shown;
      else cap.remove();
    }
    setFigure(next);
    emit();
  }

  const startLink = () => {
    keepSelection();
    setLinking("https://");
  };

  return (
    <section aria-label="The story" className="flex flex-col">
      <h2 className="mb-1.5 text-sm font-semibold">The story</h2>
      <div className="rounded-2xl border border-line-strong bg-surface focus-within:ring-2 focus-within:ring-action/50">
        <div
          role="toolbar"
          aria-label="Story formatting"
          className="sticky top-16 z-10 flex flex-wrap items-center gap-1 rounded-t-2xl border-b border-line bg-surface p-1.5"
        >
          {linking !== null ? (
            <form
              className="flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                applyLink();
              }}
            >
              <label htmlFor="story-link" className="text-sm font-semibold">
                Link to
              </label>
              <input
                id="story-link"
                autoFocus
                value={linking}
                onChange={(e) => setLinking(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setLinking(null)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-sm"
              />
              <button
                type="submit"
                disabled={!safeHref(linking)}
                className="h-9 rounded-lg bg-action px-3 text-sm font-semibold text-on-action disabled:opacity-40"
              >
                Add link
              </button>
              <button type="button" onClick={() => setLinking(null)} className="h-9 rounded-lg px-2 text-sm">
                Cancel
              </button>
            </form>
          ) : (
            <>
              <label className="sr-only" htmlFor="story-style">
                Text style
              </label>
              <select
                id="story-style"
                value={style}
                onMouseDown={keepSelection}
                onChange={(e) => {
                  restoreSelection();
                  exec("formatBlock", `<${e.target.value}>`);
                  setStyle(e.target.value);
                  emit();
                }}
                className="h-9 rounded-lg border border-line-strong bg-surface px-2 text-sm font-semibold"
              >
                {STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span aria-hidden className="mx-1 h-6 w-px bg-line" />
              <ToolButton label="Bold (⌘B)" onPress={() => run(() => exec("bold"))}>
                <strong>B</strong>
              </ToolButton>
              <ToolButton label="Italic (⌘I)" onPress={() => run(() => exec("italic"))}>
                <em className="font-serif">I</em>
              </ToolButton>
              <ToolButton label="Link (⌘K)" onPress={startLink}>
                <Icon name="external" className="size-4" />
              </ToolButton>
              <ToolButton label="Bullet list" onPress={() => run(() => exec("insertUnorderedList"))}>
                <Icon name="list" className="size-4" />
              </ToolButton>
              <ToolButton label="Numbered list" onPress={() => run(() => exec("insertOrderedList"))}>
                <span className="font-mulish text-xs font-bold">1.</span>
              </ToolButton>
              <ToolButton label="Insert a table" onPress={() => run(() => exec("insertHTML", NEW_TABLE))}>
                <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                  <path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10" />
                </svg>
              </ToolButton>
              <span aria-hidden className="mx-1 h-6 w-px bg-line" />
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  keepSelection();
                }}
                onClick={() => setLibrary(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold hover:bg-muted"
              >
                <Icon name="image" className="size-4" /> Picture
              </button>
            </>
          )}
        </div>

        <div ref={wrapEl} className="relative">
          <div
            ref={ref}
            role="textbox"
            aria-label="The story"
            aria-multiline
            contentEditable
            suppressContentEditableWarning
            onFocus={() => exec("defaultParagraphSeparator", "p")}
            onInput={emit}
            onBlur={emit}
            onClick={(e) => {
              const f = (e.target as HTMLElement).closest("figure");
              if (f && ref.current?.contains(f)) {
                const el = f as HTMLElement;
                select(el, {
                  alt: el.dataset.alt ?? "",
                  caption: el.dataset.caption ?? "",
                  align: (el.dataset.align as Figure["align"]) || "full",
                  lightbox: el.dataset.lightbox === "1",
                });
              }
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                startLink();
              }
            }}
            onPaste={(e) => {
              // Read what's pasted into story blocks and draw them again: only the formatting stories support comes in.
              e.preventDefault();
              const html = e.clipboardData.getData("text/html");
              const plain = e.clipboardData.getData("text/plain");
              if (html) {
                const doc = new DOMParser().parseFromString(html, "text/html");
                exec("insertHTML", storyToHtml(storyFromDom(doc.body)).replace(/<p><br><\/p>$/, ""));
              } else exec("insertText", plain);
              emit();
            }}
            className={cx(
              "min-h-[18rem] flow-root cursor-text px-4 py-3 text-[1.02rem] leading-relaxed outline-none",
              "[&>*+*]:mt-3 [&_a]:font-semibold [&_a]:underline [&_b]:font-bold [&_strong]:font-bold",
              "[&_h2]:pt-2 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:pt-1 [&_h3]:font-serif [&_h3]:text-xl [&_h3]:font-semibold",
              "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
              "[&_blockquote]:border-l-4 [&_blockquote]:border-action [&_blockquote]:pl-4 [&_blockquote]:font-serif [&_blockquote]:text-xl [&_footer]:mt-1 [&_footer]:font-sans [&_footer]:text-sm [&_footer]:text-ink-muted",
              "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
              "[&_figure[data-selected]]:ring-4 [&_figure[data-selected]]:ring-action/60 [&_figure]:rounded-xl [&_figure]:cursor-pointer [&_figure]:select-none [&_figure_img]:w-full [&_figure_img]:rounded-xl [&_figcaption]:mt-1 [&_figcaption]:text-sm [&_figcaption]:text-ink-muted",
              "[&_figure[data-align=left]]:float-left [&_figure[data-align=left]]:mr-4 [&_figure[data-align=left]]:w-[45%]",
              "[&_figure[data-align=right]]:float-right [&_figure[data-align=right]]:ml-4 [&_figure[data-align=right]]:w-[45%]",
              "[&_figure[data-align=center]]:mx-auto [&_figure[data-align=center]]:w-1/2 [&_figure[data-align=full]]:clear-both",
            )}
            dangerouslySetInnerHTML={{ __html: initial }}
          />
          {figure && (
            <div
              ref={panelEl}
              role="group"
              aria-label="The picture's details"
              style={place ? { top: place.top, left: place.left, width: place.width } : { visibility: "hidden" }}
              className="absolute z-20 flex flex-col gap-2 rounded-xl border border-line-strong bg-surface p-3 text-sm shadow-lg"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">Picture</p>
                <button
                  type="button"
                  onClick={() => {
                    figureEl.current?.remove();
                    select(null, null);
                    emit();
                  }}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-danger"
                >
                  <Icon name="trash" className="size-4" /> Remove
                </button>
              </div>
              <label className="flex flex-col gap-1">
                <span className="font-semibold">
                  Describe the picture {!figure.alt && <span className="font-normal text-danger">(needed before you save)</span>}
                </span>
                <input
                  value={figure.alt}
                  onChange={(e) => updateFigure({ alt: e.target.value })}
                  className="h-10 rounded-lg border border-line-strong bg-surface px-2"
                />
              </label>
              {/* AI reads the picture (and any words on it) and writes its description, which also shows as the caption
                  unless one is typed below (the owner, Nov 2026). */}
              <DescribeButton src={figureEl.current?.dataset.src ?? ""} context={pictureContext(figureEl.current)} onAlt={(alt) => updateFigure({ alt })} />
              <label className="flex flex-col gap-1">
                <span className="font-semibold">Caption (optional)</span>
                <input
                  value={figure.caption}
                  onChange={(e) => updateFigure({ caption: e.target.value })}
                  placeholder={figure.alt ? "Empty: the description shows under the picture" : ""}
                  className="h-10 rounded-lg border border-line-strong bg-surface px-2"
                />
                <span className="text-xs text-ink-muted">Leave it empty to show the description under the picture.</span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[var(--color-action)]"
                  checked={figure.lightbox === true}
                  onChange={(e) => updateFigure({ lightbox: e.target.checked })}
                />
                <span>
                  <span className="font-semibold">Open full size when clicked</span>
                  <span className="block text-xs text-ink-muted">Readers can enlarge it and zoom in: good for slides, charts and documents.</span>
                </span>
              </label>
              <div role="group" aria-label="Where the picture sits" className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-semibold">Position</span>
                {ALIGNS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    aria-pressed={figure.align === a.value}
                    onClick={() => updateFigure({ align: a.value })}
                    className={cx(
                      "min-h-9 rounded-full border px-3",
                      figure.align === a.value ? "border-action bg-tealtint font-semibold" : "border-line-strong",
                    )}
                  >
                    {a.label}
                  </button>
                ))}
                <button type="button" onClick={() => select(null, null)} className="ml-auto min-h-9 px-2 font-semibold text-accent">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">Choose a text style from the menu. Click a picture to describe it, add a caption or change where it sits.</p>
      <ImageLibraryDialog open={library} onClose={() => setLibrary(false)} onPick={setPending} />
    </section>
  );
}

/** Where a picture sits in the story, for Describe with AI: the heading it's under and the paragraph before it. */
function pictureContext(fig: HTMLElement | null) {
  if (!fig) return "";
  let heading = "";
  let before = "";
  for (let n = fig.previousElementSibling; n; n = n.previousElementSibling) {
    const tag = n.nodeName.toLowerCase();
    if (!before && tag === "p" && n.textContent?.trim()) before = n.textContent.trim();
    if (tag === "h2" || tag === "h3") {
      heading = n.textContent?.trim() ?? "";
      break;
    }
  }
  return [
    "A picture in a news story on Trilogy Care's Partner Hub.",
    heading && `Under the heading "${heading.slice(0, 120)}".`,
    before && `The paragraph before it: ${before.slice(0, 300)}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** A toolbar button that keeps the text selection, since it acts on it. */
function ToolButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className="grid size-9 place-items-center rounded-lg text-ink hover:bg-muted"
    >
      {children}
    </button>
  );
}
