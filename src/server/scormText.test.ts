import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { htmlText, scormText } from "./scormText";

/* Reading the words out of SCORM packages from different authoring tools, for AI drafting. */

const manifest = (title: string, items: string[]) =>
  `<?xml version="1.0"?><manifest identifier="m1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="o"><organization identifier="o"><title>${title}</title>
  ${items.map((t, i) => `<item identifier="i${i}" identifierref="r1"><title>${t}</title></item>`).join("")}
  </organization></organizations>
  <resources><resource identifier="r1" type="webcontent" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources></manifest>`;

const zip = (files: Record<string, string | Uint8Array>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v]))));

const sentence = "Match each line on the invoice to one agreed service before it is approved.";

describe("SCORM text", () => {
  it("reads the outline and plain HTML pages, without scripts or styles", async () => {
    const r = await scormText(
      zip({
        "imsmanifest.xml": manifest("Checking invoices", ["Why it matters", "The checks"]),
        "index.html": `<html><head><title>Why it matters</title><style>p{color:red}</style></head><body><h1>Why it matters</h1><p>${sentence}</p><script>var secret = "not this";</script></body></html>`,
        "media/intro.mp4": new Uint8Array([0, 1, 2, 3]),
      }),
    );
    expect(r.title).toBe("Checking invoices");
    const all = r.sections.join("\n");
    expect(all).toContain("[Section: Course outline]\nWhy it matters\nThe checks");
    expect(all).toContain(sentence);
    expect(all).not.toMatch(/secret|color:red/);
  });

  it("decodes Articulate Rise course data", async () => {
    const course = {
      title: "Checking invoices",
      lessons: [
        { title: "What to look for", id: "abc123", items: [{ type: "text", paragraph: `<p>${sentence}</p>`, color: "#ffffff" }] },
        { title: "When it doesn’t match", items: [{ heading: "Query it with the supplier", media: { src: "assets/photo.jpg" } }] },
      ],
      padding: "x".repeat(4000),
    };
    const b64 = Buffer.from(JSON.stringify(course)).toString("base64");
    const r = await scormText(
      zip({
        "imsmanifest.xml": manifest("Checking invoices", ["Checking invoices"]),
        "scormcontent/index.html": `<script>window.courseData = "${b64}";</script>`,
      }),
    );
    const all = r.sections.join("\n");
    expect(all).toContain(sentence);
    expect(all).toContain("Query it with the supplier");
    expect(all).toContain("What to look for");
    expect(all).not.toMatch(/abc123|#ffffff|photo\.jpg/);
  });

  it("reads Storyline slides by title, and narration captions", async () => {
    const slide = (title: string, text: string) =>
      `window.globalProvideData('slide', '${JSON.stringify({ title, slideLayers: [{ objects: [{ kind: "vectorshape", altText: text, id: "6Xyz" }] }] }).replace(/'/g, "\\'")}');`;
    const r = await scormText(
      zip({
        "course/imsmanifest.xml": manifest("Checking invoices", ["Checking invoices"]),
        "course/html5/data/js/6a1.js": slide("Welcome", "Today you’ll check a supplier’s invoice"),
        "course/html5/data/js/6a2.js": slide("The checks", sentence),
        "course/html5/data/js/frame.js": "window.globalProvideData('frame', '{}');",
        "course/story_content/narration.vtt": `WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nHello, I’m Sam from the finance team.\n`,
      }),
    );
    expect(r.sections[0]).toBe("[Section: Welcome]\nToday you’ll check a supplier’s invoice");
    expect(r.sections[1]).toBe(`[Section: The checks]\n${sentence}`);
    expect(r.sections.join("\n")).toContain("[Section: Narration: narration.vtt]\nHello, I’m Sam from the finance team.");
  });

  it("says plainly when it isn't SCORM, or has no words in it", async () => {
    await expect(scormText(zip({ "notes/readme.txt": sentence }))).rejects.toThrow(/imsmanifest\.xml/);
    await expect(scormText(zip({ "imsmanifest.xml": manifest("Video course", ["Part 1", "Part 2"]), "video.mp4": new Uint8Array([1, 2]) }))).rejects.toThrow(
      /no text could be read/,
    );
    await expect(scormText(Buffer.from("not a zip"))).rejects.toThrow(/ZIP/);
  });

  it("turns HTML into tidy text", () => {
    expect(htmlText("<p>One &amp; two</p><p>Three&nbsp;&rsquo;four&#8217;</p>")).toBe("One & two\nThree ’four’");
  });
});
