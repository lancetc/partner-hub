import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { archiveLearningPath, createLearningPath } from "./learningPaths";
import { editorLesson } from "./authoredLessons";
import { addReviewer, linkLesson, postReviewComment, reviewerById } from "./reviews";
import { linkPath, networkOrigins, pathReview, pathReviewSharing, requirePathLink, setPathReviewLink } from "./pathReviews";

/* Review links for a whole learning path: one address, and each topic opens through its own review link. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-02T02:00:00Z");
const topics = ["legislative-framework", "noticing-a-change"];
const newPath = (lessons = topics) => createLearningPath(db, u("jordan"), { name: "Review me", lessons }, now).id;
const tokenOf = (path: string) => path.split("/").pop()!;

describe("path review links", () => {
  it("only authors switch them on, and a path needs topics first", () => {
    const id = newPath();
    expect(() => setPathReviewLink(db, u("sam"), id, true, now)).toThrow(/authors/);
    const empty = createLearningPath(db, u("jordan"), { name: "Empty", lessons: [] }, now).id;
    expect(() => setPathReviewLink(db, u("jordan"), empty, true, now)).toThrow(/Add topics/);
  });

  it("switching on opens every topic for review, and keeps the same link when switched on again", () => {
    const id = newPath();
    const { link, topics: n } = setPathReviewLink(db, u("jordan"), id, true, now);
    expect(n).toBe(2);
    const token = tokenOf(link!.path);
    expect(linkPath(db, token)).toBe(id);
    expect(setPathReviewLink(db, u("jordan"), id, true, now).link!.path).toBe(link!.path);
    const review = pathReview(db, token);
    expect(review.topics.map((t) => t.slug)).toEqual(topics);
    for (const t of review.topics) {
      expect(t.href).toMatch(new RegExp(`^/review/[\\w-]+\\?path=${token}$`));
      expect(linkLesson(db, t.href!.split("/")[2].split("?")[0])).toBe(t.slug);
    }
  });

  it("a comment through a topic shows on the path page and in the editor's list of reviewers", () => {
    const id = newPath();
    const token = tokenOf(setPathReviewLink(db, u("jordan"), id, true, now).link!.path);
    const { id: rid } = addReviewer(db, { name: "Dr Pat Lee", email: "pat@example.org" }, now);
    const who = reviewerById(db, rid)!;
    const lesson = topics[0];
    const first = Object.keys(editorLesson(db, lesson)!.lesson.nodes)[0];
    postReviewComment(db, who, lesson, { card: first, text: "This card reads well." }, now);
    expect(pathReview(db, token).topics[0].comments).toBe(1);
    expect(pathReviewSharing(db, u("jordan"), id).reviewers).toEqual([{ name: "Dr Pat Lee", email: "pat@example.org", comments: 1 }]);
  });

  it("switching off stops the path link but leaves each topic's link on", () => {
    const id = newPath();
    const token = tokenOf(setPathReviewLink(db, u("jordan"), id, true, now).link!.path);
    const topicHref = pathReview(db, token).topics[0].href!;
    expect(setPathReviewLink(db, u("jordan"), id, false, now).link).toBeNull();
    expect(linkPath(db, token)).toBeUndefined();
    expect(() => requirePathLink(db, token)).toThrow(/isn’t active/);
    expect(linkLesson(db, topicHref.split("/")[2].split("?")[0])).toBe(topics[0]);
  });

  it("a deleted path's link stops working", () => {
    const id = newPath();
    const token = tokenOf(setPathReviewLink(db, u("jordan"), id, true, now).link!.path);
    archiveLearningPath(db, u("jordan"), id, now);
    expect(linkPath(db, token)).toBeUndefined();
  });

  it("offers network addresses only when the author is on localhost", () => {
    expect(networkOrigins("example.org")).toEqual([]);
    expect(networkOrigins(null)).toEqual([]);
    for (const o of networkOrigins("localhost:3000")) expect(o).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:3000$/);
  });
});
