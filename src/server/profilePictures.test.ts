import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/* Profile pictures: cropped square, replaceable (the old file goes), removable, and only our own files are served. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "avatars-"));
let db: import("./db").Db;
let mod: typeof import("./profilePictures");
let userById: typeof import("./auth").userById;

beforeAll(async () => {
  process.env.HUB_AVATARS_DIR = dir;
  mod = await import("./profilePictures");
  ({ userById } = await import("./auth"));
});
beforeEach(async () => {
  const { openDb } = await import("./db");
  db = openDb(":memory:");
});
const now = new Date("2026-11-13T01:00:00Z");
const photo = async (w: number, h: number) =>
  new File([new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: "#008282" } }).png().toBuffer())], "me.png", { type: "image/png" });

describe("profile pictures", () => {
  it("crops a picture square, and replacing it removes the old file", async () => {
    const sam = userById(db, "sam")!;
    const first = await mod.setPicture(db, sam, await photo(900, 600), now);
    const firstFile = first.avatar!.split("/").pop()!;
    const meta = await sharp(mod.readPicture(firstFile)!).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([mod.PICTURE_SIZE, mod.PICTURE_SIZE, "webp"]);

    const second = await mod.setPicture(db, userById(db, "sam")!, await photo(400, 700), now);
    expect(second.avatar).not.toBe(first.avatar);
    expect(mod.readPicture(firstFile)).toBeUndefined();
    expect(userById(db, "sam")!.avatar).toBe(second.avatar!.split("/").pop());
  });

  it("goes back to initials when removed", async () => {
    const ash = userById(db, "ash")!;
    const { avatar } = await mod.setPicture(db, ash, await photo(300, 300), now);
    expect(mod.removePicture(db, userById(db, "ash")!, now)).toEqual({ avatar: null });
    expect(userById(db, "ash")!.avatar).toBeNull();
    expect(mod.readPicture(avatar!.split("/").pop()!)).toBeUndefined();
  });

  it("refuses files that aren't pictures, and never serves other files", async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], "x.png", { type: "image/png" });
    await expect(mod.setPicture(db, userById(db, "sam")!, bad, now)).rejects.toThrow(/couldn’t be read/);
    expect(mod.readPicture("../hub.sqlite")).toBeUndefined();
    expect(mod.readPicture("notes.txt")).toBeUndefined();
  });
});
