"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Card } from "@/content/lessons";
import { cx, formatBytes } from "@/lib/format";
import { drawPage, openPdf } from "@/lib/pdf";
import { Icon } from "../Icon";

type Pdf = NonNullable<Card["pdf"]>;

/*
  A PDF inside a card's text (`card.pdf`): a tile with its first page that opens the document in a
  full-screen reader inside the lesson, page by page with zoom. `onOpened` and `onFinished` (last
  page reached) feed Required reading.
*/
export function CardDocument({
  pdf,
  onColour = false,
  className,
  onOpened,
  onFinished,
  status,
}: {
  pdf: Pdf;
  onColour?: boolean;
  className?: string;
  onOpened?: () => void;
  onFinished?: () => void;
  /** What the learner has done so far, for the tile's tick. */
  status?: "opened" | "end";
}) {
  const [reading, setReading] = useState(false);
  const [pages, setPages] = useState<number | null>(pdf.pages ?? null);
  const thumb = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    openPdf(pdf.src)
      .then(async (doc) => {
        if (!live) return;
        setPages(doc.numPages);
        if (thumb.current) await drawPage(doc, 1, thumb.current, 72);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pdf.src]);

  const done = pdf.required === "end" ? status === "end" : Boolean(status);
  const meta = ["PDF", pages ? `${pages} ${pages === 1 ? "page" : "pages"}` : null, pdf.bytes ? formatBytes(pdf.bytes) : null].filter(Boolean).join(" · ");

  return (
    <div className={className}>
      <div
        className={cx(
          "flex items-center gap-3 rounded-2xl p-2.5 pr-3",
          onColour ? "bg-white/85 text-[#102a43] backdrop-blur-sm" : "border border-line bg-surface",
        )}
      >
        <button
          type="button"
          onClick={() => {
            setReading(true);
            onOpened?.();
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-label={`Read ${pdf.title}, ${meta}`}
        >
          <span className="relative grid h-24 w-[72px] shrink-0 place-items-center overflow-hidden rounded-lg bg-muted shadow-sm ring-1 ring-line">
            <canvas ref={thumb} aria-hidden className={cx("absolute left-0 top-0", failed && "hidden")} />
            {(failed || !pages) && <Icon name="file" className="size-6 text-ink-muted" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold leading-snug">{pdf.title}</span>
            <span className="mt-0.5 block text-sm opacity-75">{meta}</span>
            <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-[#0e7c7b]">
              <Icon name="doc" className="size-4" /> Read it here
            </span>
          </span>
        </button>
        {pdf.required && (
          <span
            className={cx(
              "shrink-0 rounded-full px-2.5 py-1 font-mulish text-xs font-bold",
              done ? "bg-[#2b6636]/15 text-[#2b6636]" : "bg-[#ffc72c]/40 text-[#102a43]",
            )}
          >
            {done ? "Done" : pdf.required === "end" ? "Read to the end" : "Open to continue"}
          </span>
        )}
      </div>
      {reading && <PdfReader pdf={pdf} onClose={() => setReading(false)} onFinished={onFinished} />}
    </div>
  );
}

const ZOOMS = [1, 1.5, 2, 3];

/** The document full screen: every page, drawn as it scrolls into view, with zoom and download. Also used by Resources cards. */
export function PdfReader({ pdf, onClose, onFinished }: { pdf: Pick<Pdf, "src" | "title">; onClose: () => void; onFinished?: () => void }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    let live = true;
    openPdf(pdf.src)
      .then((d) => live && setDoc(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [pdf.src]);

  // Pages fit the screen width (up to a comfortable reading width), times the zoom.
  useEffect(() => {
    const measure = () => setWidth(Math.min((scroller.current?.clientWidth ?? 360) - 24, 820));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Kept in a ref so the lesson updating behind the reader (a page counted as read) doesn't re-run the setup below.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);

  const reached = useCallback(
    (n: number) => {
      setPage(n);
      if (doc && n === doc.numPages && !finished.current) {
        finished.current = true;
        onFinished?.();
      }
    },
    [doc, onFinished],
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={pdf.title} className="fixed inset-0 z-[70] flex flex-col bg-[#102a43] text-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25"
          aria-label="Close the document"
        >
          <Icon name="close" className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{pdf.title}</p>
          <p className="text-sm text-white/75" aria-live="polite">
            {doc ? `Page ${page} of ${doc.numPages}` : error ? "Couldn’t open the document" : "Opening…"}
          </p>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0, z - 1))}
            disabled={zoom === 0}
            className="grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
            aria-label="Zoom out"
          >
            <Icon name="minus" className="size-5" />
          </button>
          <span className="w-12 text-center text-sm tabular-nums">{Math.round(ZOOMS[zoom] * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
            disabled={zoom === ZOOMS.length - 1}
            className="grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25 disabled:opacity-40"
            aria-label="Zoom in"
          >
            <Icon name="plus" className="size-5" />
          </button>
        </div>
        <a
          href={pdf.src}
          download={`${pdf.title}.pdf`}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold hover:bg-white/25"
        >
          <Icon name="upload" className="size-4 rotate-180" /> Download
        </a>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto bg-black/30 p-3">
        {error ? (
          <p className="mx-auto mt-10 max-w-sm text-center text-white/85">
            This document couldn’t be shown here. Try <strong>Download</strong> to open it on your device.
          </p>
        ) : (
          doc &&
          width > 0 && (
            <ol className="mx-auto flex w-max flex-col items-center gap-3">
              {Array.from({ length: doc.numPages }, (_, i) => (
                <PageView key={`${i}-${zoom}`} doc={doc} number={i + 1} width={Math.round(width * ZOOMS[zoom])} root={scroller} onSeen={reached} />
              ))}
            </ol>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}

/** One page: a placeholder of the right shape, drawn when it's close to the screen. */
function PageView({
  doc,
  number,
  width,
  root,
  onSeen,
}: {
  doc: PDFDocumentProxy;
  number: number;
  width: number;
  root: React.RefObject<HTMLDivElement | null>;
  onSeen: (n: number) => void;
}) {
  const box = useRef<HTMLLIElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [height, setHeight] = useState(Math.round(width * 1.414));
  const drawn = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const near = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || drawn.current || !canvas.current) return;
        drawn.current = true;
        drawPage(doc, number, canvas.current, width)
          .then((h) => setHeight(Math.round(h)))
          .catch(() => (drawn.current = false));
      },
      { root: root.current, rootMargin: "600px 0px" },
    );
    // Reached once it fills most of the screen, or most of it is showing (pages taller than the screen when zoomed in).
    const seen = new IntersectionObserver(
      ([e]) => {
        const view = e.rootBounds?.height ?? window.innerHeight;
        if (e.isIntersecting && e.intersectionRect.height >= Math.min(e.boundingClientRect.height, view) * 0.6) onSeen(number);
      },
      { root: root.current, threshold: [0, 0.1, 0.25, 0.4, 0.6, 0.8, 1] },
    );
    near.observe(el);
    seen.observe(el);
    return () => {
      near.disconnect();
      seen.disconnect();
    };
  }, [doc, number, width, root, onSeen]);

  return (
    <li ref={box} className="relative bg-white shadow-lg" style={{ width, height }} aria-label={`Page ${number}`}>
      <canvas ref={canvas} className="block" />
    </li>
  );
}
