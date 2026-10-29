import type { StoryBlock } from "@/content/stories";
import { blocksToText, domToBlocks, escapeHtml, inlineHtml, inlineToText, parseInline, toHtml, type DomLike } from "./richText";

/*
  A news story's text as one document for the editor, and back again. Stories are still stored as
  blocks (paragraphs, headings, lists, quotes, pictures) so the story page, search and the writer
  read them as before; the editor just shows them as one continuous document.

  - Paragraph text keeps its marks (**bold**, *italic*, links, numbered lists, tables).
  - A bullet list on its own becomes a list block, which the story page shows with ticks.
  - Pictures are <figure> elements the author can't type into; their details live in data- attributes.
*/

const attr = (n: DomLike, name: string) => n.getAttribute?.(name) ?? "";
const name = (n: DomLike) => (n.nodeType === 1 ? n.nodeName.toUpperCase() : "");
const kids = (n: DomLike) => Array.from(n.childNodes);
const text = (n: DomLike): string => (n.nodeType === 3 ? (n.textContent ?? "") : kids(n).map(text).join(""));
const wrap = (nodes: DomLike[]): DomLike => ({ nodeType: 1, nodeName: "DIV", textContent: null, childNodes: nodes });

/** One picture as the editor shows it. */
export function figureHtml(b: Extract<StoryBlock, { type: "image" }>) {
  const data = `data-src="${escapeHtml(b.src)}" data-width="${b.width}" data-height="${b.height}" data-alt="${escapeHtml(b.alt)}" data-align="${b.align}" data-caption="${escapeHtml(b.caption ?? "")}"`;
  return `<figure contenteditable="false" ${data}><img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.alt)}">${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ""}</figure>`;
}

export function storyToHtml(blocks: StoryBlock[]) {
  const html = blocks
    .map((b) => {
      switch (b.type) {
        case "p":
          return toHtml(b.text);
        case "h2":
          return `<h2>${escapeHtml(b.text)}</h2>`;
        case "h3":
          return `<h3>${escapeHtml(b.text)}</h3>`;
        case "list":
          return `<ul>${b.items.map((i) => `<li>${inlineHtml(parseInline(i)) || "<br>"}</li>`).join("")}</ul>`;
        case "quote":
          return `<blockquote><p>${escapeHtml(b.text)}</p>${b.cite ? `<footer>${escapeHtml(b.cite)}</footer>` : ""}</blockquote>`;
        case "image":
          return figureHtml(b);
      }
    })
    .join("");
  // Always somewhere to start typing, and somewhere to type after a picture at the end.
  return html.endsWith("</figure>") || !html ? `${html}<p><br></p>` : html;
}

/** Reads the editor (or pasted HTML) back into story blocks. */
export function storyFromDom(root: DomLike): StoryBlock[] {
  const out: StoryBlock[] = [];
  let run: DomLike[] = [];
  const flush = () => {
    if (!run.length) return;
    // A bullet list on its own is a list block; anything else (paragraphs, numbered lists, tables) is a paragraph block.
    const blocks = domToBlocks(wrap(run));
    let pending: typeof blocks = [];
    const pushPending = () => {
      const t = blocksToText(pending);
      if (t.trim()) out.push({ type: "p", text: t });
      pending = [];
    };
    for (const b of blocks) {
      if (b.t === "ul") {
        pushPending();
        const items = b.items.map((i) => inlineToText(i).trim()).filter(Boolean);
        if (items.length) out.push({ type: "list", items });
      } else pending.push(b);
    }
    pushPending();
    run = [];
  };
  for (const n of kids(root)) {
    const tag = name(n);
    if (tag === "H1" || tag === "H2") {
      flush();
      const t = text(n).replace(/\s+/g, " ").trim();
      if (t) out.push({ type: "h2", text: t });
    } else if (/^H[3-6]$/.test(tag)) {
      flush();
      const t = text(n).replace(/\s+/g, " ").trim();
      if (t) out.push({ type: "h3", text: t });
    } else if (tag === "BLOCKQUOTE") {
      flush();
      const foot = kids(n).find((k) => ["FOOTER", "CITE"].includes(name(k)));
      const said = kids(n)
        .filter((k) => k !== foot)
        .map(text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (said)
        out.push({
          type: "quote",
          text: said,
          cite: foot
            ? text(foot)
                .replace(/^[\s—–-]+/, "")
                .trim()
            : "",
        });
    } else if (tag === "FIGURE") {
      flush();
      const src = attr(n, "data-src");
      const align = attr(n, "data-align");
      if (src)
        out.push({
          type: "image",
          src,
          width: Number(attr(n, "data-width")) || 1200,
          height: Number(attr(n, "data-height")) || 800,
          alt: attr(n, "data-alt"),
          align: (["left", "right", "center", "full"] as const).find((a) => a === align) ?? "full",
          ...(attr(n, "data-caption") ? { caption: attr(n, "data-caption") } : {}),
        });
    } else run.push(n);
  }
  flush();
  return out;
}
