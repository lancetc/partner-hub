import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import sharp from "sharp";
import { editorLesson, publishLesson, saveDraft } from "./authoredLessons";
import { lessonBySlug } from "@/content/lessons";

/* Deleting images from the library: hidden there, kept for cards that still use them, and undoable. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-uploads-"));
let up: typeof import("./uploads");
beforeAll(async () => {
  process.env.HUB_UPLOADS_DIR = dir;
  up = await import("./uploads");
});

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-28T04:00:00Z");
const pngBytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#0e7c7b" } })
  .png()
  .toBuffer();
const png = () => new File([pngBytes], "Kitchen.png", { type: "image/png" });

describe("deleting library images", () => {
  it("hides the image from the library but keeps serving it, and can be undone", async () => {
    const { src } = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    const name = src.split("/").pop()!;
    expect(up.listUploads(db, u("jordan")).map((x) => x.src)).toContain(src);
    expect(() => up.deleteUpload(db, u("sam"), name, now)).toThrow(/authors/);
    up.deleteUpload(db, u("jordan"), name, now);
    expect(up.listUploads(db, u("jordan")).map((x) => x.src)).not.toContain(src);
    // Cards still using it keep working.
    expect(up.readUpload(db, name)?.mime).toBe("image/webp");
    up.restoreUpload(db, u("jordan"), name, now);
    expect(up.listUploads(db, u("jordan")).map((x) => x.src)).toContain(src);
  });

  it("says which lessons use the image", async () => {
    const { src, width, height } = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    const name = src.split("/").pop()!;
    expect(up.uploadUsage(db, u("jordan"), name).lessons).toEqual([]);
    const draft = editorLesson(db, "legislative-framework")!.lesson;
    draft.visual.photo = { src, width, height };
    saveDraft(db, u("jordan"), "legislative-framework", draft, now);
    expect(up.uploadUsage(db, u("jordan"), name).lessons).toEqual([{ slug: "legislative-framework", title: draft.title }]);
  });

  it("lists deleted images so they can be restored", async () => {
    const { src } = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    up.deleteUpload(db, u("jordan"), src.split("/").pop()!, now);
    expect(up.deletedUploads(db, u("jordan")).map((x) => x.src)).toEqual([src]);
  });

  it("hides built-in pictures from the library and brings them back", () => {
    expect(up.hiddenBuiltIns(db)).toEqual([]);
    expect(() => up.hideBuiltIn(db, u("sam"), "/images/cleaner.jpg", true, now)).toThrow(/authors/);
    expect(() => up.hideBuiltIn(db, u("jordan"), "/etc/passwd", true, now)).toThrow(/built-in/);
    up.hideBuiltIn(db, u("jordan"), "/images/cleaner.jpg", true, now);
    up.hideBuiltIn(db, u("jordan"), "/images/cleaner.jpg", true, now);
    expect(up.hiddenBuiltIns(db)).toEqual(["/images/cleaner.jpg"]);
    expect(up.hideBuiltIn(db, u("jordan"), "/images/cleaner.jpg", false, now).hiddenBuiltIns).toEqual([]);
  });

  it("finds built-in pictures used by lessons nobody has edited yet", () => {
    expect(up.builtInUsage(db, u("jordan"), "/images/cleaner.jpg").lessons.length).toBeGreaterThan(0);
  });

  it("refuses names it didn't make", () => {
    expect(() => up.deleteUpload(db, u("jordan"), "../hub.sqlite", now)).toThrow(/isn’t in the library/);
  });
});

describe("pictures converted to WebP", () => {
  it("serves the new file at the old address", async () => {
    const old = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    const replacement = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    const oldName = old.src.split("/").pop()!;
    const newName = replacement.src.split("/").pop()!;
    fs.rmSync(path.join(dir, oldName));
    db.prepare("UPDATE uploads SET replaced_by = ? WHERE filename = ?").run(newName, oldName);
    expect(up.readUpload(db, oldName)?.body.equals(up.readUpload(db, newName)!.body)).toBe(true);
  });
});

describe("replacing a picture", () => {
  it("swaps it everywhere it's used, live lessons included, and keeps the old address working", async () => {
    const old = await up.saveUpload(db, u("jordan"), png(), { width: 800, height: 600 }, now);
    const draft = editorLesson(db, "legislative-framework")!.lesson;
    draft.visual.photo = { src: old.src, width: old.width, height: old.height, position: "center 30%" };
    saveDraft(db, u("jordan"), "legislative-framework", draft, now);
    publishLesson(db, u("jordan"), "legislative-framework", now);
    db.prepare("INSERT INTO settings (key, value) VALUES ('avatar_presenter', ?)").run(JSON.stringify({ src: old.src, width: 800, height: 600 }));

    const wide = await sharp({ create: { width: 1200, height: 400, channels: 3, background: "#ffc72c" } })
      .png()
      .toBuffer();
    const oldName = old.src.split("/").pop()!;
    await expect(up.replaceUpload(db, u("sam"), oldName, new File([wide], "x.png", { type: "image/png" }), { width: 1200, height: 400 }, now)).rejects.toThrow(
      /authors/,
    );
    const r = await up.replaceUpload(db, u("jordan"), oldName, new File([wide], "Wider.png", { type: "image/png" }), { width: 1200, height: 400 }, now);
    expect(r).toMatchObject({ width: 1200, height: 400, lessons: [draft.title] });

    // The draft and the live lesson both use the new picture, with its size, and keep their position.
    expect(editorLesson(db, "legislative-framework")!.lesson.visual.photo).toEqual({ src: r.src, width: 1200, height: 400, position: "center 30%" });
    expect(lessonBySlug("legislative-framework")?.visual.photo?.src).toBe(r.src);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'avatar_presenter'").get()).toMatchObject({ value: expect.stringContaining(r.src) });
    // The old address shows the new picture; the library lists only the new one.
    expect(up.readUpload(db, oldName)?.body.equals(up.readUpload(db, r.src.split("/").pop()!)!.body)).toBe(true);
    const listed = up.listUploads(db, u("jordan")).map((x) => x.src);
    expect(listed).toContain(r.src);
    expect(listed).not.toContain(old.src);
  });
});
