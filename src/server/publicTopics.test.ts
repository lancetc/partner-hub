import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { syncPublishedLessons } from "./lessonRegistry";
import { publicTopicLesson, publicTopicSlug, publicTopicToken, recordTopicEvent, topicLink } from "./publicTopics";
import { qrTarget } from "./qr";

/* A topic's QR code: one link, made when first asked for, that opens the topic without signing in. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const now = new Date("2026-11-13T01:00:00Z");
/** A topic from the content files. */
const SLUG = "a-little-extra-time";

describe("public topic links", () => {
  it("makes one link per topic, the first time it's asked for", () => {
    const token = topicLink(db, userById(db, "sam")!, SLUG, now);
    expect(token).toMatch(/^[\w-]{12}$/);
    expect(topicLink(db, userById(db, "ash")!, SLUG, now)).toBe(token);
    expect(publicTopicSlug(db, token)).toBe(SLUG);
    expect(publicTopicLesson(db, token)?.slug).toBe(SLUG);
    expect(publicTopicToken(db, SLUG)).toBe(token);
  });

  it("encodes the open address in the QR code", () => {
    const token = topicLink(db, userById(db, "sam")!, SLUG, now);
    expect(qrTarget(db, { kind: "openTopic", id: SLUG }).url).toMatch(new RegExp(`/open/topic/${token}$`));
  });

  it("refuses topics that don't exist, and links that don't", () => {
    expect(() => topicLink(db, userById(db, "sam")!, "no-such-topic", now)).toThrow(/not found/);
    expect(publicTopicSlug(db, "not-a-real-token")).toBeUndefined();
    expect(() => recordTopicEvent(db, "not-a-real-token", "opened", now)).toThrow(/isn’t active/);
  });

  it("counts opens and finishes anonymously, once each", () => {
    const token = topicLink(db, userById(db, "sam")!, SLUG, now);
    recordTopicEvent(db, token, "opened", now);
    recordTopicEvent(db, token, "topic", now);
    recordTopicEvent(db, token, "path", now);
    const rows = db.prepare("SELECT kind FROM public_topic_events WHERE token = ? ORDER BY kind").all(token) as { kind: string }[];
    expect(rows.map((r) => r.kind)).toEqual(["finished", "opened"]);
  });
});
