import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

/* Pexels photos: found through the API, then copied into our uploads with the photographer's credit. */

process.env.HUB_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hub-pexels-"));
const { importPexels, jpegSize, searchPexels } = await import("./pexels");
const { listUploads } = await import("./uploads");

// A minimal JPEG: SOI, then a SOF0 frame header for 1600 x 1067.
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x2b, 0x06, 0x40, 0x03, 0, 0, 0, 0, 0, 0, 0, 0]);
const photo = {
  id: 42,
  width: 4800,
  height: 3200,
  url: "https://www.pexels.com/photo/a-garden-42/",
  photographer: "Ana Lee",
  photographer_url: "https://www.pexels.com/@analee",
  avg_color: "#6b7b5a",
  alt: "An older man watering a garden",
  src: { original: "https://images.pexels.com/photos/42/pexels-photo-42.jpeg", medium: "https://images.pexels.com/m.jpeg", large: "https://images.pexels.com/l.jpeg" },
};

let db: Db;
const fetches: string[] = [];
beforeEach(() => {
  db = openDb(":memory:");
  process.env.PEXELS_API_KEY = "test-key";
  fetches.length = 0;
  vi.stubGlobal("fetch", async (url: string | URL) => {
    const u = String(url);
    fetches.push(u);
    if (u.startsWith("https://api.pexels.com/v1/photos/42")) return Response.json(photo);
    if (u.startsWith("https://api.pexels.com/v1/search")) return Response.json({ photos: [photo], total_results: 1, next_page: "x" });
    if (u.startsWith("https://images.pexels.com/photos/42/")) return new Response(jpeg);
    return new Response("not found", { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());
const now = new Date("2026-10-26T01:00:00Z");

describe("Pexels", () => {
  it("reads a JPEG's size from its header", () => {
    expect(jpegSize(jpeg)).toEqual({ width: 1600, height: 1067 });
    expect(jpegSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("searches for authors only", async () => {
    const r = await searchPexels(userById(db, "jordan")!, { query: "gardening", page: 1, orientation: "landscape" });
    expect(r.photos[0]).toMatchObject({ id: 42, alt: photo.alt, credit: { name: "Ana Lee", source: "Pexels" } });
    expect(fetches[0]).toContain("orientation=landscape");
    await expect(searchPexels(userById(db, "sam")!, { query: "x", page: 1 })).rejects.toThrow();
  });

  it("copies a photo into the library at 1600px, keeping the credit", async () => {
    const r = await importPexels(db, userById(db, "jordan")!, 42, now);
    expect(r).toMatchObject({ width: 1600, height: 1067, alt: photo.alt, credit: { name: "Ana Lee", page: photo.url } });
    expect(fetches.find((u) => u.startsWith("https://images.pexels.com/"))).toContain("w=1600");
    expect(listUploads(db, userById(db, "jordan")!)[0].credit?.name).toBe("Ana Lee");
  });
});
