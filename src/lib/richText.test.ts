import { describe, expect, it } from "vitest";
import { blocksToText, domToText, hasFormatting, parseRich, plainText, toHtml, toInlineHtml, type DomLike } from "./richText";

/* Rich text on Text cards: a few marks in a plain string, read into blocks and written back. */

describe("reading formatted text", () => {
  it("reads bold, italics, links and line breaks", () => {
    expect(parseRich("A **firm** and *kind* [reply](https://example.com).\nNext line")).toEqual([
      {
        t: "p",
        c: [
          { t: "text", v: "A " },
          { t: "b", c: [{ t: "text", v: "firm" }] },
          { t: "text", v: " and " },
          { t: "i", c: [{ t: "text", v: "kind" }] },
          { t: "text", v: " " },
          { t: "a", href: "https://example.com", c: [{ t: "text", v: "reply" }] },
          { t: "text", v: "." },
          { t: "br" },
          { t: "text", v: "Next line" },
        ],
      },
    ]);
  });

  it("leaves plain text alone, including a lone star or a link that isn't safe", () => {
    expect(hasFormatting("Rated 4 * out of 5. Costs $80 an hour.")).toBe(false);
    expect(hasFormatting("[click](javascript:alert(1))")).toBe(false);
    expect(plainText("Two\n\nparagraphs")).toBe("Two paragraphs");
  });

  it("reads lists and tables, with or without a heading row", () => {
    const [ul, ol, table, bare] = parseRich("- one\n- two\n\n1. first\n2. second\n\n| A | B |\n| --- | --- |\n| 1 | 2 \\| 3 |\n\n| x | y |");
    expect(ul).toMatchObject({ t: "ul", items: [[{ v: "one" }], [{ v: "two" }]] });
    expect(ol).toMatchObject({ t: "ol", items: [[{ v: "first" }], [{ v: "second" }]] });
    expect(table).toMatchObject({ t: "table", head: [[{ v: "A" }], [{ v: "B" }]], rows: [[[{ v: "1" }], [{ v: "2 | 3" }]]] });
    expect(bare).toMatchObject({ t: "table", head: null, rows: [[[{ v: "x" }], [{ v: "y" }]]] });
  });

  it("reads a table pasted from a spreadsheet", () => {
    const [t] = parseRich("Level\tBudget\n1\t$10,731\n2\t$16,034");
    expect(t).toMatchObject({
      t: "table",
      head: [[{ v: "Level" }], [{ v: "Budget" }]],
      rows: [
        [[{ v: "1" }], [{ v: "$10,731" }]],
        [[{ v: "2" }], [{ v: "$16,034" }]],
      ],
    });
  });

  it("writes back what it reads", () => {
    const src = "A **firm** and *kind* [reply](https://example.com).\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 \\| 3 |";
    expect(blocksToText(parseRich(src))).toBe(src);
    expect(blocksToText(parseRich("Stars \\*kept\\*"))).toBe("Stars \\*kept\\*");
  });

  it("escapes everything when drawing the editor", () => {
    expect(toHtml('<img src=x onerror="alert(1)"> **hi**')).toBe("<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; <strong>hi</strong></p>");
  });
});

/* A tiny stand-in for the browser's DOM: enough for what the editor reads. */
const el = (nodeName: string, children: (DomLike | string)[] = [], attrs: Record<string, string> = {}): DomLike => ({
  nodeType: 1,
  nodeName,
  textContent: null,
  childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeName: "#text", textContent: c, childNodes: [] } : c)),
  getAttribute: (n) => attrs[n] ?? null,
});

describe("reading the editor", () => {
  it("turns paragraphs, marks and links into text", () => {
    const root = el("DIV", [
      el("P", ["A ", el("STRONG", ["firm"]), " and ", el("EM", ["kind"]), " ", el("A", ["reply"], { href: "https://example.com" })]),
      el("P", ["Two", el("BR"), "lines"]),
    ]);
    expect(domToText(root)).toBe("A **firm** and *kind* [reply](https://example.com)\n\nTwo\nlines");
  });

  it("reads Google Docs' paste, where everything sits in a not-bold <b>", () => {
    const root = el("DIV", [el("B", [el("SPAN", ["Plain "]), el("SPAN", ["bold"], { style: "font-weight:700" })], { style: "font-weight:normal" })]);
    expect(domToText(root)).toBe("Plain **bold**");
  });

  it("drops scripts, unsafe links and unknown markup but keeps the words", () => {
    const root = el("DIV", [
      el("P", [el("SCRIPT", ["alert(1)"]), el("A", ["Click"], { href: "javascript:alert(1)" }), " ", el("SPAN", ["here"], { style: "color:red" })]),
    ]);
    expect(domToText(root)).toBe("Click here");
  });

  it("reads lists and tables", () => {
    const root = el("DIV", [
      el("UL", [el("LI", ["one"]), el("LI", ["two"])]),
      el("TABLE", [el("THEAD", [el("TR", [el("TH", ["A"]), el("TH", ["B"])])]), el("TBODY", [el("TR", [el("TD", ["1"]), el("TD", ["2|3"])])])]),
    ]);
    expect(domToText(root)).toBe("- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
  });
});

describe("sentences that look like list items", () => {
  it("keeps a numbered or dashed sentence as typed, and reads it back the same", () => {
    const root = el("DIV", [el("P", ["3. Trilogy claims the agreed price"]), el("P", ["- not a list either"])]);
    const text = domToText(root);
    expect(parseRich(text).map((b) => b.t)).toEqual(["p", "p"]);
    expect(plainText(text)).toBe("3. Trilogy claims the agreed price - not a list either");
    expect(blocksToText(parseRich(text))).toBe(text);
  });

  it("draws a point as one line, never a list", () => {
    expect(toInlineHtml("3. Trilogy **claims**")).toBe("<p>3. Trilogy <strong>claims</strong></p>");
  });
});
