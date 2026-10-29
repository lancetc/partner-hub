/*
  Rich text for card bodies, kept as a short plain string with a few marks so lessons stay easy to
  translate, compare and store:

    **bold**   *italic*   [words](https://example.com)
    - a bullet            1. a numbered item
    | Head | Head |       (a table: the first row is the heading row,
    | --- | --- |          the dashes row is optional)
    | cell | cell |

  A blank line starts a new paragraph; a single line break stays a line break. Text pasted from a
  spreadsheet (tab-separated lines) is read as a table too. Nothing here is ever put on the page as
  HTML from the lesson: the player builds elements from the parsed blocks, and the editor's HTML
  comes from toHtml, which escapes everything.
*/

export type Inline = { t: "text"; v: string } | { t: "b"; c: Inline[] } | { t: "i"; c: Inline[] } | { t: "a"; href: string; c: Inline[] } | { t: "br" };
export type Block =
  { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; items: Inline[][] } | { t: "table"; head: Inline[][] | null; rows: Inline[][][] };

/** Links that may appear in lesson text: web pages, email, and pages on this site. */
export function safeHref(href: string) {
  const h = href.trim();
  return /^(https?:\/\/|mailto:)/i.test(h) || /^\/(?!\/)/.test(h) ? h : null;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length && /[\\*[\]|.)•-]/.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === "\n") {
      flush();
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (s.startsWith("**", i)) {
      const end = closing(s, "**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: "b", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if (ch === "*") {
      const end = closing(s, "*", i + 1);
      if (end > i + 1 && s[i + 1] !== " ") {
        flush();
        out.push({ t: "i", c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (ch === "[") {
      const mid = closing(s, "](", i + 1);
      const end = mid > 0 ? s.indexOf(")", mid + 2) : -1;
      const href = end > 0 ? safeHref(s.slice(mid + 2, end)) : null;
      if (href && mid > i + 1) {
        flush();
        out.push({ t: "a", href, c: parseInline(s.slice(i + 1, mid)) });
        i = end + 1;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

/** The next unescaped `mark` from `from`, skipping `**` when looking for a single `*`. */
function closing(s: string, mark: string, from: number) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "\n" && s[j + 1] === "\n") return -1;
    if (mark === "*" && s.startsWith("**", j)) {
      j++;
      continue;
    }
    if (s.startsWith(mark, j)) return j;
  }
  return -1;
}

const BULLET = /^\s*[-•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const isRow = (l: string) => /^\s*\|/.test(l);
const isRule = (l: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);

function cells(line: string) {
  const out: string[] = [];
  let cur = "";
  const s = line.trim().replace(/^\|/, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (s[i] === "|") {
      out.push(cur.trim());
      cur = "";
    } else cur += s[i];
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function parseRich(src: string): Block[] {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join("\n")) });
    para = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const tabbed = (l?: string) => l !== undefined && l.includes("\t") && l.trim() !== "";
    if (!line.trim()) {
      endPara();
      i++;
    } else if (isRow(line) || (tabbed(line) && tabbed(lines[i + 1]))) {
      endPara();
      const pipes = isRow(line);
      const rows: string[][] = [];
      let ruled = false;
      while (i < lines.length && (pipes ? isRow(lines[i]) : tabbed(lines[i]))) {
        if (pipes && isRule(lines[i])) ruled = rows.length === 1 || ruled;
        else rows.push(pipes ? cells(lines[i]) : lines[i].split("\t").map((c) => c.trim()));
        i++;
      }
      // Pipe tables use their first row as headings when it's followed by dashes; pasted ones always do.
      const withHead = pipes ? ruled : true;
      const parsed = rows.map((r) => r.map(parseInline));
      blocks.push({ t: "table", head: withHead ? parsed[0] : null, rows: withHead ? parsed.slice(1) : parsed });
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      endPara();
      const kind = BULLET.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? BULLET : NUMBER;
      const items: Inline[][] = [];
      while (i < lines.length && re.test(lines[i])) items.push(parseInline(lines[i++].replace(re, "")));
      blocks.push({ t: kind, items });
    } else {
      para.push(line);
      i++;
    }
  }
  endPara();
  return blocks;
}

/** True when the text uses any formatting, so plain bodies can keep their simple rendering. */
export const hasFormatting = (src: string) => parseRich(src).some((b) => b.t !== "p" || b.c.some((x) => x.t !== "text" && x.t !== "br"));

/* Back to text: the marks for each block. */

const escapeText = (s: string, inTable: boolean) => s.replace(inTable ? /[\\*[\]|]/g : /[\\*[\]]/g, (m) => `\\${m}`);

export function inlineToText(c: Inline[], inTable = false): string {
  return c
    .map((x) =>
      x.t === "text"
        ? escapeText(x.v, inTable)
        : x.t === "br"
          ? inTable
            ? " "
            : "\n"
          : x.t === "a"
            ? `[${inlineToText(x.c, inTable)}](${x.href})`
            : wrap(inlineToText(x.c, inTable), x.t === "b" ? "**" : "*"),
    )
    .join("");
}

/** Marks hug the words: "** bold **" wouldn't read back, so spaces move outside. */
function wrap(s: string, m: string) {
  if (!s.trim()) return s;
  const lead = s.match(/^\s*/)![0];
  const trail = s.match(/\s*$/)![0];
  return `${lead}${m}${s.trim()}${m}${trail}`;
}

export function blocksToText(blocks: Block[]) {
  return blocks
    .map((b) => {
      if (b.t === "p")
        return (
          inlineToText(b.c)
            .replace(/^\n+|\n+$/g, "")
            // A line that starts like "3. " or "- " is still a sentence, not a list: mark it so it reads back the same.
            .replace(/^(\s*\d+)([.)])(\s)/gm, "$1\\$2$3")
            .replace(/^(\s*)([-•])(\s)/gm, "$1\\$2$3")
        );
      if (b.t === "ul") return b.items.map((it) => `- ${inlineToText(it).replace(/\n/g, " ")}`).join("\n");
      if (b.t === "ol") return b.items.map((it, n) => `${n + 1}. ${inlineToText(it).replace(/\n/g, " ")}`).join("\n");
      const row = (r: Inline[][]) => `| ${r.map((c) => inlineToText(c, true).trim() || " ").join(" | ")} |`;
      const width = Math.max(b.head?.length ?? 0, ...b.rows.map((r) => r.length), 1);
      const pad = (r: Inline[][]) => [...r, ...Array.from({ length: width - r.length }, () => [] as Inline[])];
      const lines = b.head ? [row(pad(b.head)), `|${" --- |".repeat(width)}`] : [];
      return [...lines, ...b.rows.map((r) => row(pad(r)))].join("\n");
    })
    .filter((s) => s.trim())
    .join("\n\n");
}

/** The words alone, for counting and for screen-reader-only summaries. */
export function plainText(src: string) {
  const flat = (c: Inline[]): string => c.map((x) => (x.t === "text" ? x.v : x.t === "br" ? " " : flat(x.c))).join("");
  return parseRich(src)
    .map((b) =>
      b.t === "p" ? flat(b.c) : b.t === "table" ? [b.head ?? [], ...b.rows].map((r) => r.map(flat).join(" ")).join(" ") : b.items.map(flat).join(" "),
    )
    .join(" ");
}

/* For the editor: escaped HTML to edit in place, and reading what the author typed or pasted back into blocks. */

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inlineHtml(c: Inline[]): string {
  return c
    .map((x) =>
      x.t === "text"
        ? escapeHtml(x.v)
        : x.t === "br"
          ? "<br>"
          : x.t === "a"
            ? `<a href="${escapeHtml(x.href)}">${inlineHtml(x.c)}</a>`
            : `<${x.t === "b" ? "strong" : "em"}>${inlineHtml(x.c)}</${x.t === "b" ? "strong" : "em"}>`,
    )
    .join("");
}

/** One line, for points and choices: the text is never read as a list or a table, so "3. Trilogy claims…" stays as typed. */
export function toInlineHtml(src: string) {
  return `<p>${inlineHtml(parseInline(src)) || "<br>"}</p>`;
}

export function toHtml(src: string) {
  return parseRich(src)
    .map((b) => {
      if (b.t === "p") return `<p>${inlineHtml(b.c) || "<br>"}</p>`;
      if (b.t === "ul" || b.t === "ol") return `<${b.t}>${b.items.map((it) => `<li>${inlineHtml(it) || "<br>"}</li>`).join("")}</${b.t}>`;
      const cell = (tag: string) => (c: Inline[]) => `<${tag}>${inlineHtml(c) || "<br>"}</${tag}>`;
      return `<table>${b.head ? `<thead><tr>${b.head.map(cell("th")).join("")}</tr></thead>` : ""}<tbody>${b.rows
        .map((r) => `<tr>${r.map(cell("td")).join("")}</tr>`)
        .join("")}</tbody></table>`;
    })
    .join("");
}

/** The parts of a DOM node read here, so this works on the live editor and on pasted HTML. */
export type DomLike = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomLike>;
  getAttribute?: (name: string) => string | null;
};

const BLOCKS = new Set(["P", "DIV", "UL", "OL", "TABLE", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI", "SECTION", "ARTICLE"]);
const kids = (n: DomLike) => Array.from(n.childNodes);
const styleOf = (n: DomLike) => (n.getAttribute?.("style") ?? "").toLowerCase();

function domInline(n: DomLike): Inline[] {
  if (n.nodeType === 3) return n.textContent ? [{ t: "text", v: n.textContent.replace(/ /g, " ").replace(/[ \t\n]+/g, " ") }] : [];
  if (n.nodeType !== 1) return [];
  const name = n.nodeName.toUpperCase();
  if (name === "BR") return [{ t: "br" }];
  if (name === "SCRIPT" || name === "STYLE") return [];
  const inner = kids(n).flatMap(domInline);
  const style = styleOf(n);
  // Google Docs wraps everything in <b style="font-weight:normal">, so the style wins over the tag.
  const weight = /font-weight:\s*(\d+|bold|normal)/.exec(style)?.[1];
  const bold = weight ? weight === "bold" || Number(weight) >= 600 : name === "B" || name === "STRONG";
  const italic = /font-style:\s*italic/.test(style) || name === "I" || name === "EM";
  let out: Inline[] = inner;
  if (name === "A") {
    const href = safeHref(n.getAttribute?.("href") ?? "");
    if (href) out = [{ t: "a", href, c: out }];
  }
  if (italic) out = [{ t: "i", c: out }];
  if (bold) out = [{ t: "b", c: out }];
  return out;
}

/** Joins runs of text and drops empty marks, so the stored text stays tidy. */
function tidy(c: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const x of c) {
    const y = x.t === "b" || x.t === "i" || x.t === "a" ? { ...x, c: tidy(x.c) } : x;
    if ((y.t === "b" || y.t === "i") && !y.c.some((z) => z.t !== "text" || z.v.trim())) {
      out.push(...y.c);
      continue;
    }
    // Bold inside bold (from pasting) reads the same as bold.
    if ((y.t === "b" || y.t === "i") && y.c.length === 1 && y.c[0].t === y.t) {
      out.push(y.c[0]);
      continue;
    }
    const last = out[out.length - 1];
    if (y.t === "text" && last?.t === "text") last.v += y.v;
    else out.push(y);
  }
  return out;
}

function trimInline(c: Inline[]) {
  const t = tidy(c);
  while (t[0]?.t === "br") t.shift();
  while (t[t.length - 1]?.t === "br") t.pop();
  if (t[0]?.t === "text") t[0] = { t: "text", v: t[0].v.replace(/^\s+/, "") };
  const last = t[t.length - 1];
  if (last?.t === "text") t[t.length - 1] = { t: "text", v: last.v.replace(/\s+$/, "") };
  return t.filter((x) => x.t !== "text" || x.v);
}

/** Reads the editor's content (or pasted HTML) back into blocks: paragraphs, lists and tables. */
export function domToBlocks(root: DomLike): Block[] {
  const blocks: Block[] = [];
  let run: Inline[] = [];
  const endRun = () => {
    const c = trimInline(run);
    if (c.length) blocks.push({ t: "p", c });
    run = [];
  };
  for (const n of kids(root)) {
    const name = n.nodeType === 1 ? n.nodeName.toUpperCase() : "";
    if (!BLOCKS.has(name)) {
      run.push(...domInline(n));
      continue;
    }
    endRun();
    if (name === "UL" || name === "OL") {
      const items = kids(n)
        .filter((li) => li.nodeType === 1 && li.nodeName.toUpperCase() === "LI")
        .map((li) => trimInline(kids(li).flatMap(domInline)).map((x) => (x.t === "br" ? ({ t: "text", v: " " } as Inline) : x)));
      if (items.length) blocks.push({ t: name === "UL" ? "ul" : "ol", items });
    } else if (name === "TABLE") {
      const rows: { head: boolean; cells: Inline[][] }[] = [];
      const visit = (x: DomLike, inHead: boolean) => {
        for (const k of kids(x)) {
          const kn = k.nodeType === 1 ? k.nodeName.toUpperCase() : "";
          if (kn === "TR") {
            const cs = kids(k).filter((c) => c.nodeType === 1 && /^T[HD]$/i.test(c.nodeName));
            rows.push({
              head: inHead || (cs.length > 0 && cs.every((c) => c.nodeName.toUpperCase() === "TH")),
              cells: cs.map((c) => trimInline(kids(c).flatMap(domInline))),
            });
          } else if (kn === "THEAD" || kn === "TBODY" || kn === "TFOOT") visit(k, kn === "THEAD");
        }
      };
      visit(n, false);
      if (rows.length) {
        const head = rows[0].head ? rows[0].cells : null;
        blocks.push({ t: "table", head, rows: (head ? rows.slice(1) : rows).map((r) => r.cells) });
      }
    } else if (kids(n).some((k) => k.nodeType === 1 && BLOCKS.has(k.nodeName.toUpperCase()))) {
      // A wrapper (a div holding paragraphs, as pasted pages often have): read what's inside.
      blocks.push(...domToBlocks(n));
    } else {
      const c = trimInline(kids(n).flatMap(domInline));
      if (c.length) blocks.push({ t: "p", c: /^H\d$/.test(name) ? [{ t: "b", c }] : c });
    }
  }
  endRun();
  return blocks;
}

export const domToText = (root: DomLike) => blocksToText(domToBlocks(root));
