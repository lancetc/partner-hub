import { describe, expect, it } from "vitest";
import { readGuideDoc, type Block } from "./magazine";
import { canConvert, convertBlock, convertLoses, CONVERTIBLE } from "./magazineConvert";

/* Changing a Magazine block into another kind, keeping what fits. */

const text: Block = { id: "t1", type: "text", heading: "Before you go", level: 3, body: "Read the **care plan**.\n\n- Check the address\n- Bring ID", note: "Check wording", reveal: "fade" };
const picture = { src: "/images/magazine/a.jpg", alt: "A front door" };

/** Every converted block must still be a valid block in a draft. */
const valid = (b: Block) =>
  readGuideDoc(
    { schema: 2, pages: [{ id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks: [b] }] }] },
    { draft: true },
  ).pages[0].sections[0].blocks[0];

describe("changing a block's kind", () => {
  it("turns text into every other kind, keeping its id, words, note and entrance, and each result is a valid block", () => {
    if (!canConvert(text)) throw new Error("text converts");
    for (const to of CONVERTIBLE.filter((t) => t !== "text")) {
      const b = valid(convertBlock(text, to));
      expect(b).toMatchObject({ id: "t1", type: to, note: "Check wording", reveal: "fade" });
    }
    expect(convertBlock(text, "textMedia")).toEqual({
      id: "t1",
      type: "textMedia",
      heading: "Before you go",
      body: text.body,
      note: "Check wording",
      reveal: "fade",
      media: { src: "", alt: "" },
      layout: "media-right",
    });
    expect(convertBlock(text, "callout")).toMatchObject({ style: "tip", label: "Before you go", body: text.body });
    expect(convertBlock(text, "checklist")).toMatchObject({ title: "Before you go", items: ["Read the care plan.", "Check the address", "Bring ID"] });
  });

  it("keeps a picture or a video where the new kind can hold it, and says what it leaves behind", () => {
    const tm: Block = { id: "m1", type: "textMedia", heading: "Meet Sam", body: "Sam explains.", media: picture, layout: "media-left" };
    if (!canConvert(tm)) throw new Error("converts");
    expect(convertBlock(tm, "image")).toMatchObject({ type: "image", media: { ...picture, caption: "Sam explains." } });
    expect(convertLoses(tm, "text")).toEqual(["the picture"]);
    expect(convertLoses(tm, "image")).toEqual(["the heading"]);
    const withVideo: Block = { ...tm, media: { src: "", alt: "" }, video: { title: "Sam", src: "/api/uploads/a.mp4", transcript: "Hi." } };
    if (!canConvert(withVideo)) throw new Error("converts");
    expect(convertBlock(withVideo, "video")).toMatchObject({ id: "m1", type: "video", title: "Sam", src: "/api/uploads/a.mp4", transcript: "Hi.", caption: "Sam explains." });
    expect(convertLoses(withVideo, "callout")).toEqual(["the video"]);
    // And back: a video block becomes text and media with its video beside the words.
    const video = convertBlock(withVideo, "video");
    if (!canConvert(video)) throw new Error("converts");
    expect(convertBlock(video, "textMedia")).toMatchObject({ type: "textMedia", heading: "Sam", body: "Sam explains.", video: { src: "/api/uploads/a.mp4", transcript: "Hi." } });
  });

  it("turns folds into tabs and back one for one, and into text with each fold's title in bold", () => {
    const folds: Block = {
      id: "a1",
      type: "accordion",
      heading: "Your options",
      items: [
        { id: "i1", title: "Self managed", body: "You arrange it." },
        { id: "i2", title: "Fully coordinated", body: "We arrange it.", media: picture },
      ],
    };
    if (!canConvert(folds)) throw new Error("converts");
    const tabs = convertBlock(folds, "tabs");
    expect(tabs).toMatchObject({ type: "tabs", tabs: [{ label: "Self managed", body: "You arrange it." }, { label: "Fully coordinated", body: "We arrange it." }] });
    expect(convertLoses(folds, "tabs")).toEqual(["the pictures in the folds"]);
    expect(convertBlock(folds, "text")).toMatchObject({ heading: "Your options", body: "**Self managed**\n\nYou arrange it.\n\n**Fully coordinated**\n\nWe arrange it." });
    expect(convertBlock(folds, "checklist")).toMatchObject({ title: "Your options", items: ["Self managed", "Fully coordinated"] });
  });

  it("names a callout's link and style when they'd be left behind", () => {
    const callout: Block = { id: "c1", type: "callout", style: "important", label: "Stop", body: "Call 000.", link: { href: "/resources", label: "More" } };
    if (!canConvert(callout)) throw new Error("converts");
    expect(convertLoses(callout, "text")).toEqual(["the link", "the callout’s style"]);
    expect(convertBlock(callout, "text")).toMatchObject({ type: "text", heading: "Stop", body: "Call 000." });
  });

  it("only offers the kinds that hold words or media", () => {
    expect(canConvert({ id: "q", type: "quiz", pathId: "x" } as Block)).toBe(false);
  });
});

describe("enlarging a picture in text and media", () => {
  it("is kept on a picture, dropped with a video, and carried over to and from a picture block", () => {
    const tm = readGuideDoc({
      schema: 2,
      pages: [{ id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks: [{ id: "m", type: "textMedia", body: "Words.", media: picture, layout: "media-right", enlarge: true }] }] }],
    }).pages[0].sections[0].blocks[0];
    expect(tm).toMatchObject({ type: "textMedia", enlarge: true });
    if (!canConvert(tm)) throw new Error("converts");
    expect(convertBlock(tm, "image")).toMatchObject({ type: "image", enlarge: true });
    const back = convertBlock(convertBlock(tm, "image") as Block & { type: "image" }, "textMedia");
    expect(back).toMatchObject({ type: "textMedia", enlarge: true });
    const withVideo = readGuideDoc({
      schema: 2,
      pages: [{ id: "p", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks: [{ id: "m", type: "textMedia", body: "Words.", media: { src: "" }, video: { embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, transcript: "x" }, layout: "media-right", enlarge: true }] }] }],
    }, { draft: true }).pages[0].sections[0].blocks[0];
    expect(withVideo).not.toHaveProperty("enlarge");
  });
});
