import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import sharp from "sharp";

/* Card images authors upload, and poll cards learners vote on. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-uploads-"));
let saveUpload: typeof import("./uploads").saveUpload;
let readUpload: typeof import("./uploads").readUpload;
let vote: typeof import("./polls").vote;
let pollResults: typeof import("./polls").pollResults;
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  ({ saveUpload, readUpload } = await import("./uploads"));
  ({ vote, pollResults } = await import("./polls"));
});

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-23T04:00:00Z");
// A real picture, so it can be compressed.
const picture = (w: number, h: number, format: "png" | "jpeg" = "png") =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#2d4875" } })
    [format]()
    .toBuffer();
const png = new File([await picture(800, 600)], "Mara at home.png", { type: "image/png" });

describe("image uploads", () => {
  it("stores an author's image under a new name and serves it back", async () => {
    const r = await saveUpload(db, u("jordan"), png, { width: 800, height: 600 }, now);
    // Stored as compressed WebP, whatever it was uploaded as.
    expect(r.src).toMatch(/^\/api\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(r.name).toBe("Mara at home.webp");
    expect(r).toMatchObject({ width: 800, height: 600 });
    const file = readUpload(db, r.src.split("/").pop()!);
    expect(file?.mime).toBe("image/webp");
  });

  it("shrinks big pictures to 2400px on their longest side, and keeps GIFs as they are", async () => {
    const big = new File([await picture(4000, 3000, "jpeg")], "Huge photo.jpg", { type: "image/jpeg" });
    const r = await saveUpload(db, u("jordan"), big, { width: 4000, height: 3000 }, now);
    expect(r).toMatchObject({ width: 2400, height: 1800 });
    const gifBytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: "#ffc72c" } })
      .gif()
      .toBuffer();
    const gif = await saveUpload(db, u("jordan"), new File([gifBytes], "wave.gif", { type: "image/gif" }), { width: 20, height: 10 }, now);
    expect(gif.src).toMatch(/\.gif$/);
    expect(gif.bytes).toBe(gifBytes.length);
  });

  it("checks the file itself, not its name", async () => {
    const fake = new File(["<script>alert(1)</script>"], "photo.png", { type: "image/png" });
    await expect(saveUpload(db, u("jordan"), fake, { width: 10, height: 10 }, now)).rejects.toThrow(/JPEG, PNG/);
  });

  it("accepts PDFs for Resources cards, by their contents", async () => {
    const pdf = new File([new TextEncoder().encode("%PDF-1.7\n1 0 obj\n")], "Toolkit.pdf", { type: "application/pdf" });
    const r = await saveUpload(db, u("jordan"), pdf, { width: 0, height: 0 }, now);
    expect(r.src).toMatch(/\.pdf$/);
    expect(r.bytes).toBeGreaterThan(0);
    expect(readUpload(db, r.src.split("/").pop()!)).toMatchObject({ mime: "application/pdf", name: "Toolkit.pdf" });
    const fake = new File(["<html>not a pdf</html>"], "x.pdf", { type: "application/pdf" });
    await expect(saveUpload(db, u("jordan"), fake, { width: 0, height: 0 }, now)).rejects.toThrow(/PDF/);
  });

  it("accepts recorded videos, by their contents", async () => {
    const webm = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])], "recording.webm", { type: "video/webm" });
    const mp4 = new File([new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])], "clip.mp4", { type: "video/mp4" });
    expect((await saveUpload(db, u("jordan"), webm, { width: 720, height: 720 }, now)).src).toMatch(/\.webm$/);
    expect((await saveUpload(db, u("jordan"), mp4, { width: 1280, height: 720 }, now)).src).toMatch(/\.mp4$/);
    const fake = new File(["not really a video file"], "x.mp4", { type: "video/mp4" });
    await expect(saveUpload(db, u("jordan"), fake, { width: 1, height: 1 }, now)).rejects.toThrow(/WebM, MP4/);
  });

  it("only lets authors upload, and never reads other paths", async () => {
    await expect(saveUpload(db, u("sam"), png, { width: 1, height: 1 }, now)).rejects.toThrow(/learning authors/);
    expect(readUpload(db, "../hub.sqlite")).toBeNull();
  });
});

describe("polls", () => {
  beforeEach(() => {
    // A Claude-drafted lesson stands in for an authored one with a poll card.
    const lesson = {
      slug: "poll-demo",
      title: "Poll demo",
      start: "p",
      beats: ["Poll"],
      nodes: {
        p: {
          id: "p",
          beat: 0,
          type: "poll",
          label: "",
          heading: "",
          body: "",
          visual: { kind: "none" },
          prompt: "Which visit is busiest?",
          options: [
            { id: "a", label: "Morning" },
            { id: "b", label: "Afternoon" },
          ],
        },
      },
    };
    db.prepare(
      "INSERT INTO generated_lessons (slug, master_slug, stage, status, content, model, created_at, created_by) VALUES ('poll-demo', 'x', 'x', 'approved', ?, 'test', ?, 'jordan')",
    ).run(JSON.stringify(lesson), now.toISOString());
  });

  it("counts one vote per person, and lets them change it", () => {
    vote(db, u("sam"), "poll-demo", "p", "a", now);
    vote(db, u("ash"), "poll-demo", "p", "a", now);
    expect(vote(db, u("sam"), "poll-demo", "p", "b", now)).toEqual({ counts: { a: 1, b: 1 }, total: 2, mine: "b" });
    expect(pollResults(db, u("riley"), "poll-demo", "p").mine).toBeNull();
  });

  it("rejects options and cards that aren't in the poll", () => {
    expect(() => vote(db, u("sam"), "poll-demo", "p", "z", now)).toThrow(/options/);
    expect(() => vote(db, u("sam"), "legislative-framework", "intro", "a", now)).toThrow(/Poll not found/);
  });
});

describe("confidence ratings", () => {
  let rate: typeof import("./ratings").rate;
  let ratingResults: typeof import("./ratings").ratingResults;
  beforeAll(async () => {
    ({ rate, ratingResults } = await import("./ratings"));
  });
  const card = ["legislative-framework", "confidence"] as const;

  it("keeps everyone's ratings hidden until you've rated", () => {
    rate(db, u("sam"), ...card, 4, now);
    expect(ratingResults(db, u("ash"), ...card)).toEqual({ mine: null, results: null });
    const r = rate(db, u("ash"), ...card, 2, now);
    expect(r.mine).toBe(2);
    expect(r.results).toEqual({ average: 3, total: 2, counts: [0, 1, 0, 1, 0] });
  });

  it("lets people change their rating, and only takes 1 to 5 stars", () => {
    rate(db, u("sam"), ...card, 1, now);
    expect(rate(db, u("sam"), ...card, 5, now).results).toEqual({ average: 5, total: 1, counts: [0, 0, 0, 0, 1] });
    expect(() => rate(db, u("sam"), ...card, 6, now)).toThrow(/one to five/);
    expect(() => rate(db, u("sam"), "legislative-framework", "share", 3, now)).toThrow(/not found/);
  });
});
