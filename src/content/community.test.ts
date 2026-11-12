import { describe, expect, it } from "vitest";
import { ago, avatarColour, events, initials, levelFor, memberById, members, posts, sortPosts, spaces } from "./community";

describe("community demo content", () => {
  it("has an author and a real space for every post and comment", () => {
    const spaceIds = new Set(spaces.map((s) => s.id));
    for (const p of posts) {
      expect(spaceIds.has(p.space)).toBe(true);
      expect(memberById(p.authorId)).toBeDefined();
      for (const c of p.comments) expect(memberById(c.authorId)).toBeDefined();
    }
    for (const e of events) expect(memberById(e.host)).toBeDefined();
  });

  it("uses unique ids", () => {
    const ids = [...posts.map((p) => p.id), ...posts.flatMap((p) => p.comments.map((c) => c.id))];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(members.map((m) => m.id)).size).toBe(members.length);
  });
});

describe("levels", () => {
  it("starts at level 1 and counts up to the next level", () => {
    expect(levelFor(0)).toEqual({ level: 1, next: 5, toNext: 5 });
    expect(levelFor(5).level).toBe(2);
    expect(levelFor(160)).toEqual({ level: 5, next: 515, toNext: 355 });
  });

  it("stops at the top level", () => {
    expect(levelFor(1_000_000)).toEqual({ level: 9, next: null, toNext: 0 });
  });
});

describe("feed helpers", () => {
  it("says how long ago, briefly", () => {
    expect(ago(0)).toBe("Just now");
    expect(ago(0.5)).toBe("30m");
    expect(ago(3)).toBe("3h");
    expect(ago(50)).toBe("2d");
    expect(ago(24 * 21)).toBe("3w");
  });

  it("makes initials and a steady avatar colour", () => {
    expect(initials("Priya Raman")).toBe("PR");
    expect(initials("Jess  Van Nguyen")).toBe("JV");
    expect(avatarColour("priya")).toBe(avatarColour("priya"));
  });

  it("keeps pinned posts first, then sorts by newest or by engagement", () => {
    const latest = sortPosts(posts, "latest");
    expect(latest[0].pinned).toBe(true);
    const rest = latest.slice(1);
    for (let i = 1; i < rest.length; i++) expect(rest[i].hoursAgo).toBeGreaterThanOrEqual(rest[i - 1].hoursAgo);
    const top = sortPosts(posts, "top");
    expect(top[0].pinned).toBe(true);
    // A busy post from today beats a quiet one from days ago.
    expect(top.findIndex((p) => p.id === "letterbox")).toBeLessThan(top.findIndex((p) => p.id === "thanks-nick"));
  });
});
