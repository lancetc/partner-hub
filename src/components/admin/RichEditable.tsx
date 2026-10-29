"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";
import { domToText, safeHref, toHtml, toInlineHtml } from "@/lib/richText";
import { Icon } from "../Icon";

/*
  Text typed straight onto the card, with formatting: bold, italics, links, bullet and numbered
  lists, and tables. What's stored is the plain marked-up text from lib/richText; the HTML here is
  only for editing and is rebuilt from that text, so nothing pasted in survives except the
  formatting we support. (execCommand is old, but it's still the one way to get the browser's own
  undo and selection handling in an editable area.)
*/

const EMPTY_CELL = "<br>";
const NEW_TABLE = `<table><thead><tr><th>Heading</th><th>Heading</th></tr></thead><tbody><tr><td>${EMPTY_CELL}</td><td>${EMPTY_CELL}</td></tr><tr><td>${EMPTY_CELL}</td><td>${EMPTY_CELL}</td></tr></tbody></table><p>${EMPTY_CELL}</p>`;

const exec = (cmd: string, value?: string) => document.execCommand(cmd, false, value);

function selectionCell(root: HTMLElement | null) {
  const n = document.getSelection()?.anchorNode;
  const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
  const cell = el?.closest("td,th") as HTMLTableCellElement | null;
  return cell && root?.contains(cell) ? cell : null;
}

function selectionLink(root: HTMLElement | null) {
  const n = document.getSelection()?.anchorNode;
  const el = n ? (n.nodeType === 1 ? (n as Element) : n.parentElement) : null;
  const a = el?.closest("a") as HTMLAnchorElement | null;
  return a && root?.contains(a) ? a : null;
}

export function RichEditable({
  value,
  onChange,
  placeholder,
  className,
  placeholderClass = "text-ink-muted/60",
  inline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  placeholderClass?: string;
  /** One line with bold, italics and links only (key points): no lists or tables, and Enter finishes. */
  inline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const last = useRef(value);
  // Rendered once; after that the browser owns the editing area.
  const [initial] = useState(() => (inline ? toInlineHtml(value) : toHtml(value)));
  const [focused, setFocused] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [active, setActive] = useState({ bold: false, italic: false, link: false });
  const [linking, setLinking] = useState<string | null>(null);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const text = inline ? domToText(el).replace(/\s*\n+\s*/g, " ") : domToText(el);
    if (text !== last.current) {
      last.current = text;
      onChange(text);
    }
  };

  // Outside changes (undo in the settings drawer, a translation, a restore) redraw the text when not editing.
  useEffect(() => {
    const el = ref.current;
    if (el && value !== last.current && !el.contains(document.activeElement)) {
      el.innerHTML = inline ? toInlineHtml(value) : toHtml(value);
      last.current = value;
    }
  }, [value, inline]);

  useEffect(() => {
    if (!focused) return;
    const update = () => {
      setInTable(Boolean(selectionCell(ref.current)));
      setActive({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), link: Boolean(selectionLink(ref.current)) });
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [focused]);

  const run = (fn: () => void) => {
    ref.current?.focus();
    fn();
    emit();
  };

  function startLink() {
    const sel = document.getSelection();
    saved.current = sel && sel.rangeCount && ref.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    setLinking(selectionLink(ref.current)?.getAttribute("href") ?? "https://");
  }

  function applyLink() {
    const href = safeHref(linking ?? "");
    const range = saved.current;
    setLinking(null);
    if (!href || !range) return;
    run(() => {
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const existing = selectionLink(ref.current);
      if (existing) existing.setAttribute("href", href);
      else if (range.collapsed) exec("insertHTML", `<a href="${href.replace(/"/g, "&quot;")}">${href.replace(/</g, "&lt;")}</a>`);
      else exec("createLink", href);
    });
  }

  function table(op: "row" | "col" | "delRow" | "delCol" | "delTable") {
    const cell = selectionCell(ref.current);
    const tbl = cell?.closest("table");
    if (!cell || !tbl) return;
    const row = cell.parentElement as HTMLTableRowElement;
    const col = cell.cellIndex;
    const rows = Array.from(tbl.rows);
    if (op === "row") {
      const tr = document.createElement("tr");
      for (let i = 0; i < row.cells.length; i++) tr.appendChild(Object.assign(document.createElement("td"), { innerHTML: EMPTY_CELL }));
      if (row.parentElement?.tagName === "THEAD") (tbl.tBodies[0] ?? tbl.appendChild(document.createElement("tbody"))).prepend(tr);
      else row.after(tr);
    } else if (op === "col")
      for (const r of rows) {
        const c = document.createElement(r.parentElement?.tagName === "THEAD" ? "th" : "td");
        c.innerHTML = c.tagName === "TH" ? "Heading" : EMPTY_CELL;
        (r.cells[col] ?? r.lastElementChild)?.after(c);
      }
    else if (op === "delRow") {
      row.remove();
      if (!tbl.rows.length) tbl.remove();
    } else if (op === "delCol") {
      for (const r of rows) r.cells[col]?.remove();
      if (!tbl.rows[0]?.cells.length) tbl.remove();
    } else tbl.remove();
    emit();
    setInTable(Boolean(selectionCell(ref.current)));
  }

  return (
    <div
      ref={wrap}
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!wrap.current?.contains(e.relatedTarget as Node)) {
          setFocused(false);
          setLinking(null);
        }
      }}
    >
      {focused && (
        <div
          role="toolbar"
          aria-label="Text formatting"
          className={cx(
            "flex flex-wrap items-center gap-0.5 rounded-xl bg-surface p-1 text-ink shadow-md ring-1 ring-line [text-shadow:none]",
            // Small items get a floating bar, so the tile doesn't jump when it's clicked.
            inline ? "absolute bottom-full left-0 z-30 mb-1 w-max" : "mb-1.5",
          )}
        >
          {linking !== null ? (
            <form
              className="flex w-full items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                applyLink();
              }}
            >
              <label className="sr-only" htmlFor="rich-link">
                Link address
              </label>
              <input
                id="rich-link"
                autoFocus
                value={linking}
                onChange={(e) => setLinking(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setLinking(null)}
                className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-xs"
                placeholder="https://"
              />
              <button
                type="submit"
                disabled={!safeHref(linking)}
                className="h-8 rounded-lg bg-action px-2.5 text-xs font-semibold text-on-action disabled:opacity-40"
              >
                Link
              </button>
            </form>
          ) : (
            <>
              <Tool label="Bold (⌘B)" onPress={() => run(() => exec("bold"))} pressed={active.bold}>
                <strong>B</strong>
              </Tool>
              <Tool label="Italic (⌘I)" onPress={() => run(() => exec("italic"))} pressed={active.italic}>
                <em className="font-serif">I</em>
              </Tool>
              <Tool label="Link (⌘K)" onPress={startLink} pressed={active.link}>
                <Icon name="external" className="size-4" />
              </Tool>
              {active.link && (
                <Tool label="Remove link" onPress={() => run(() => exec("unlink"))}>
                  <span className="text-xs line-through">link</span>
                </Tool>
              )}
              {!inline && (
                <>
                  <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
                  <Tool label="Bullet list" onPress={() => run(() => exec("insertUnorderedList"))}>
                    <Icon name="list" className="size-4" />
                  </Tool>
                  <Tool label="Numbered list" onPress={() => run(() => exec("insertOrderedList"))}>
                    <span className="font-mulish text-xs font-bold">1.</span>
                  </Tool>
                  <Tool label="Insert a table" onPress={() => run(() => exec("insertHTML", NEW_TABLE))}>
                    <TableIcon />
                  </Tool>
                  {inTable && (
                    <>
                      <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
                      <Tool label="Add a row below" onPress={() => table("row")}>
                        <span className="text-[0.65rem] font-bold">+row</span>
                      </Tool>
                      <Tool label="Add a column to the right" onPress={() => table("col")}>
                        <span className="text-[0.65rem] font-bold">+col</span>
                      </Tool>
                      <Tool label="Delete this row" onPress={() => table("delRow")}>
                        <span className="text-[0.65rem] font-bold">−row</span>
                      </Tool>
                      <Tool label="Delete this column" onPress={() => table("delCol")}>
                        <span className="text-[0.65rem] font-bold">−col</span>
                      </Tool>
                      <Tool label="Delete the table" onPress={() => table("delTable")}>
                        <Icon name="trash" className="size-4" />
                      </Tool>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
      <div className="relative">
        {!value && (
          // The shared placeholder classes are written for :empty::before; this span shows the words itself.
          <span aria-hidden className={cx("pointer-events-none absolute left-0 top-0", placeholderClass.replace(/empty:before:/g, ""), className)}>
            {placeholder}
          </span>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-label={placeholder}
          aria-multiline={!inline}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => exec("defaultParagraphSeparator", "p")}
          onInput={emit}
          onKeyDown={(e) => {
            if (inline && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              startLink();
            }
          }}
          onPaste={(e) => {
            // Only the formatting we support comes in: the paste is read into text, then drawn again.
            e.preventDefault();
            const html = e.clipboardData.getData("text/html");
            const plain = e.clipboardData.getData("text/plain");
            if (inline) exec("insertText", plain.replace(/\s*\n+\s*/g, " "));
            else if (html) {
              const doc = new DOMParser().parseFromString(html, "text/html");
              exec("insertHTML", toHtml(domToText(doc.body)));
            } else if (/\t.*\n.*\t/.test(plain)) exec("insertHTML", toHtml(plain));
            else exec("insertText", plain);
            emit();
          }}
          onBlur={emit}
          className={cx(
            "min-h-[1.5em] cursor-text rounded-md outline-none transition-shadow hover:bg-ink/5 focus:bg-transparent focus:ring-2 focus:ring-action/60",
            "[&_a]:font-semibold [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p+*]:mt-2 [&_*+p]:mt-2 [&_strong]:font-bold [&_b]:font-bold [&_ul]:list-disc [&_ul]:pl-5",
            "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:bg-white [&_table]:text-[0.8rem] [&_table]:leading-snug [&_table]:text-[#102a43] [&_table]:shadow-sm",
            "[&_td]:border [&_td]:border-[rgb(16_42_67/0.12)] [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:border [&_th]:border-[rgb(16_42_67/0.12)] [&_th]:bg-[#e8eef6] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-bold [&_th]:text-[#2d4875]",
            className,
          )}
          dangerouslySetInnerHTML={{ __html: initial }}
        />
      </div>
    </div>
  );
}

function TableIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M3.5 14.5h17M10 9.5v10" />
    </svg>
  );
}

/** A toolbar button. It keeps the text selection, since it acts on it. */
function Tool({ label, onPress, pressed, children }: { label: string; onPress: () => void; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sm text-ink hover:bg-muted",
        pressed && "bg-tealtint text-action ring-1 ring-action/40",
      )}
    >
      {children}
    </button>
  );
}
