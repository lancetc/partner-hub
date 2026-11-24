import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { openDb, type Db } from "./db";
import { userById } from "./auth";

/* Naming and describing pictures in the image library: a title for authors and alt text for screen readers. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hub-describe-"));
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
const now = new Date("2026-11-23T04:00:00Z");
const picture = async (colour: string) =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: colour } })
    .png()
    .toBuffer();
const item = (src: string) => up.listUploads(db, u("jordan")).find((x) => x.src === src)!;

describe("a picture's title and description", () => {
  it("starts from a tidied file name, and is empty (needs one) when the name says nothing", async () => {
    const named = await up.saveUpload(
      db,
      u("jordan"),
      new File([await picture("#0e7c7b")], "Gardener checking his phone.png"),
      { width: 640, height: 480 },
      now,
    );
    const random = await up.saveUpload(db, u("jordan"), new File([await picture("#102a43")], "1717741960635.png"), { width: 640, height: 480 }, now);
    expect(item(named.src)).toMatchObject({ title: "Gardener checking his phone", alt: "" });
    expect(item(random.src)).toMatchObject({ title: "", alt: "" });
  });

  it("keeps what whatever saved it knew: a character portrait, a Pexels photo", async () => {
    const saved = await up.saveUpload(
      db,
      u("jordan"),
      new File([await picture("#fab53d")], "AI OpenAI – Head-and-shoulders portrait.png"),
      { width: 640, height: 480 },
      now,
      undefined,
      {
        title: "Maya, character portrait",
        alt: "Portrait of Maya, a fictional character.",
      },
    );
    expect(item(saved.src)).toMatchObject({ title: "Maya, character portrait", alt: "Portrait of Maya, a fictional character." });
  });

  it("can be written by an author, not by anyone else, and is audited", async () => {
    const { src } = await up.saveUpload(db, u("jordan"), new File([await picture("#e3eefb")], "IMG_2041.png"), { width: 640, height: 480 }, now);
    const file = src.split("/").pop()!;
    expect(() => up.describeUpload(db, u("sam"), file, { title: "x", alt: "y" }, now)).toThrow(/authors/);
    const out = up.describeUpload(db, u("jordan"), file, { title: "  Dot at her kitchen table ", alt: "Dot smiles on the phone beside a vase of roses." }, now);
    expect(out).toMatchObject({ title: "Dot at her kitchen table", alt: "Dot smiles on the phone beside a vase of roses." });
    expect(item(src).alt).toBe("Dot smiles on the phone beside a vase of roses.");
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'upload.described'").get()).toMatchObject({ n: 1 });
    // Clearing the title falls back to the tidied file name (empty here: "IMG_2041" says nothing).
    up.describeUpload(db, u("jordan"), file, { title: "" }, now);
    expect(item(src)).toMatchObject({ title: "", alt: "Dot smiles on the phone beside a vase of roses." });
  });

  it("gives an identical upload the description it brings, without overwriting one already written", async () => {
    const bytes = await picture("#d32f2f");
    const first = await up.saveUpload(db, u("jordan"), new File([bytes], "a.png"), { width: 640, height: 480 }, now);
    up.describeUpload(db, u("jordan"), first.src.split("/").pop()!, { alt: "Written by an author." }, now);
    const again = await up.saveUpload(db, u("jordan"), new File([bytes], "b.png"), { width: 640, height: 480 }, now, undefined, {
      title: "Red square",
      alt: "Something else.",
    });
    expect(again.src).toBe(first.src);
    expect(item(first.src)).toMatchObject({ title: "Red square", alt: "Written by an author." });
  });
});
