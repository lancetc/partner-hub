import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { hidePost, likePost, postToWall, readWall } from "./walls";

/* Insight walls: answer first, then see what everyone else shared. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-23T04:00:00Z");
const wall = (who: string) => readWall(db, u(who), "legislative-framework", "share");

describe("insight walls", () => {
  it("keeps other people's posts hidden until you post", () => {
    const before = wall("sam");
    expect(before.total).toBe(3);
    expect(before.posts).toEqual([]);
    expect(before.mine).toBeNull();
    const after = postToWall(db, u("sam"), "legislative-framework", "share", "I ask what matters most to them today.", now);
    expect(after.mine?.text).toBe("I ask what matters most to them today.");
    expect(after.posts.map((p) => p.by)).toEqual(["Jordan · Trilogy Care", "Riley · Coordinator", "Ash · Gardening partner"]);
    expect(after.posts.every((p) => !p.mine)).toBe(true);
  });

  it("lets you edit your post rather than add another", () => {
    postToWall(db, u("sam"), "legislative-framework", "share", "First go.", now);
    const w = postToWall(db, u("sam"), "legislative-framework", "share", "Second go.", new Date(now.getTime() + 60000));
    expect(w.mine).toMatchObject({ text: "Second go.", edited: true });
    expect(w.total).toBe(4);
  });

  it("hides names on an anonymous wall", () => {
    const lesson = db.prepare("SELECT 1").get();
    expect(lesson).toBeTruthy();
    // The seeded wall shows names; turn it anonymous through a Claude-style draft copy.
    const card = { id: "share", type: "wall", beat: 0, label: "", heading: "", body: "", visual: { kind: "none" }, prompt: "Q", anonymous: true };
    db.prepare("INSERT INTO generated_lessons (slug, master_slug, stage, status, content, model, created_at, created_by) VALUES ('anon', 'x', 'x', 'approved', ?, 't', ?, 'jordan')").run(
      JSON.stringify({ slug: "anon", title: "A", start: "share", beats: ["A"], nodes: { share: card } }),
      now.toISOString(),
    );
    postToWall(db, u("ash"), "anon", "share", "An anonymous idea.", now);
    expect(postToWall(db, u("sam"), "anon", "share", "Mine.", now).posts.map((p) => p.by)).toEqual([null]);
  });

  it("only lets people who posted mark posts helpful, and never their own", () => {
    const jordans = wall("jordan").mine!.id;
    expect(() => likePost(db, u("sam"), jordans, true)).toThrow(/Post your own answer first/);
    postToWall(db, u("sam"), "legislative-framework", "share", "My idea.", now);
    expect(likePost(db, u("sam"), jordans, true).posts.find((p) => p.id === jordans)).toMatchObject({ liked: true, likes: 3 });
    expect(() => likePost(db, u("sam"), wall("sam").mine!.id, true)).toThrow(/your own post/);
  });

  it("lets authors and the poster's organisation admin hide posts", () => {
    const sams = postToWall(db, u("sam"), "legislative-framework", "share", "Something to hide.", now).mine!.id;
    const ashs = wall("ash").mine!.id;
    expect(() => hidePost(db, u("riley"), sams, now)).toThrow(/Only learning authors/);
    expect(() => hidePost(db, u("casey"), ashs, now)).toThrow(/Only learning authors/);
    hidePost(db, u("casey"), sams, now);
    expect(wall("ash").posts.map((p) => p.text)).not.toContain("Something to hide.");
    hidePost(db, u("jordan"), ashs, now);
    expect(wall("riley").total).toBe(2);
  });
});
