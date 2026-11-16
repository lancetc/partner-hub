import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/* Saved backgrounds: uploads are resized into two WebPs, replacing one removes the old files, and the built-in photos all check out. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backgrounds-"));
let db: import("./db").Db;
let mod: typeof import("./backgrounds");
let userById: typeof import("./auth").userById;

beforeAll(async () => {
  process.env.HUB_BACKGROUNDS_DIR = dir;
  delete process.env.PEXELS_API_KEY;
  mod = await import("./backgrounds");
  ({ userById } = await import("./auth"));
});
beforeEach(async () => {
  const { openDb } = await import("./db");
  db = openDb(":memory:");
});
const now = new Date("2026-11-16T01:00:00Z");
const photo = async (w: number, h: number) =>
  new File([new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#0e7c7b" } }).png().toBuffer())], "bg.png", { type: "image/png" });

describe("backgrounds", () => {
  it("starts on the default, and saves a colour", () => {
    const sam = userById(db, "sam")!;
    expect(mod.backgroundFor(db, "sam")).toEqual({ kind: "colour", id: "petals" });
    mod.setBackground(db, sam, { kind: "colour", id: "navy" }, now);
    expect(mod.backgroundFor(db, "sam")).toEqual({ kind: "colour", id: "navy" });
  });

  it("refuses a background that doesn't check out", () => {
    expect(() => mod.setBackground(db, userById(db, "sam")!, { kind: "colour", id: "violet" }, now)).toThrow(/colours/);
  });

  it("keeps an upload in two sizes, and removes its files when replaced", async () => {
    const sam = userById(db, "sam")!;
    const { background } = await mod.uploadBackground(db, sam, await photo(3200, 1800), now);
    if (background.kind !== "upload") throw new Error("expected an upload");
    expect([background.width, background.height]).toEqual([mod.LARGE_SIDE, 1440]);
    expect(background.color).toMatch(/^#[0-9a-f]{6}$/);
    const small = await sharp(mod.readBackground(background.file.replace(".webp", "-sm.webp"))!).metadata();
    expect([small.width, small.format]).toEqual([mod.SMALL_SIDE, "webp"]);

    mod.setBackground(db, sam, { kind: "none" }, now);
    expect(mod.readBackground(background.file)).toBeUndefined();
    expect(mod.backgroundFor(db, "sam")).toEqual({ kind: "none" });
  });

  it("refuses files that aren't photos, and never serves other files", async () => {
    const bad = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    await expect(mod.uploadBackground(db, userById(db, "sam")!, bad, now)).rejects.toThrow(/couldn’t be read/);
    expect(mod.readBackground("../hub.db")).toBeUndefined();
  });

  it("offers the built-in photos without a Pexels key, and every one passes the checks", async () => {
    const res = await mod.backgroundPhotos({ query: "", page: 1 });
    expect(res.configured).toBe(false);
    expect(res.photos.length).toBeGreaterThanOrEqual(8);
    for (const p of mod.CURATED_PHOTOS)
      expect(
        mod.fromPexels({ id: p.id, width: p.width, height: p.height, url: p.pageUrl, photographer: p.photographer, photographer_url: p.photographerUrl, avg_color: p.color, alt: p.alt, src: { original: p.src } }),
      ).toEqual(p);
    expect((await mod.backgroundPhotos({ query: "beach", page: 1 })).photos).toEqual([]);
  });
});
