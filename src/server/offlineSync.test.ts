import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { storedResponse, storeResponse, validKey } from "./idempotency";
import { readProgress, saveProgress } from "./progress";

/* Offline sync on the server: resends answered once, and lesson progress where the newest copy wins. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const sam = () => userById(db, "sam")!;
const ash = () => userById(db, "ash")!;
const now = new Date("2026-10-26T04:00:00Z");
const attempt = (nodeId: string) => ({ version: "1", nodeId, route: [nodeId], answers: {}, status: "in_progress", startedAt: "x", previousRoutes: [] });

describe("resends from the offline outbox", () => {
  it("keeps the first answer for a key, per person", () => {
    const key = crypto.randomUUID();
    expect(validKey(key)).toBe(true);
    expect(validKey("short")).toBe(false);
    expect(validKey("has spaces in it")).toBe(false);
    expect(storedResponse(db, key, "sam")).toBeNull();
    storeResponse(db, key, "sam", 200, { completedAt: "first" }, now);
    storeResponse(db, key, "sam", 200, { completedAt: "second" }, now);
    expect(storedResponse(db, key, "sam")).toEqual({ status: 200, body: { completedAt: "first" } });
    // Another person's save with the same key is separate.
    expect(storedResponse(db, key, "ash")).toBeNull();
  });
});

describe("lesson progress across devices", () => {
  it("keeps the most recently saved copy", () => {
    expect(saveProgress(db, sam(), "legislative-framework", attempt("rights"), "2026-10-26T02:00:00Z")).toEqual({ kept: true });
    // An older copy arriving late (a phone that was offline) doesn't overwrite a newer one.
    expect(saveProgress(db, sam(), "legislative-framework", attempt("intro"), "2026-10-26T01:00:00Z")).toEqual({ kept: false });
    expect(saveProgress(db, sam(), "legislative-framework", attempt("code"), "2026-10-26T03:00:00Z")).toEqual({ kept: true });
    const p = readProgress(db, sam());
    expect((p["legislative-framework"].attempt as { nodeId: string }).nodeId).toBe("code");
    expect(readProgress(db, ash())).toEqual({});
  });

  it("checks what it's given", () => {
    expect(() => saveProgress(db, sam(), "../etc", attempt("a"), "2026-10-26T01:00:00Z")).toThrow(/Which lesson/);
    expect(() => saveProgress(db, sam(), "lesson", null, "2026-10-26T01:00:00Z")).toThrow(/progress/);
    expect(() => saveProgress(db, sam(), "lesson", attempt("a"), "not a date")).toThrow(/when it was saved/);
  });
});
