import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { blankLesson } from "@/content/blankLesson";
import { createLesson, editorLesson, publishLesson, saveDraft } from "./authoredLessons";
import { syncPublishedLessons } from "./lessonRegistry";
import { savedItems, search } from "./search";

/* Site search: everything live on the hub, including topics written in the editor and the words on their cards. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncPublishedLessons(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-10-29T01:00:00Z");

function writeTopic(title: string, cardText: string, publish = true) {
  const { slug } = createLesson(db, u("jordan"), { ...blankLesson(), title }, now);
  const l = editorLesson(db, slug)!.lesson;
  const first = l.nodes[l.start];
  saveDraft(db, u("jordan"), slug, { ...l, nodes: { ...l.nodes, [l.start]: { ...first, body: cardText } } }, now);
  if (publish) publishLesson(db, u("jordan"), slug, now);
  return slug;
}

describe("site search", () => {
  it("finds a topic written in the editor by the words on its cards, with a snippet", () => {
    const slug = writeTopic("Handling a heatwave", "Check the client has **water** and a cool room on hot days.");
    const [hit] = search(db, u("sam"), "cool room");
    expect(hit).toMatchObject({ id: `lesson:${slug}`, href: `/topics/${slug}`, title: "Handling a heatwave", meta: expect.stringMatching(/^Topic/) });
    // Formatting marks don't show in the snippet.
    expect(search(db, u("sam"), "water")[0].snippet).toMatch(/has water and a cool room/);
  });

  it("never searches drafts", () => {
    writeTopic("Secret draft topic", "Unpublished words about zebras.", false);
    expect(search(db, u("jordan"), "zebras")).toEqual([]);
  });

  it("puts title matches first and needs every word", () => {
    writeTopic("Falls at home", "What to do.");
    writeTopic("Getting started", "Most falls at home happen at night.");
    expect(search(db, u("sam"), "falls")[0].title).toBe("Falls at home");
    expect(search(db, u("sam"), "falls zebra")).toEqual([]);
  });

  it("finds learning paths, news and resources too", () => {
    expect(search(db, u("sam"), "care coordination").some((r) => r.id === "path:lp-care-coordination")).toBe(true);
    expect(search(db, u("sam"), "extra visit time").some((r) => r.id.startsWith("story:"))).toBe(true);
    expect(search(db, u("sam"), "   ")).toEqual([]);
  });

  it("looks up saved items by id, skipping any that are gone", () => {
    const slug = writeTopic("Handling a heatwave", "Water.");
    expect(savedItems(db, u("sam"), [`lesson:${slug}`, "lesson:nope"])).toEqual([
      { id: `lesson:${slug}`, href: `/topics/${slug}`, title: "Handling a heatwave", meta: expect.stringMatching(/^Topic/) },
    ]);
  });
});
