import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { archiveLearningPath, createLearningPath } from "./learningPaths";
import { publicPath, publicPathId, publicSharing, publicToken, publicTopic, recordPublicEvent, setPublicLink } from "./publicPaths";
import { publicOrigin, qrTarget } from "./qr";

/* Public learning paths: one link anyone can open without signing in, with anonymous counts only. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-05T02:00:00Z");
const topics = ["legislative-framework", "noticing-a-change"];
const newPath = (lessons = topics) => createLearningPath(db, u("jordan"), { name: "Aged care for clients", lessons }, now).id;
const tokenOf = (path: string) => path.split("/").pop()!;

describe("public learning paths", () => {
  it("only authors make a path public, and it needs a published topic", () => {
    const id = newPath();
    expect(() => setPublicLink(db, u("sam"), id, true, now)).toThrow(/authors/);
    const empty = createLearningPath(db, u("jordan"), { name: "Empty", lessons: [] }, now).id;
    expect(() => setPublicLink(db, u("jordan"), empty, true, now)).toThrow(/Publish at least one/);
  });

  it("opens the path's published topics by its link, and keeps the same link when switched on again", () => {
    const id = newPath();
    const { link } = setPublicLink(db, u("jordan"), id, true, now);
    expect(link!.path).toMatch(/^\/open\/[\w-]{12}$/);
    const token = tokenOf(link!.path);
    expect(publicPathId(db, token)).toBe(id);
    expect(setPublicLink(db, u("jordan"), id, true, now).link!.path).toBe(link!.path);
    const p = publicPath(db, token);
    expect(p.name).toBe("Aged care for clients");
    expect(p.topics.map((t) => t.slug)).toEqual(topics);
    expect(publicTopic(db, token, topics[0])?.slug).toBe(topics[0]);
    // A topic outside the path doesn't open through its link.
    expect(publicTopic(db, token, "partner-onboarding-basics")).toBeUndefined();
  });

  it("counts opens and completions anonymously, and only for topics in the path", () => {
    const id = newPath();
    const token = tokenOf(setPublicLink(db, u("jordan"), id, true, now).link!.path);
    recordPublicEvent(db, token, "opened", undefined, now);
    recordPublicEvent(db, token, "opened", undefined, now);
    recordPublicEvent(db, token, "topic", topics[0], now);
    recordPublicEvent(db, token, "topic", topics[1], now);
    recordPublicEvent(db, token, "path", undefined, now);
    expect(() => recordPublicEvent(db, token, "topic", "partner-onboarding-basics", now)).toThrow(/isn’t part/);
    expect(() => recordPublicEvent(db, token, "signed-up", undefined, now)).toThrow(/Unknown/);
    const s = publicSharing(db, u("jordan"), id);
    expect(s.stats).toEqual({ opened: 2, completed: 1, lastCompletedAt: now.toISOString() });
    expect(s.topics.map((t) => t.completed)).toEqual([1, 1]);
    // Nothing is recorded against anyone: no completions for the default demo person.
    expect(db.prepare("SELECT COUNT(*) AS n FROM lesson_completions").get()).toEqual({ n: 0 });
  });

  it("making it private stops the link and its QR code, keeps the counts, and a new link comes next time", () => {
    const id = newPath();
    const token = tokenOf(setPublicLink(db, u("jordan"), id, true, now).link!.path);
    expect(qrTarget(db, { kind: "open", id }).url).toMatch(new RegExp(`/open/${token}$`));
    recordPublicEvent(db, token, "opened", undefined, now);
    const off = setPublicLink(db, u("jordan"), id, false, now);
    expect(off.link).toBeNull();
    expect(off.stats?.opened).toBe(1);
    expect(publicPathId(db, token)).toBeUndefined();
    expect(() => recordPublicEvent(db, token, "opened", undefined, now)).toThrow(/isn’t active/);
    expect(() => publicToken(db, id)).toThrow(/isn’t public/);
    const again = tokenOf(setPublicLink(db, u("jordan"), id, true, now).link!.path);
    expect(again).not.toBe(token);
  });

  it("an archived path's link stops working", () => {
    const id = newPath();
    const token = tokenOf(setPublicLink(db, u("jordan"), id, true, now).link!.path);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(publicPathId(db, token)).toBeUndefined();
  });

  it("while the hub runs on this computer, the QR code uses the network address the author is on", () => {
    if (process.env.HUB_PUBLIC_URL) return;
    expect(publicOrigin("172.16.3.65:3000")).toBe("http://172.16.3.65:3000");
    // Only a plain network address is taken from the request, never a name it could be pointed at.
    expect(publicOrigin("example.com")).not.toContain("example.com");
    expect(publicOrigin("localhost:3000")).not.toContain("localhost:3000/");
  });

  it("rejects malformed tokens without a lookup", () => {
    expect(publicPathId(db, "x")).toBeUndefined();
    expect(publicPathId(db, "../../etc/passwd")).toBeUndefined();
  });
});
