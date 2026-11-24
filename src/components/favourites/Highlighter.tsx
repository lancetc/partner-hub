"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { cx } from "@/lib/format";
import { Icon } from "../Icon";
import { SaveNotice } from "./SaveNotice";
import { favouritesChanged, useMarks } from "./SavedMarks";
import type { PageMark, PassageKind } from "@/server/favourites";

/*
  Highlight and save a passage (docs/job-aids.md). Selecting text in approved content shows a small Save to
  Favourites button beside the selection. The selection itself is left alone: nothing here handles copying or
  select-all, and the button doesn't take the selection away when it's pressed.

  The server decides what can be saved: the words have to be in one part of the published page. For anyone who
  can't make a precise selection there is Save this section, which needs no selection at all.
*/

type Source = { source: PassageKind; id: string; revisionId?: string; pageId?: string };
type Saved = { id: string; first: boolean; already: boolean; quote: string; sourceTitle: string };
const MIN = 12;
const MAX = 600;

const blockOf = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>("[data-hl], [id^='block-']") ?? null;

/** After a save: what was saved and from where, a way to Favourites, and an optional label for finding it again. */
function Saved({ saved, onClose }: { saved: Saved; onClose: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [named, setNamed] = useState(false);
  // Above the page and the Topic player alike (body-level, so no card's own layer can clip or hide it).
  return createPortal(
    <div className="fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-xl rounded-3xl border border-line-strong bg-surface p-4 text-ink shadow-2xl lg:bottom-6">
      <blockquote className="border-l-4 border-teal pl-3 text-sm text-ink-muted">
        “{saved.quote.length > 160 ? `${saved.quote.slice(0, 160)}…` : saved.quote}”<span className="block">From {saved.sourceTitle}</span>
      </blockquote>
      <SaveNotice first={saved.first} what={saved.already ? "It was already there." : undefined} onClose={onClose} />
      {renaming ? (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await api("/api/favourites", { body: { action: "rename", id: saved.id, title } });
              setRenaming(false);
              setNamed(true);
            } catch (err) {
              setError(err instanceof Error ? err.message : "That couldn’t be renamed.");
            }
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold">
            A short label, to find it again
            <input
              className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </label>
          <button className="min-h-11 rounded-full bg-action px-4 font-semibold text-on-action">Save label</button>
          {error && (
            <p role="alert" className="basis-full text-sm font-semibold text-danger">
              {error}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-2 text-sm">
          {named ? (
            <span role="status">Label saved.</span>
          ) : (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setRenaming(true)}>
              Rename
            </button>
          )}
        </p>
      )}
    </div>,
    document.body,
  );
}

export function Highlighter({ root, disabled, ...src }: Source & { root: RefObject<HTMLElement | null>; disabled?: boolean }) {
  const [pick, setPick] = useState<{ quote: string; blockId: string; top: number; left: number; problem: string; mark: PageMark | null } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  // This reader's earlier highlights on the page (SavedMarks), read when a selection settles.
  const marks = useMarks();
  const marksNow = useRef(marks);
  useEffect(() => {
    marksNow.current = marks;
  });

  useEffect(() => {
    if (disabled) return;
    const read = () => {
      const sel = document.getSelection();
      const host = root.current;
      if (!sel || sel.isCollapsed || !sel.rangeCount || !host) return setPick(null);
      const range = sel.getRangeAt(0);
      if (!host.contains(range.commonAncestorContainer)) return setPick(null);
      const quote = sel.toString().replace(/\s+/g, " ").trim();
      // A whole page selected (select all, to copy) is not a highlight: leave it alone.
      if (quote.length < MIN || quote.length > MAX * 4) return setPick(null);
      const a = blockOf(sel.anchorNode);
      const b = blockOf(sel.focusNode);
      const rect = range.getBoundingClientRect();
      const problem =
        !a || a !== b ? "Select within one part of the page to save it." : quote.length > MAX ? "That’s a long passage. Select less, or save the section." : "";
      // Inside words they saved before: what they can do with that highlight, rather than saving it again.
      const mark = marksNow.current?.markIn(range) ?? null;
      setError("");
      setPick({
        quote,
        blockId: a?.dataset.hl ?? a?.id.replace(/^block-/, "") ?? "",
        top: Math.min(window.innerHeight - 64, Math.max(8, rect.bottom + 10)),
        left: Math.min(window.innerWidth - (mark ? 312 : 232), Math.max(8, rect.left)),
        problem: mark ? "" : problem,
        mark,
      });
    };
    const onChange = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(read, 250);
    };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onChange);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [root, disabled]);

  const save = async () => {
    if (!pick || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<Saved>("/api/favourites", { body: { action: "save-passage", ...src, blockId: pick.blockId, quote: pick.quote } });
      setSaved(r);
      setPick(null);
      favouritesChanged();
    } catch (e) {
      // Not saved, and it says why. The selection is still there to try again.
      setError(e instanceof Error ? e.message : "That couldn’t be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const removeMark = async (id: string) => {
    setError("");
    try {
      await marks?.remove(id);
      setPick(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That couldn’t be removed. Try again.");
    }
  };

  // Drawn at the top of the page, so it shows over the Topic player and no card's own layer can clip it.
  return (
    <>
      {pick &&
        createPortal(
          <div
            style={{ top: pick.top, left: pick.left }}
            className={cx("fixed z-[60] text-ink", pick.mark ? "max-w-[19rem]" : "max-w-[14rem]")}
            data-highlight-action
          >
            {pick.mark && !error ? (
              <div
                role="group"
                aria-label="Your highlight"
                className="flex flex-wrap items-center gap-1 rounded-3xl border border-line-strong bg-surface p-1 shadow-xl"
              >
                <Link
                  href={`/favourites#${pick.mark.id}`}
                  onMouseDown={(e) => e.preventDefault()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action"
                >
                  <Icon name="bookmark-filled" className="size-4" /> Open in Favourites
                </Link>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void removeMark(pick.mark!.id)}
                  className="min-h-11 rounded-full px-3 font-semibold underline underline-offset-2"
                >
                  Remove
                </button>
              </div>
            ) : pick.problem || error ? (
              <p role="status" className="rounded-2xl border border-line-strong bg-surface px-3 py-2 text-sm font-semibold shadow-xl">
                {error || pick.problem}
              </p>
            ) : (
              <button
                type="button"
                // Pressing it must not clear the selection it is about.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void save()}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 font-semibold text-on-action shadow-xl"
              >
                <Icon name="bookmark" className="size-4" /> {busy ? "Saving…" : "Save to Favourites"}
              </button>
            )}
          </div>,
          document.body,
        )}
      {saved && <Saved saved={saved} onClose={() => setSaved(null)} />}
    </>
  );
}

/** Save a whole section without selecting anything: the same result for touch, keyboard and assistive technology. */
export function SaveSection({
  sectionId,
  label = "Save this section",
  onColour,
  ...src
}: Source & { sectionId: string; label?: string; /** On a coloured or photo card: takes the card's text colour. */ onColour?: boolean }) {
  const [state, setState] = useState<{ saved?: Saved; error?: string; busy?: boolean }>({});
  if (state.saved)
    return (
      <p role="status" aria-live="polite" className="text-sm">
        <Icon name="bookmark-filled" className="mr-1 inline size-4 text-accent" />
        Saved to Favourites{state.saved.first ? ". Open it from Favourites in the Hub’s navigation." : "."}{" "}
        <Link href="/favourites" className="font-semibold underline underline-offset-2">
          View Favourites
        </Link>
      </p>
    );
  return (
    // Not part of the text: left out of a selection, and of finding a saved passage again (SavedMarks).
    <span data-hl-skip className="inline-flex select-none flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          try {
            setState({ saved: await api<Saved>("/api/favourites", { body: { action: "save-passage", ...src, sectionId } }) });
            favouritesChanged();
          } catch (e) {
            setState({ error: e instanceof Error ? e.message : "That couldn’t be saved. Try again." });
          }
        }}
        // Just the bookmark until it's wanted: hovering or focusing it slides the label out and fades it in. The label is
        // always there for screen readers (narrowed, not hidden), and stays out while it's saving.
        className={cx(
          "group/save inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-[13px] text-sm font-semibold transition-colors duration-300 motion-reduce:transition-none",
          onColour
            ? "border-current/40 text-current hover:bg-white/15 focus-visible:border-current"
            : "border-line text-ink-muted hover:border-line-strong hover:bg-muted hover:text-ink focus-visible:border-line-strong focus-visible:text-ink",
        )}
      >
        <Icon name="bookmark" className="size-4 shrink-0" />
        <span
          className={cx(
            "overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none",
            state.busy
              ? "ml-1.5 max-w-48 opacity-100"
              : "ml-0 max-w-0 opacity-0 group-hover/save:ml-1.5 group-hover/save:max-w-48 group-hover/save:opacity-100 group-focus-visible/save:ml-1.5 group-focus-visible/save:max-w-48 group-focus-visible/save:opacity-100",
          )}
        >
          {state.busy ? "Saving…" : label}
        </span>
      </button>
      {state.error && (
        <span role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </span>
      )}
    </span>
  );
}
