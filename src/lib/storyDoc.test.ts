import { describe, expect, it } from "vitest";
import type { StoryBlock } from "@/content/stories";
import type { DomLike } from "./richText";
import { storyFromDom, storyToHtml } from "./storyDoc";

/* A news story as one document in the editor, stored as blocks. */

const el = (nodeName: string, children: (DomLike | string)[] = [], attrs: Record<string, string> = {}): DomLike => ({
  nodeType: 1,
  nodeName,
  textContent: null,
  childNodes: children.map((c) => (typeof c === "string" ? { nodeType: 3, nodeName: "#text", textContent: c, childNodes: [] } : c)),
  getAttribute: (n) => attrs[n] ?? null,
});

describe("story documents", () => {
  it("reads headings, formatted paragraphs, bullet lists, quotes and pictures back into blocks", () => {
    const root = el("DIV", [
      el("P", ["The hub has ", el("STRONG", ["news"]), "."]),
      el("P", ["A second paragraph."]),
      el("H2", ["What changes"]),
      el("H3", ["For partners"]),
      el("UL", [el("LI", ["Log notes"]), el("LI", [el("EM", ["On"]), " the day"])]),
      el("OL", [el("LI", ["First"]), el("LI", ["Second"])]),
      el("BLOCKQUOTE", [el("P", ["It saves time."]), el("FOOTER", ["— Priya, coordinator"])]),
      el("FIGURE", [el("IMG")], {
        "data-src": "/api/uploads/a.webp",
        "data-width": "800",
        "data-height": "600",
        "data-alt": "A garden",
        "data-align": "left",
        "data-caption": "",
      }),
    ]);
    expect(storyFromDom(root)).toEqual([
      { type: "p", text: "The hub has **news**.\n\nA second paragraph." },
      { type: "h2", text: "What changes" },
      { type: "h3", text: "For partners" },
      { type: "list", items: ["Log notes", "*On* the day"] },
      { type: "p", text: "1. First\n2. Second" },
      { type: "quote", text: "It saves time.", cite: "Priya, coordinator" },
      { type: "image", src: "/api/uploads/a.webp", width: 800, height: 600, alt: "A garden", align: "left" },
    ]);
  });

  it("draws blocks as the editor shows them, escaping everything", () => {
    const blocks: StoryBlock[] = [
      { type: "h2", text: "<b>Hi</b>" },
      { type: "image", src: "/api/uploads/a.webp", width: 8, height: 6, alt: 'A "quoted" alt', align: "right", caption: "Cap" },
    ];
    const html = storyToHtml(blocks);
    expect(html).toContain("<h2>&lt;b&gt;Hi&lt;/b&gt;</h2>");
    expect(html).toContain('data-alt="A &quot;quoted&quot; alt"');
    expect(html).toContain('contenteditable="false"');
    // Somewhere to type after a picture at the end.
    expect(html.endsWith("<p><br></p>")).toBe(true);
  });
});
