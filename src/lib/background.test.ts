import { describe, expect, it } from "vitest";
import {
  backdropImage,
  backdropShownOn,
  isPlayerPath,
  checkBackground,
  coverSizes,
  DEFAULT_BACKGROUND,
  parseBackground,
  sameBackground,
  type PexelsChoice,
} from "./background";

/* Backgrounds: what can be saved, how saved ones are read back, how photos are sized, and where they show. */

const pexels: PexelsChoice = {
  kind: "pexels",
  id: 1318500,
  src: "https://images.pexels.com/photos/1318500/pexels-photo-1318500.jpeg",
  width: 3968,
  height: 2976,
  color: "#637676",
  alt: "Currumbin Beach",
  photographer: "Damon Hall",
  photographerUrl: "https://www.pexels.com/@damodigital",
  pageUrl: "https://www.pexels.com/photo/aerial-photo-of-white-sandy-beach-during-the-day-1318500/",
};

describe("checking a chosen background", () => {
  it("accepts none, brand colours and Pexels photos", () => {
    expect(checkBackground({ kind: "none" })).toEqual({ ok: true, value: { kind: "none" } });
    expect(checkBackground({ kind: "colour", id: "navy-teal" })).toEqual({ ok: true, value: { kind: "colour", id: "navy-teal" } });
    expect(checkBackground(pexels)).toEqual({ ok: true, value: pexels });
  });

  it("drops anything extra and tidies text", () => {
    const r = checkBackground({ ...pexels, photographer: "  Damon   Hall ", extra: "<script>", color: "red" });
    expect(r).toEqual({ ok: true, value: { ...pexels, color: null } });
  });

  it("refuses unknown colours, other image hosts and mismatched photos", () => {
    expect(checkBackground({ kind: "colour", id: "violet" }).ok).toBe(false);
    expect(checkBackground({ ...pexels, src: "https://evil.example/photos/1318500/x.jpeg" }).ok).toBe(false);
    expect(checkBackground({ ...pexels, src: "http://images.pexels.com/photos/1318500/pexels-photo-1318500.jpeg" }).ok).toBe(false);
    expect(checkBackground({ ...pexels, id: 42 }).ok).toBe(false);
    expect(checkBackground({ ...pexels, photographerUrl: "javascript:alert(1)" }).ok).toBe(false);
    expect(checkBackground({ ...pexels, photographer: "" }).ok).toBe(false);
    expect(checkBackground({ ...pexels, width: 0 }).ok).toBe(false);
    expect(checkBackground(null).ok).toBe(false);
  });

  it("never accepts an upload from the browser: only the upload itself saves one", () => {
    expect(checkBackground({ kind: "upload", file: "someone-else.webp", width: 10, height: 10 }).ok).toBe(false);
  });
});

describe("reading a saved background", () => {
  it("shows the default when nothing, or nothing readable, is saved", () => {
    expect(parseBackground(null)).toEqual(DEFAULT_BACKGROUND);
    expect(parseBackground("not json")).toEqual(DEFAULT_BACKGROUND);
    expect(parseBackground(JSON.stringify({ kind: "colour", id: "gone" }))).toEqual(DEFAULT_BACKGROUND);
    expect(parseBackground(JSON.stringify({ kind: "upload", file: "../../etc/passwd", width: 1, height: 1 }))).toEqual(DEFAULT_BACKGROUND);
  });

  it("reads back uploads, photos and none", () => {
    const upload = { kind: "upload", file: "sam-abc123.webp", width: 2560, height: 1440, color: "#336699" } as const;
    expect(parseBackground(JSON.stringify(upload))).toEqual(upload);
    expect(parseBackground(JSON.stringify(pexels))).toEqual(pexels);
    expect(parseBackground(JSON.stringify({ kind: "none" }))).toEqual({ kind: "none" });
  });
});

describe("sizing photos", () => {
  it("asks for a wider photo when the screen is narrower than it (a phone held upright)", () => {
    expect(coverSizes(3000, 2000)).toBe("(max-aspect-ratio: 3000/2000) 150vh, 100vw");
  });

  it("offers Pexels photos in several widths", () => {
    const img = backdropImage(pexels)!;
    expect(img.srcSet.split(", ")).toHaveLength(3);
    expect(img.srcSet).toContain("w=1280");
    expect(img.src).toContain("auto=compress");
    expect(img.color).toBe("#637676");
  });

  it("offers uploads at both stored sizes", () => {
    const img = backdropImage({ kind: "upload", file: "sam-abc.webp", width: 1440, height: 2560, color: null })!;
    expect(img.srcSet).toBe("/api/backgrounds/sam-abc-sm.webp 720w, /api/backgrounds/sam-abc.webp 1440w");
  });

  it("has no photo for colours and none", () => {
    expect(backdropImage({ kind: "colour", id: "navy" })).toBeNull();
    expect(backdropImage({ kind: "none" })).toBeNull();
  });
});

describe("where the background shows", () => {
  it.each([
    "/",
    "/news/some-story",
    "/community",
    "/topics",
    "/paths",
    "/paths/abc",
    "/magazine",
    "/inbox",
    "/resources",
    "/resources/glossary",
    "/play",
    "/settings",
    "/webinars/3",
    "/challenge/2",
    "/discovery",
    "/topics/dementia-basics",
    "/topics/s/lf-recall",
    "/topics/follow-ups/12",
  ])("shows on %s", (p) => expect(backdropShownOn(p)).toBe(true));
  it.each([
    "/topics/a/b",
    "/elearning/crs-1",
    "/magazine/draft/mag-1",
    "/admin",
    "/admin/lessons",
    "/login",
    "/paths/abc/certificate",
    "/explorer",
    "/play/conversations/room/ABCD",
    "/open/x",
    "/review/x",
  ])("is left off %s", (p) => expect(backdropShownOn(p)).toBe(false));
  it("knows the topic player, where the background sits behind the card deck", () => {
    expect(["/topics/dementia-basics", "/topics/s/lf-recall", "/topics/follow-ups/12"].every(isPlayerPath)).toBe(true);
    expect(["/topics", "/paths/abc", "/topics/a/b"].some(isPlayerPath)).toBe(false);
  });
});

describe("comparing choices", () => {
  it("matches by what was chosen", () => {
    expect(sameBackground(pexels, { ...pexels, alt: "other" })).toBe(true);
    expect(sameBackground({ kind: "colour", id: "navy" }, { kind: "colour", id: "teal" })).toBe(false);
    expect(sameBackground({ kind: "none" }, { kind: "none" })).toBe(true);
  });
});
