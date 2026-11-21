import { describe, expect, it } from "vitest";
import { GuideDocError, pageMinutes, publishChecks, readGuideDoc, templatePage } from "./magazine";

/* Magazine's accordion (text in folds) and carousel (pictures one at a time) blocks. */

const withBlock = (block: object): unknown => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks: [{ id: "b", ...block }] }] }],
});
const pic = (id: string, extra: object = {}) => ({ id, media: { src: `/api/uploads/0f8e7d6c-5b4a-4321-8fed-cba98765432${id.slice(-1)}.webp`, alt: `Picture ${id}`, ...extra } });

describe("the accordion", () => {
  it("keeps each fold's title and text, and counts them in the reading time", () => {
    const d = readGuideDoc(
      withBlock({ type: "accordion", heading: "Terms", items: [{ id: "a1", title: "Bill matching", body: "Matching each line to a service. ".repeat(40), extra: "x" }] }),
    );
    const b = d.pages[0].sections[0].blocks[0];
    expect(b).toEqual({ id: "b", type: "accordion", heading: "Terms", items: [{ id: "a1", title: "Bill matching", body: expect.stringContaining("Matching") }] });
    expect(pageMinutes(d.pages[0])).toBeGreaterThanOrEqual(1);
  });

  it("lets a draft hold unfinished folds, but publishing needs every title and text", () => {
    const half = withBlock({ type: "accordion", items: [{ id: "a1", title: "", body: "" }] });
    expect(() => readGuideDoc(half, { draft: true })).not.toThrow();
    expect(publishChecks(readGuideDoc(half, { draft: true }), "confirm").blocking.join(" ")).toMatch(/item 1 title is missing/);
    expect(() => readGuideDoc(withBlock({ type: "accordion", items: [{ id: "a1", title: "x", body: "y" }, { id: "a1", title: "z", body: "w" }] }))).toThrow(GuideDocError);
  });
});

describe("pictures in an accordion item", () => {
  const item = (extra: object) => withBlock({ type: "accordion", items: [{ id: "a1", title: "Invoice", body: "What to check.", ...extra }] });
  it("keeps a picture with where it sits, defaulting to below the text", () => {
    const d = readGuideDoc(item({ media: { src: "/images/magazine/invoice-annotated.svg", alt: "An invoice", caption: "Three gaps" }, placement: "right" }));
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({ items: [{ media: { src: "/images/magazine/invoice-annotated.svg", caption: "Three gaps" }, placement: "right" }] });
    const def = readGuideDoc(item({ media: { src: "/images/magazine/invoice-annotated.svg", alt: "An invoice" }, placement: "sideways" }));
    expect(def.pages[0].sections[0].blocks[0]).toMatchObject({ items: [{ placement: "below" }] });
    // No picture chosen yet: nothing kept.
    expect(readGuideDoc(item({ media: { src: "", alt: "" } })).pages[0].sections[0].blocks[0]).toEqual({ id: "b", type: "accordion", items: [{ id: "a1", title: "Invoice", body: "What to check." }] });
  });

  it("refuses another site's picture, and needs a description before publishing", () => {
    expect(() => readGuideDoc(item({ media: { src: "https://evil.example/a.png", alt: "x" } }))).toThrow(/uploaded to the Hub/);
    const noAlt = readGuideDoc(item({ media: { src: "/images/magazine/invoice-annotated.svg", alt: "" } }));
    expect(publishChecks(noAlt, "confirm").blocking.join(" ")).toMatch(/item 1: describe the picture/);
  });
});

describe("the carousel", () => {
  it("keeps the pictures in order with their descriptions and captions", () => {
    const d = readGuideDoc(withBlock({ type: "carousel", width: "wide", slides: [pic("s1", { caption: "Before" }), pic("s2")] }));
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({ type: "carousel", width: "wide", slides: [{ id: "s1", media: { caption: "Before" } }, { id: "s2" }] });
    expect(publishChecks(d, "confirm").blocking).toEqual([]);
  });

  it("refuses another site's pictures, and needs a description for each before publishing", () => {
    expect(() => readGuideDoc(withBlock({ type: "carousel", slides: [{ id: "s1", media: { src: "https://evil.example/a.png", alt: "x" } }, pic("s2")] }))).toThrow(/uploaded to the Hub/);
    const noAlt = readGuideDoc(withBlock({ type: "carousel", slides: [pic("s1"), pic("s2", { alt: "" })] }));
    expect(publishChecks(noAlt, "confirm").blocking.join(" ")).toMatch(/picture 2: describe the picture/);
    const decorative = readGuideDoc(withBlock({ type: "carousel", slides: [pic("s1"), pic("s2", { alt: "", decorative: true })] }));
    expect(publishChecks(decorative, "confirm").blocking).toEqual([]);
    expect(() => readGuideDoc(withBlock({ type: "carousel", slides: [pic("s1")] }))).toThrow(/at least 2 pictures/);
  });
});

describe("text and media", () => {
  it("flows the text around the picture unless that's turned off", () => {
    const tm = (extra: object) => withBlock({ type: "textMedia", body: "Words.", media: { src: "/images/magazine/agreed-services.svg", alt: "Services" }, layout: "media-left", ...extra });
    // Wrapping is the default: blocks saved before the option, or with it on, wrap; only "off" is kept.
    expect(readGuideDoc(tm({})).pages[0].sections[0].blocks[0]).not.toHaveProperty("wrap");
    expect(readGuideDoc(tm({ wrap: true })).pages[0].sections[0].blocks[0]).not.toHaveProperty("wrap");
    expect(readGuideDoc(tm({ wrap: false })).pages[0].sections[0].blocks[0]).toMatchObject({ layout: "media-left", wrap: false });
    // New ones from a template wrap by default.
    let n = 0;
    const page = templatePage("decide", (p) => `${p}-${++n}`);
    expect(page.sections.flatMap((x) => x.blocks).find((x) => x.type === "textMedia")).not.toHaveProperty("wrap");
  });
});

describe("a callout's picture strip", () => {
  const callout = (extra: object) => withBlock({ type: "callout", style: "tip", label: "Cultural safety", body: "Ask what matters to the person.", ...extra });
  it("keeps a picture with which part shows, and drops one that hasn't been chosen", () => {
    const d = readGuideDoc(callout({ media: { src: "/images/home-hero.webp", alt: "A carer and a client", position: "30% 60%" } }));
    expect(d.pages[0].sections[0].blocks[0]).toMatchObject({ type: "callout", media: { src: "/images/home-hero.webp", alt: "A carer and a client", position: "30% 60%" } });
    const empty = readGuideDoc(callout({ media: { src: "", alt: "" } }));
    expect(empty.pages[0].sections[0].blocks[0]).not.toHaveProperty("media");
  });

  it("refuses another site's picture, and needs a description or the decorative tick before publishing", () => {
    expect(() => readGuideDoc(callout({ media: { src: "https://elsewhere.example/a.png", alt: "x" } }))).toThrow(/uploaded to the Hub/);
    const undescribed = readGuideDoc(callout({ media: { src: "/images/home-hero.webp", alt: "" } }), { draft: true });
    expect(publishChecks(undescribed, "confirm").blocking.join(" ")).toMatch(/describe the picture strip, or mark it decorative/);
    const decorative = readGuideDoc(callout({ media: { src: "/images/home-hero.webp", alt: "", decorative: true } }));
    expect(publishChecks(decorative, "confirm").blocking.join(" ")).not.toMatch(/picture strip/);
  });
});
