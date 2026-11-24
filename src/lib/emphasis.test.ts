import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/RichText";
import { blocksToText, domToText, emphasisIn, hasFormatting, parseInline, parseRich, plainText, toHtml, withoutEmphasis, type DomLike } from "./richText";
import { EMPHASIS, emphasisChecks, sweepStart } from "./emphasis";
import { locatePassage, normText } from "./passageMatch";
import { pageMinutes, publishChecks, type Block, type GuideDoc, type Page } from "./magazine";
import { pageSnapshot, substantiallyChanged, wordCount } from "./magazineNarration";
import { blockWords } from "@/server/favourites";

/* Emphasise text (docs/emphasise-text.md): ==a phrase== in rich text, a marker behind the words and nothing else. */

const DOT = "Dot wanted to ==keep tending her roses==, even after the fall.";

describe("reading and writing emphasis", () => {
  it("reads a marked phrase, inside or around other marks", () => {
    expect(parseInline(DOT)).toEqual([
      { t: "text", v: "Dot wanted to " },
      { t: "m", c: [{ t: "text", v: "keep tending her roses" }] },
      { t: "text", v: ", even after the fall." },
    ]);
    expect(parseInline("A **firm ==yes==** and ==see [the plan](/plans)==")).toEqual([
      { t: "text", v: "A " },
      {
        t: "b",
        c: [
          { t: "text", v: "firm " },
          { t: "m", c: [{ t: "text", v: "yes" }] },
        ],
      },
      { t: "text", v: " and " },
      {
        t: "m",
        c: [
          { t: "text", v: "see " },
          { t: "a", href: "/plans", c: [{ t: "text", v: "the plan" }] },
        ],
      },
    ]);
  });

  it("writes back what it reads, escaping equals signs that would run into a mark", () => {
    for (const src of [
      DOT,
      "A **firm ==yes==** and ==see [the plan](/plans)==",
      "- ==first== item\n- second",
      "| A | B |\n| --- | --- |\n| ==one== | two |",
      "Costs a\\==b and ==x\\===",
    ])
      expect(blocksToText(parseRich(src))).toBe(src);
    // Equals signs typed as words are kept as words, and read back as typed.
    const typed = [
      {
        t: "p" as const,
        c: [
          { t: "text" as const, v: "a==b ==c== and x=" },
          { t: "m" as const, c: [{ t: "text" as const, v: "=y=" }] },
        ],
      },
    ];
    const text = blocksToText(typed);
    expect(parseRich(text)).toEqual(typed);
    expect(plainText(text)).toBe("a==b ==c== and x==y=");
  });

  it("draws the editor's mark and reads it back; another site's <mark> keeps only its words", () => {
    expect(toHtml(DOT)).toBe('<p>Dot wanted to <mark class="tc-emph" data-emph="">keep tending her roses</mark>, even after the fall.</p>');
    const ours = el("P", ["Dot wanted to ", el("MARK", ["keep tending her roses"], { "data-emph": "", class: "tc-emph" }), ", even after the fall."]);
    expect(domToText(el("DIV", [ours]))).toBe(DOT);
    const pasted = el("P", ["Dot wanted to ", el("MARK", ["keep tending her roses"]), ", even after the fall."]);
    expect(domToText(el("DIV", [pasted]))).toBe("Dot wanted to keep tending her roses, even after the fall.");
    // Spaces selected with the words move outside the marks; a mark around nothing but space is dropped.
    expect(domToText(el("DIV", [el("P", ["Dot", el("MARK", [" wanted "], { "data-emph": "" }), "to", el("MARK", [" "], { "data-emph": "" }), "go"])]))).toBe(
      "Dot ==wanted== to go",
    );
    // Two marks side by side, or one inside another, are one phrase.
    const side = el("P", [el("MARK", ["keep "], { "data-emph": "" }), el("MARK", [el("MARK", ["tending"], { "data-emph": "" })], { "data-emph": "" })]);
    expect(domToText(el("DIV", [side]))).toBe("==keep tending==");
  });

  it("finds the phrases paragraph by paragraph, and takes emphasis off without touching a word", () => {
    expect(emphasisIn(`${DOT}\n\nNo marks here.\n\n==One== and ==two==`)).toEqual([["keep tending her roses"], [], ["One", "two"]]);
    expect(withoutEmphasis(`${DOT}\n\n- ==first== item`)).toBe("Dot wanted to keep tending her roses, even after the fall.\n\n- first item");
    expect(withoutEmphasis("No marks, a == b.")).toBe("No marks, a == b.");
  });
});

describe("older content reads exactly as it did", () => {
  const OLD = [
    "Rated 4 * out of 5. Costs $80 an hour.",
    "If a == b then check it, and x === y is code.",
    "== spaced == is not a mark",
    "==\n\n== across paragraphs isn't either",
    "Total ===== a line of equals",
    "A **firm** and *kind* [reply](https://example.com).\n\n- one\n- two",
    "Score = 10 and score=20, a=b",
  ];
  it("has no emphasis and writes back unchanged", () => {
    for (const src of OLD) {
      const blocks = parseRich(src);
      expect(JSON.stringify(blocks)).not.toContain('"t":"m"');
      expect(plainText(src)).not.toContain("\\");
    }
    expect(hasFormatting(OLD[1])).toBe(false);
    expect(plainText(OLD[1])).toBe(OLD[1]);
    expect(blocksToText(parseRich(OLD[1]))).toBe(OLD[1]);
    expect(blocksToText(parseRich(OLD[6]))).toBe(OLD[6]);
  });

  it("finds no emphasis anywhere in the Hub's own lessons, stories and Magazine courses", async () => {
    const { lessons } = await import("@/content/lessons");
    const { stories } = await import("@/content/stories");
    const { seedGuides } = await import("@/content/magazine");
    const { MAGAZINE_DEMOS } = await import("@/content/magazineDemos");
    const strings: string[] = [];
    function walk(v: unknown): void {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    }
    walk(lessons);
    walk(stories);
    walk(seedGuides);
    walk(MAGAZINE_DEMOS);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((s) => emphasisIn(s).some((p) => p.length))).toEqual([]);
  });
});

/* A tiny stand-in for the browser's DOM, as in richText.test. */
function el(nodeName: string, children: (DomLike | string)[] = [], attrs: Record<string, string> = {}): DomLike {
  return {
    nodeType: 1,
    nodeName,
    textContent: null,
    childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeName: "#text", textContent: c, childNodes: [] } : c)),
    getAttribute: (n) => attrs[n] ?? null,
  };
}

describe("a learner's saved passage is unaffected", () => {
  const plain = "Dot wanted to keep tending her roses, even after the fall. Her daughter wanted a gardener.";
  const marked = "Dot wanted to ==keep tending her roses==, even after the fall. Her daughter wanted a gardener.";
  const block = (body: string): Block => ({ id: "b1", type: "text", body });

  it("has the same words, so the same anchor and match, with or without the mark", () => {
    expect(plainText(marked)).toBe(plainText(plain));
    expect(blockWords(block(marked))).toBe(blockWords(block(plain)));
    expect(normText(blockWords(block(marked)))).toBe(normText(plain));
  });

  it("finds a selection across the mark's edges in the page's text pieces, as the marker on the page does", () => {
    // The reader's page: the mark splits the paragraph into three text nodes.
    const pieces = ["Dot wanted to ", "keep tending her roses", ", even after the fall. Her daughter wanted a gardener."];
    const across = "to keep tending her roses, even after";
    expect(locatePassage(pieces, across)).toEqual({ start: [0, 11], end: [2, 12] });
    expect(locatePassage(pieces, "keep tending her roses")).toEqual({ start: [1, 0], end: [1, 22] });
    // The same passage in unmarked text is found at the same characters of the sentence.
    const one = [pieces.join("")];
    const a = locatePassage(one, across)!;
    const b = locatePassage(pieces, across)!;
    const global = ([p, o]: [number, number]) => pieces.slice(0, p).join("").length + o;
    expect([global(b.start), global(b.end)]).toEqual([a.start[1], a.end[1]]);
    expect(one[0].slice(a.start[1], a.end[1])).toBe(across);
  });

  it("is still saved, matched and marked on a published guide with emphasis", async () => {
    const { openDb } = await import("@/server/db");
    const { userById } = await import("@/server/auth");
    const { savePassage, pageMarks, favouritesList } = await import("@/server/favourites");
    const { createGuide, publishGuide, readGuide } = await import("@/server/magazine");
    const db = openDb(":memory:");
    const [jordan, riley] = ["jordan", "riley"].map((id) => userById(db, id)!);
    const now = new Date("2026-11-24T00:00:00Z");
    const doc = {
      schema: 2,
      pages: [
        {
          id: "p1",
          title: "Dot and the roses",
          purpose: "",
          template: "blank",
          kind: "content",
          required: true,
          allActivities: false,
          sections: [{ id: "s1", title: "The situation", blocks: [{ id: "b1", type: "text", body: marked }] }],
        },
      ],
    };
    const c = createGuide(db, jordan, { title: "ZZ Test emphasis", standfirst: "A test.", audience: ["coordinator"], completion: "reference", doc }, now);
    publishGuide(db, jordan, c.id, "First", now);
    const g = readGuide(db, riley, c.id);
    // Selected across the marked phrase, the words are what the reader sees, and the server finds them in the block.
    const quote = "Dot wanted to keep tending her roses, even after the fall.";
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote }, now);
    expect(saved).toMatchObject({ saved: true, quote });
    expect(favouritesList(db, riley, {}, now).items[0]).toMatchObject({ state: "current", quote });
    expect(pageMarks(db, riley, { source: "guide", id: g.slug, page: "p1" }, now).marks).toEqual([{ id: saved.id, blockId: "b1", quote }]);
    // Just the marked phrase can be saved too, and it's the plain words.
    const phrase = savePassage(
      db,
      riley,
      { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: "keep tending her roses" },
      now,
    );
    expect(phrase.quote).toBe("keep tending her roses");
  });
});

describe("reading time and narration count the words, not the marks", () => {
  const page = (body: string) =>
    ({
      id: "p1",
      title: "Dot",
      purpose: "Notice what Dot wants.",
      template: "blank",
      kind: "content",
      required: true,
      sections: [{ id: "s1", title: "The situation", blocks: [{ id: "b1", type: "text", body }] }],
    }) as unknown as Page;
  const long = `${"Her daughter worried about the steps by the shed. ".repeat(40)}Dot wanted to keep tending her roses.`;
  const marked = long.replace("keep tending her roses", "==keep tending her roses==");

  it("gives the same minutes and word count", () => {
    expect(pageMinutes(page(marked))).toBe(pageMinutes(page(long)));
    expect(wordCount(marked)).toBe(wordCount(long));
    expect(marked.split(/\s+/).length).toBe(long.split(/\s+/).length);
  });

  it("doesn't make a page's narration look out of date", () => {
    expect(substantiallyChanged(pageSnapshot(page(long)), pageSnapshot(page(marked)))).toBe(false);
    expect(pageSnapshot(page(long)).sig).toEqual(pageSnapshot(page(marked)).sig);
  });
});

describe("the sweep, and reduced motion", () => {
  it("only sweeps a phrase that is off screen, not yet seen, with motion allowed", () => {
    const base = { reduced: false, canObserve: true, seen: false, inView: false };
    expect(sweepStart(base)).toBe("sweep");
    expect(sweepStart({ ...base, reduced: true })).toBe("static");
    expect(sweepStart({ ...base, canObserve: false })).toBe("static");
    expect(sweepStart({ ...base, seen: true })).toBe("static");
    expect(sweepStart({ ...base, inView: true })).toBe("static");
  });

  it("is drawn by the server as the final, static marker, around ordinary text", () => {
    const html = renderToStaticMarkup(createElement(RichText, { text: DOT }));
    expect(html).toContain('<mark class="tc-emph">keep tending her roses</mark>');
    expect(html).not.toContain("data-sweep");
    // Nothing extra in the words: no hidden text, no per-letter spans.
    expect(html.replace(/<[^>]+>/g, "")).toBe("Dot wanted to keep tending her roses, even after the fall.");
  });

  it("has a stylesheet that shows the marker whole with reduced motion, in print and in forced colours", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8").replace(/\r\n/g, "\n");
    const block = (media: string) => css.slice(css.indexOf(media), css.indexOf("}\n}", css.indexOf(media)) + 3);
    expect(css).toMatch(/mark\.tc-emph \{[^}]*background-size: 100% 100%/);
    expect(block("@media (prefers-reduced-motion: reduce) {\n  mark.tc-emph")).toMatch(/background-size: 100% 100%; transition: none/);
    expect(block("@media print {\n  mark.tc-emph")).toMatch(/background-size: 100% 100% !important/);
    expect(css).toMatch(/@media \(forced-colors: active\) \{\n  mark\.tc-emph \{ forced-color-adjust: none; background: Mark; color: MarkText; \}/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \{ --emph-marker: #[0-9a-f]{6}; \}/);
  });
});

describe("checks before publishing", () => {
  const doc = (blocks: Block[], more: Block[] = []): GuideDoc =>
    ({
      schema: 2,
      pages: [
        {
          id: "p1",
          title: "Dot",
          purpose: "",
          template: "decide",
          kind: "content",
          required: true,
          sections: [
            { id: "s1", title: "The situation", blocks },
            { id: "s2", title: "What would you do?", blocks: more },
          ],
        },
      ],
    }) as unknown as GuideDoc;
  const text = (id: string, body: string): Block => ({ id, type: "text", body });
  const decision: Block = {
    id: "d1",
    type: "decision",
    prompt: "What do you do first?",
    choices: [
      { id: "c1", text: "Ask Dot what matters about the garden", verdict: "best", feedback: "Yes." },
      { id: "c2", text: "Book a gardener", verdict: "risky", feedback: "Not yet." },
    ],
  } as Block;
  const checks = (d: GuideDoc) => emphasisChecks(d, (b) => b.type);

  it("is quiet for a short phrase or two", () => {
    expect(checks(doc([text("t1", DOT), text("t2", "Later, ==the steps by the shed== worried her daughter.")], [decision]))).toEqual([]);
  });

  it("suggests a shorter phrase, fewer marks, and none in activities", () => {
    const long = "==Dot had looked after the garden every single morning for over forty years and was proud of it==.";
    const out = checks(
      doc(
        [text("t1", long), text("t2", "==One== and ==two== in a paragraph."), text("t3", "==three==")],
        [{ ...decision, prompt: "What does ==Dot== want?" } as Block],
      ),
    );
    expect(out.some((s) => s.includes("is long for emphasis") && s.includes("text 1"))).toBe(true);
    expect(out.some((s) => s.includes("two emphasised phrases in one paragraph") && s.includes("text 2"))).toBe(true);
    expect(out.some((s) => s.includes("4 phrases are emphasised in one section"))).toBe(true);
    expect(out.some((s) => s.includes("“What would you do?”, decision 1: emphasis is for story text"))).toBe(true);
    expect(wordsOver(long)).toBeGreaterThan(EMPHASIS.words);
  });

  it("asks for the answer not to be marked before the question", () => {
    const spoiler = text("t1", "The right move is to ==ask Dot what matters about the garden==.");
    expect(checks(doc([spoiler], [decision]))).toEqual([expect.stringContaining("matches the answer to a question after it")]);
    // After the question, in the feedback's place, it's fine.
    expect(checks(doc([], [decision, spoiler]))).toEqual([]);
  });

  it("are suggestions in the publish checks, never blocking", () => {
    const d = doc([text("t1", "The right move is to ==ask Dot what matters about the garden==.")], [decision]);
    const r = publishChecks(d, "reference");
    expect(r.suggestions.some((s) => s.includes("matches the answer"))).toBe(true);
    expect(r.blocking.some((s) => s.includes("emphas"))).toBe(false);
  });
});

const wordsOver = (s: string) => plainText(s).split(/\s+/).filter(Boolean).length;
