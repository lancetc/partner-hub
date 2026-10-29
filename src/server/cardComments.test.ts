import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { lessons } from "@/content/lessons";
import { deleteComment, hideComment, pinComment, postComment, readComments } from "./cardComments";

/* Comments on lesson cards: tips and questions, with pinning and moderation. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-26T04:00:00Z");
const card = ["legislative-framework", "kit"] as const;

describe("card comments", () => {
  it("shows the demo comments with the pinned tip first", () => {
    const { comments } = readComments(db, u("sam"), ...card);
    expect(comments.length).toBe(3);
    expect(comments[0]).toMatchObject({ pinned: true, by: { name: "Casey", what: "Partner manager" } });
    expect(comments.find((c) => c.by.name === "Riley")?.by.what).toBe("Coordinator");
  });

  it("lets learners post and delete their own, but not others'", () => {
    const after = postComment(db, u("sam"), ...card, "On the older Model B machines, double-check the red valve too.", now);
    const mine = after.comments.find((c) => c.mine)!;
    expect(mine.by).toMatchObject({ name: "Sam", what: "Cleaning partner", staff: false });
    expect(() => deleteComment(db, u("ash"), mine.id, now)).toThrow(/your own/);
    expect(deleteComment(db, u("sam"), mine.id, now).comments.some((c) => c.mine)).toBe(false);
  });

  it("is on for every card unless an author turns it off, and checks length", () => {
    // On by default.
    expect(postComment(db, u("sam"), "legislative-framework", "check", "A question about this card", now)).toBeTruthy();
    const check = lessons.find((l) => l.slug === "legislative-framework")!.nodes.check;
    check.comments = false;
    try {
      expect(() => postComment(db, u("sam"), "legislative-framework", "check", "Another question about this card", now)).toThrow(/aren’t turned on/);
    } finally {
      delete check.comments;
    }
    expect(() => postComment(db, u("sam"), ...card, "ok", now)).toThrow(/few words/);
    expect(() => postComment(db, u("sam"), ...card, "x".repeat(601), now)).toThrow(/under 600/);
  });

  it("lets authors pin and hide anything, and organisation admins only their own people", () => {
    const ash = readComments(db, u("jordan"), ...card).comments.find((c) => c.by.name === "Ash")!;
    // The newest pin comes first; pin after the seeded one, whatever today's clock says.
    const later = new Date(Date.now() + 3600_000);
    expect(pinComment(db, u("jordan"), ash.id, true, later).comments[0].id).toBe(ash.id);
    // Casey manages Taylor Cleaning; Ash works for Greenway Gardens.
    expect(() => hideComment(db, u("casey"), ash.id, now)).toThrow(/Only learning authors/);
    const sam = postComment(db, u("sam"), ...card, "Taylor Cleaning tip for the team.", now).comments.find((c) => c.mine)!;
    expect(hideComment(db, u("casey"), sam.id, now).comments.some((c) => c.id === sam.id)).toBe(false);
    expect(() => pinComment(db, u("sam"), ash.id, true, now)).toThrow(/Only learning authors/);
  });

  it("limits how fast one person can post", () => {
    // Sam has no demo comments, so the count starts from nothing whatever the real date is.
    for (let i = 0; i < 15; i++) postComment(db, u("sam"), ...card, `Tip number ${i}`, now);
    expect(() => postComment(db, u("sam"), ...card, "One more tip", now)).toThrow(/a lot of comments/);
  });
});
