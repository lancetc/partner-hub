/*
  PDFs in lessons, drawn with Mozilla's PDF.js (pdfjs-dist). The library loads only when a card
  with a document is shown; its worker and font files are served from public/pdfjs
  (npm run pdfjs:copy after changing the version).
*/

import type { PDFDocumentProxy } from "pdfjs-dist";

let lib: Promise<typeof import("pdfjs-dist")> | null = null;
const pdfjs = () =>
  (lib ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
    return m;
  }));

/** Opens a PDF; the same address returns the same open document while it's in use. */
const open = new Map<string, Promise<PDFDocumentProxy>>();
export function openPdf(src: string) {
  let doc = open.get(src);
  if (!doc) {
    doc = pdfjs().then(
      (m) =>
        m.getDocument({
          url: src,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          wasmUrl: "/pdfjs/wasm/",
        }).promise,
    );
    // A failed load can be tried again later.
    doc.catch(() => open.delete(src));
    open.set(src, doc);
  }
  return doc;
}

/** Draws one page into a canvas at `width` CSS pixels, sharp on high-density screens. Returns its height. */
export async function drawPage(doc: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, width: number) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const viewport = page.getViewport({ scale: (width / base.width) * dpr });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${viewport.height / dpr}px`;
  await page.render({ canvas, viewport }).promise;
  return viewport.height / dpr;
}
