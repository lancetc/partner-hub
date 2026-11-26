import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { attachAvaVideo, avaForCourse, avaLines } from "./ava";
import { readGuideDoc } from "@/lib/magazine";

/* Ava's transmissions in a Magazine page's content (the "Ava video" block): kept, played, and listed like her other lines. */

let db: Db;
const now = new Date("2026-11-26T00:00:00Z");
const doc = {
  schema: 2,
  pages: [
    {
      id: "p1",
      title: "First visit",
      sections: [{ id: "s1", title: "Before you start", blocks: [{ id: "ava-1", type: "ava", title: "Why the first visit matters" }] }],
    },
  ],
};

beforeEach(() => {
  db = openDb(":memory:");
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO magazine_guides (id, slug, title, status, draft, draft_saved_at, revision_id, owner, created_at, updated_by, updated_at) VALUES ('mag-a', 'a', 'Induction', 'published', ?, ?, 'mag-a-r1', 'jordan', ?, 'jordan', ?)",
  ).run(JSON.stringify(doc), at, at, at);
  db.prepare(
    "INSERT INTO magazine_revisions (id, guide_id, number, title, standfirst, doc, completion, minutes, published_by, published_at) VALUES ('mag-a-r1', 'mag-a', 1, 'Induction', '', ?, 'confirm', 1, 'jordan', ?)",
  ).run(JSON.stringify(doc), at);
});

describe("the Ava video block", () => {
  it("survives being saved, with what it's about", () => {
    const read = readGuideDoc(doc);
    const block = read.pages[0].sections[0].blocks[0];
    expect(block).toEqual({ id: "ava-1", type: "ava", title: "Why the first visit matters" });
  });

  it("is one of Ava's lines in the admin list, and needs her words with an upload (it has no Audio guide script)", async () => {
    const author = userById(db, "jordan")!;
    // Only a real uploaded video goes in.
    await expect(attachAvaVideo(db, author, "magazine:mag-a:block:ava-1", "/api/uploads/00000000-0000-0000-0000-000000000000.mp4", now)).rejects.toThrow(
      /Upload the video/,
    );
    // Listed before it has one, so it can be found in AI Learning Guide too; a block's words come with its video.
    const { lines } = await avaLines(db, author);
    expect(lines.find((l) => l.key === "magazine:mag-a:block:ava-1")).toMatchObject({ state: "none", script: "" });
  });

  it("reaches learners with the course once it has a video with its words", async () => {
    db.prepare(
      "INSERT INTO ava_videos (key, script_hash, voice, portrait, status, video_src, created_by, created_at, transcript) VALUES (?, 'x', 'upload', '', 'completed', '/api/uploads/b.mp4', 'jordan', ?, ?)",
    ).run("magazine:mag-a:block:ava-1", now.toISOString(), "It's Ava. The first visit sets the tone.");
    const ava = await avaForCourse(db, "mag-a", ["p1"], ["ava-1"]);
    expect(ava.videos["magazine:mag-a:block:ava-1"]).toMatchObject({ src: "/api/uploads/b.mp4", transcript: "It's Ava. The first visit sets the tone." });
    // Without the block's id it isn't sent: only blocks on the course's pages are.
    expect((await avaForCourse(db, "mag-a", ["p1"])).videos["magazine:mag-a:block:ava-1"]).toBeUndefined();
    // Listed for authors, with the page it's on.
    const { lines } = await avaLines(db, userById(db, "jordan")!);
    expect(lines.find((l) => l.key === "magazine:mag-a:block:ava-1")).toMatchObject({ kind: "page", state: "ready" });
    expect(lines.find((l) => l.key === "magazine:mag-a:block:ava-1")?.title).toMatch(/page 1, in the content: Why the first visit matters/);
  });
});
