/*
  Reads the words out of a document in the browser (the owner, Nov 2026: a 51 MB deck shouldn't have to be uploaded
  just so AI can read it). Word (.docx) and PowerPoint (.pptx) are zip files: only the parts holding the words are
  unpacked, never the pictures. PDFs are read page by page with PDF.js (lib/pdf). Text and Markdown are read as they
  are. Only the words go to the server; the file itself is never uploaded or kept.
*/

export type DocumentText = { name: string; text: string; parts: number; kind: "Word" | "PowerPoint" | "PDF" | "text" };

/** The most text sent on: a long report is cut here (the writer needs the substance, not every appendix). */
export const MAX_DOCUMENT_TEXT = 120_000;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** A Word document's words, one paragraph per line. */
export function docxXmlText(xml: string) {
  return decode(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One slide's words. */
export function slideXmlText(xml: string) {
  return decode(
    [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
      .map((m) => m[1])
      .join(" ")
      .replace(/\s+/g, " "),
  ).trim();
}

/** The entries of a zip, by name, read from its central directory; each is unpacked only when asked for. */
function zipEntries(buf: ArrayBuffer) {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const names = new TextDecoder();
  const out = new Map<string, () => Promise<string>>();
  for (let n = 0; n < count && p + 46 <= buf.byteLength; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, async () => {
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      const raw = new Uint8Array(buf, start, size);
      if (method === 0) return new TextDecoder().decode(raw);
      if (method !== 8) throw new Error("That file uses a kind of compression this can’t read. Save it again and retry.");
      const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function pdfText(buf: ArrayBuffer) {
  const { pdfjs } = await import("./pdf");
  const m = await pdfjs();
  const task = m.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    wasmUrl: "/pdfjs/wasm/",
  });
  const doc = await task.promise;
  const pages: string[] = [];
  let length = 0;
  try {
    for (let n = 1; n <= doc.numPages && length < MAX_DOCUMENT_TEXT; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : " ") : ""))
        .join("")
        .replace(/[ \t]+/g, " ")
        .trim();
      pages.push(`[Page ${n}]\n${text}`);
      length += text.length;
    }
  } finally {
    void task.destroy();
  }
  return pages;
}

/** Reads a dropped document's words. Throws with a plain message when it can't. */
export async function readDocumentText(file: File): Promise<DocumentText> {
  const name = file.name || "document";
  if (/\.(doc|ppt)$/i.test(name)) throw new Error(`That’s an older Office file. Save it as .${/\.ppt$/i.test(name) ? "pptx" : "docx"} or PDF and try again.`);
  const cut = (t: string) => t.slice(0, MAX_DOCUMENT_TEXT);
  if (/\.(txt|md)$/i.test(name) || file.type.startsWith("text/")) {
    const text = await file.text();
    return { name, text: cut(text), parts: 1, kind: "text" };
  }
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf, 0, Math.min(5, buf.byteLength));
  if (String.fromCharCode(...head) === "%PDF-") {
    const pages = await pdfText(buf);
    return { name, text: cut(pages.join("\n\n")), parts: pages.length, kind: "PDF" };
  }
  if (head[0] === 0x50 && head[1] === 0x4b) {
    const zip = zipEntries(buf);
    if (!zip) throw new Error("That file couldn’t be opened. Save it again and retry.");
    if (zip.has("ppt/presentation.xml")) {
      const slides: string[] = [];
      for (let n = 1; zip.has(`ppt/slides/slide${n}.xml`) && n <= 500; n++) {
        const text = slideXmlText(await zip.get(`ppt/slides/slide${n}.xml`)!());
        slides.push(`[Slide ${n}]\n${text}`);
      }
      if (!slides.length) throw new Error("No slides could be read from that deck.");
      return { name, text: cut([`A slide deck: ${name}`, ...slides].join("\n\n")), parts: slides.length, kind: "PowerPoint" };
    }
    if (zip.has("word/document.xml")) return { name, text: cut(docxXmlText(await zip.get("word/document.xml")!())), parts: 1, kind: "Word" };
  }
  throw new Error("Drop a Word (.docx), PowerPoint (.pptx), PDF or text file.");
}

/**
  A draft's source, read in the browser (Topics, Discovery Paths, Challenges, the Magazine and the News: the owner, Nov
  2026): a document's words, or a SCORM package, which still goes to the server to be read there.
*/
export type DraftSource = { kind: "text"; doc: DocumentText } | { kind: "scorm"; file: File };

const MAX_SCORM = 200 * 1024 * 1024;
const wordsIn = (t: string) => t.split(/\s+/).filter(Boolean).length;

export async function readDraftSource(file: File): Promise<DraftSource> {
  if (/\.zip$/i.test(file.name)) {
    if (file.size > MAX_SCORM) throw new Error("That SCORM package is over 200 MB. Export it without its video, or upload the script instead.");
    return { kind: "scorm", file };
  }
  const doc = await readDocumentText(file);
  if (wordsIn(doc.text) < 20)
    throw new Error(
      "Almost no text could be read from it. If it’s a scan or all pictures, export it as a PDF with text, or paste the key part into the brief.",
    );
  return { kind: "text", doc };
}

/** What was read, in a few words: "24 slides read · 3,412 words". */
export function describeSource(s: DraftSource) {
  if (s.kind === "scorm") return "SCORM package: its words are read when you generate";
  const d = s.doc;
  const parts =
    d.kind === "PowerPoint"
      ? `${d.parts} ${d.parts === 1 ? "slide" : "slides"}`
      : d.kind === "PDF"
        ? `${d.parts} ${d.parts === 1 ? "page" : "pages"}`
        : d.kind === "text"
          ? "Text"
          : d.kind;
  return `${parts} read · ${wordsIn(d.text).toLocaleString()} words`;
}

/** Adds a draft's source to a request: the words (never the file), or a SCORM package as it is. */
export function appendDraftSource(form: FormData, s: DraftSource | null) {
  if (!s) return;
  if (s.kind === "scorm") form.append("file", s.file);
  else {
    form.append("documentName", s.doc.name);
    form.append("documentText", s.doc.text);
  }
}

/** The words as a small text file, for the Magazine, which keeps each source document's words (not the file itself). */
export const wordsAsFile = (d: DocumentText) => new File([d.text], `${d.name.replace(/\.[^.]+$/, "")} (words).txt`, { type: "text/plain" });
