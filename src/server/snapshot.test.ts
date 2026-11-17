import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { restoreDatabase, snapshotFile } from "./snapshot";

/* The online demo's starting content: a new database from the snapshot, and its pictures and uploads. */

const snap = fs.mkdtempSync(path.join(os.tmpdir(), "hub-snapshot-"));
fs.mkdirSync(path.join(snap, "avatars"));
fs.mkdirSync(path.join(snap, "uploads"));
fs.writeFileSync(path.join(snap, "hub.sqlite"), "snapshot database");
fs.writeFileSync(path.join(snap, "avatars", "jordan.webp"), "picture");
fs.writeFileSync(path.join(snap, "uploads", "card.webp"), "upload");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "hub-work-"));

afterEach(() => {
  delete process.env.HUB_SNAPSHOT;
  delete process.env.HUB_SNAPSHOT_DIR;
});

describe("the online demo's snapshot", () => {
  it("does nothing unless switched on, so this computer and the tests keep their own data", () => {
    process.env.HUB_SNAPSHOT_DIR = snap;
    const file = path.join(work, "off", "hub.sqlite");
    restoreDatabase(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(snapshotFile("avatars", "jordan.webp")).toBeUndefined();
  });

  it("starts a new database from the snapshot, and never replaces one that exists", () => {
    process.env.HUB_SNAPSHOT = "on";
    process.env.HUB_SNAPSHOT_DIR = snap;
    const file = path.join(work, "on", "hub.sqlite");
    restoreDatabase(file);
    expect(fs.readFileSync(file, "utf8")).toBe("snapshot database");
    fs.writeFileSync(file, "changed since");
    restoreDatabase(file);
    expect(fs.readFileSync(file, "utf8")).toBe("changed since");
  });

  it("serves pictures and uploads from the snapshot, and nothing outside its folders", () => {
    process.env.HUB_SNAPSHOT = "on";
    process.env.HUB_SNAPSHOT_DIR = snap;
    expect(snapshotFile("avatars", "jordan.webp")?.toString()).toBe("picture");
    expect(snapshotFile("uploads", "card.webp")?.toString()).toBe("upload");
    expect(snapshotFile("uploads", "missing.webp")).toBeUndefined();
    expect(snapshotFile("uploads", "../hub.sqlite")).toBeUndefined();
  });
});
