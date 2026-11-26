import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { createGuide } from "./magazine";
import { featuredTags, setFeaturedTag } from "./magazineFeatured";

/* The Featured tag on Magazine and Discovery Path cards: any number, set straight away, by authors only. */

let db: Db;
const now = new Date("2026-11-26T00:00:00Z");
beforeEach(() => {
  db = openDb(":memory:");
});

describe("the Featured tag", () => {
  it("tags and untags courses, any number, kept apart from paths", () => {
    const author = userById(db, "jordan")!;
    const a = createGuide(db, author, { title: "One", template: "do" }, now);
    const b = createGuide(db, author, { title: "Two", template: "do" }, now);
    setFeaturedTag(db, author, a.id, true, now);
    setFeaturedTag(db, author, b.id, true, now);
    expect([...featuredTags(db)].sort()).toEqual([a.id, b.id].sort());
    setFeaturedTag(db, author, a.id, false, now);
    expect([...featuredTags(db)]).toEqual([b.id]);
    expect(featuredTags(db, "path").size).toBe(0);
  });

  it("tags a Discovery Path, refuses something that isn't there, and is for authors only", () => {
    const author = userById(db, "jordan")!;
    const path = db.prepare("SELECT id FROM learning_paths LIMIT 1").get() as { id: string } | undefined;
    if (path) {
      setFeaturedTag(db, author, path.id, true, now, "path");
      expect(featuredTags(db, "path").has(path.id)).toBe(true);
    }
    expect(() => setFeaturedTag(db, author, "nope", true, now, "path")).toThrow(/Path not found/);
    expect(() => setFeaturedTag(db, userById(db, "riley")!, "nope", true, now)).toThrow();
  });
});
