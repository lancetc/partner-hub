import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

/* The same picture is kept once: uploading it again reuses it, and existing copies can be merged. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-uploads-dup-"));
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
const now = new Date("2026-10-30T04:00:00Z");
const picture = async (colour: string) => {
  const bytes = await sharp({ create: { width: 640, height: 400, channels: 3, background: colour } })
    .png()
    .toBuffer();
  return (name: string) => new File([bytes], name, { type: "image/png" });
};

describe("duplicate pictures", () => {
  it("reuses the library copy when the same picture is uploaded again, even under another name", async () => {
    const teal = await picture("#0e7c7b");
    const first = await up.saveUpload(db, u("jordan"), teal("lock.png"), { width: 640, height: 400 }, now);
    const again = await up.saveUpload(db, u("jordan"), teal("lock copy.png"), { width: 640, height: 400 }, now);
    expect(again.src).toBe(first.src);
    expect(up.listUploads(db, u("jordan")).filter((x) => x.src === first.src)).toHaveLength(1);
    const navy = await picture("#2d4875");
    const other = await up.saveUpload(db, u("jordan"), navy("lock.png"), { width: 640, height: 400 }, now);
    expect(other.src).not.toBe(first.src);
  });

  it("merges copies already in the library, points every use at the one kept, and keeps old addresses working", async () => {
    const teal = await picture("#0e7c7b");
    const a = await up.saveUpload(db, u("jordan"), teal("coffee.png"), { width: 640, height: 400 }, now);
    // An older copy added before uploads were checked: the same file under a new name.
    const aFile = a.src.split("/").pop()!;
    const bFile = "11111111-1111-4111-8111-111111111111.webp";
    fs.copyFileSync(path.join(dir, aFile), path.join(dir, bFile));
    const row = db.prepare("SELECT * FROM uploads WHERE filename = ?").get(aFile) as Record<string, unknown>;
    db.prepare(
      "INSERT INTO uploads (filename, original_name, mime, bytes, width, height, uploaded_by, uploaded_at, credit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      bFile,
      "coffee.webp",
      row.mime as string,
      row.bytes as number,
      row.width as number,
      row.height as number,
      "jordan",
      "2026-10-31T00:00:00Z",
      JSON.stringify({ name: "A photographer", url: "https://example.com", source: "Pexels" }),
    );
    const bSrc = `/api/uploads/${bFile}`;
    // A record outside the topics names the newer copy.
    db.prepare("INSERT INTO settings (key, value) VALUES ('test_picture', ?)").run(JSON.stringify({ src: bSrc }));

    expect(() => up.mergeDuplicateUploads(db, u("sam"), now)).toThrow(/authors/);
    const r = up.mergeDuplicateUploads(db, u("jordan"), now);
    expect(r).toMatchObject({ pictures: 1, removed: 1 });
    // Neither copy is in a topic, so the oldest is kept. The other leaves the library, but its address still shows the picture.
    expect(up.listUploads(db, u("jordan")).map((x) => x.src)).toEqual([a.src]);
    expect(up.readUpload(db, bFile)?.mime).toBe("image/webp");
    // The record that named the newer copy now names the one kept, and the stock credit came with it.
    expect((db.prepare("SELECT value FROM settings WHERE key = 'test_picture'").get() as { value: string }).value).toContain(aFile);
    expect(up.listUploads(db, u("jordan"))[0].credit?.source).toBe("Pexels");
    // Nothing left to merge.
    expect(up.mergeDuplicateUploads(db, u("jordan"), now)).toMatchObject({ pictures: 0, removed: 0 });
  });
});
