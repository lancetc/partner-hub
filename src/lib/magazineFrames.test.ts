import { describe, expect, it } from "vitest";
import { frameClass, picturePosition, positionText, readGuideDoc } from "./magazine";

/* A picture cropped to a frame, and which part of it shows. */

const doc = (blocks: unknown[]) => ({
  schema: 2,
  pages: [{ id: "p1", title: "", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s", title: "S", blocks }] }],
});
const pic = (extra: object = {}) => ({ src: "/api/uploads/a.webp", alt: "A visit", ...extra });

describe("a picture's frame and position", () => {
  it("keeps a frame and a real position, and drops the centre or anything else", () => {
    const blocks = readGuideDoc(
      doc([
        { id: "a", type: "image", width: "column", frame: "wide", media: pic({ position: "50% 20%" }) },
        { id: "b", type: "image", width: "column", frame: "round", media: pic({ position: "50% 50%" }) },
        { id: "c", type: "textMedia", body: "Text", layout: "media-right", frame: "square", media: pic({ position: "calc(1px)" }) },
      ]),
    ).pages[0].sections[0].blocks;
    expect(blocks[0]).toMatchObject({ frame: "wide", media: { position: "50% 20%" } });
    expect(blocks[1]).not.toHaveProperty("frame");
    expect((blocks[1] as { media: object }).media).not.toHaveProperty("position");
    expect(blocks[2]).toMatchObject({ frame: "square" });
    expect((blocks[2] as { media: object }).media).not.toHaveProperty("position");
  });

  it("reads and writes positions, centred by default", () => {
    expect(picturePosition(undefined)).toEqual([50, 50]);
    expect(picturePosition("12.5% 80%")).toEqual([12.5, 80]);
    expect(positionText(-4, 33.333)).toBe("0% 33.3%");
    expect(frameClass(undefined)).toBe("");
    expect(frameClass("wide")).toBe("aspect-[320/117] object-cover");
  });
});
