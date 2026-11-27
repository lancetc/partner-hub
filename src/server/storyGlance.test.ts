import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  "At a glance" and "Put it into practice" on news stories (server/storyGlance, lib/storyGlance), with Claude's replies
  mocked (no call to Claude or anyone else): a takeaway whose supporting words aren't in the story is refused, links go
  only to Hub pages, a summary is flagged once the story changes, proposals for published stories arrive switched off
  without moving the story's edition date, and each reader's ticks are their own.
*/

const replies: unknown[] = [];
const refused: string[][] = [];
vi.mock("./claudeJson", () => ({
  askForJson: async (_content: unknown, check: (v: unknown) => string[]) => {
    while (replies.length) {
      const value = replies.shift();
      const issues = check(value);
      if (!issues.length) return { value, usage: { mocked: true } };
      refused.push(issues);
    }
    throw new Error("No acceptable mocked reply.");
  },
}));

import { openDb, type Db } from "./db";
import { userById } from "./auth";
import { syncStories } from "./storyRegistry";
import { adminStories, saveStory, setStoryStatus, validateStory } from "./stories";
import { draftGlance, practiceTicks, proposeForPublished, tickPractice } from "./storyGlance";
import { stories, type Story } from "@/content/stories";
import { glanceScript, needsReview, storyBasis } from "@/lib/storyGlance";
import { textHash } from "@/lib/magazineNarration";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncStories(db);
  replies.length = 0;
  refused.length = 0;
  vi.stubEnv("ANTHROPIC_API_KEY", "test-not-used");
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-27T00:30:00Z");

const draft = (over: Partial<Story> = {}): Partial<Story> => ({
  title: "Christmas visits",
  dek: "Christmas can be a lonely time for some clients.",
  category: "case-study",
  date: "2026-11-20T00:00:00Z",
  audience: ["coordinator"],
  visual: { variant: "petals", tone: "teal", icon: "heart", alt: "" },
  body: [
    { type: "p", text: "Families travel and regular services pause over the break, so a coordinator in Ballarat called every client in early December." },
    { type: "p", text: "She booked extra social support visits for the six clients who would be alone on Christmas Day." },
  ],
  ...over,
});
const points = [
  { title: "Services pause", text: "Services pause and families travel over Christmas.", from: "Families travel and regular services pause over the break" },
  {
    title: "Calls in early December",
    text: "A coordinator called every client in early December.",
    from: "a coordinator in Ballarat called every client in early December",
  },
  {
    title: "Extra visits for six",
    text: "Six clients alone on Christmas Day got extra visits.",
    from: "booked extra social support visits for the six clients",
  },
];

describe("drafting from the story alone", () => {
  it("refuses a takeaway whose supporting words aren't in the story, and links that aren't Hub pages", async () => {
    replies.push(
      { points: [...points.slice(0, 2), { text: "Funding rises by 5% in January.", from: "funding rises by 5% in January" }], actions: [] },
      { points, actions: [{ text: "Call your clients early.", href: "https://example.com" }] },
      { points, actions: [{ text: "Call clients who may be alone before the break.", href: "" }] },
    );
    const r = await draftGlance(db, u("jordan"), { story: draft(), what: "both" }, now);
    expect(refused[0].join(" ")).toMatch(/isn't in it/);
    expect(refused[1].join(" ")).toMatch(/isn't one of the pages listed/);
    expect(r.points?.map((p) => p.text)).toEqual(points.map((p) => p.text));
    expect(r.actions).toEqual([{ id: "a1", text: "Call clients who may be alone before the break." }]);
    expect(r.basis).toBe(storyBasis(validateStory(draft())));
  });

  it("is for authors only", async () => {
    await expect(draftGlance(db, u("sam"), { story: draft() }, now)).rejects.toThrow(/learning authors/);
  });
});

describe("saving and checking", () => {
  it("keeps the summary with the story, needs three takeaways to turn on, and approves audio only of these words", () => {
    const basis = storyBasis(validateStory(draft()));
    expect(() => validateStory(draft({ glance: { enabled: true, points: points.slice(0, 2), basis } }))).toThrow(/at least 3/);
    const audio = { src: "/api/uploads/x.mp3", seconds: 12, words: null, scriptHash: textHash(glanceScript(points)), voice: "profile:editorial", at: "" };
    const s = validateStory(draft({ glance: { enabled: true, points, basis, audio, audioApproved: true } }));
    expect(s.glance?.audioApproved).toBe(true);
    const edited = validateStory(
      draft({ glance: { enabled: true, points: [...points.slice(0, 2), { text: "Changed." }], basis, audio, audioApproved: true } }),
    );
    expect(edited.glance?.audioApproved).toBeUndefined();
  });

  it("keeps actions' links on the Hub", () => {
    const s = validateStory(
      draft({
        practice: {
          enabled: true,
          checklist: true,
          basis: "",
          items: [
            { id: "a1", text: "Open the topic.", href: "/topics/christmas", label: "Christmas" },
            { id: "a1", text: "Read this.", href: "https://elsewhere.example", label: "Elsewhere" },
            { id: "a3", text: "Sneaky.", href: "//evil.example" },
          ],
        },
      }),
    );
    expect(s.practice?.items).toEqual([
      { id: "a1", text: "Open the topic.", href: "/topics/christmas", label: "Christmas" },
      { id: "a1x", text: "Read this." },
      { id: "a3", text: "Sneaky." },
    ]);
  });

  it("flags the summary for another look once the story changes", () => {
    const basis = storyBasis(validateStory(draft()));
    const { slug } = saveStory(db, u("jordan"), null, draft({ glance: { enabled: true, points, basis } }), now);
    expect(adminStories(db, u("jordan")).stories.find((s) => s.slug === slug)?.glance).toBe("on");
    const changed = draft({ dek: "A different standfirst.", glance: { enabled: true, points, basis } });
    saveStory(db, u("jordan"), slug, changed, now);
    expect(needsReview({ basis }, validateStory(changed))).toBe(true);
    expect(adminStories(db, u("jordan")).stories.find((s) => s.slug === slug)?.glance).toBe("check");
  });
});

describe("proposals for published stories", () => {
  it("saves them switched off and marked proposed, keeping the story's edition date", async () => {
    const target = stories[0];
    replies.push({ points: [{ text: "One.", from: target.dek.split(" ").slice(0, 8).join(" ") }], actions: [] });
    // A one-point reply is refused; the second is a valid one drawn from the story.
    const words = (target.dek + " " + target.dek).split(/\s+/);
    replies.push({
      points: [0, 1, 2].map((i) => ({ title: `Point ${i + 1}`, text: `Point ${i + 1}.`, from: words.slice(i, i + 8).join(" ") })),
      actions: [],
    });
    const done = await proposeForPublished(db, u("jordan"), now, { only: [target.slug] });
    expect(done).toEqual([{ slug: target.slug, points: 3, actions: 0 }]);
    const after = stories.find((s) => s.slug === target.slug)!;
    expect(after.glance).toMatchObject({ enabled: false, proposed: true });
    expect(after.updated).toBe(target.updated);
    expect(after.practice).toBeUndefined();
    expect(adminStories(db, u("jordan")).stories.find((s) => s.slug === target.slug)?.glance).toBe("proposed");
  });
});

describe("a reader's own checklist", () => {
  it("keeps each reader's ticks to themselves, and only while the checklist is on", () => {
    const { slug } = saveStory(
      db,
      u("jordan"),
      null,
      draft({
        practice: {
          enabled: true,
          checklist: true,
          basis: "",
          items: [
            { id: "a1", text: "Call early." },
            { id: "a2", text: "Plan cover." },
          ],
        },
      }),
      now,
    );
    setStoryStatus(db, u("jordan"), slug, "published", now);
    expect(tickPractice(db, u("sam"), { slug, itemId: "a2", done: true }, now).ticked).toEqual(["a2"]);
    expect(practiceTicks(db, u("jordan"), slug)).toEqual([]);
    expect(tickPractice(db, u("sam"), { slug, itemId: "a2", done: false }, now).ticked).toEqual([]);
    expect(() => tickPractice(db, u("sam"), { slug, itemId: "zz", done: true }, now)).toThrow(/Which action/);
    expect(() => tickPractice(db, u("sam"), { slug: "christmas-nope", itemId: "a1", done: true }, now)).toThrow(/no checklist/);
  });
});

describe("a story's video", () => {
  it("keeps a video uploaded to the Hub or a YouTube, Vimeo or Loom link, and nothing else", () => {
    const up = validateStory(draft({ video: { title: "", src: "/api/uploads/abc.mp4", captions: "/api/uploads/abc.vtt", placement: "top" } }));
    expect(up.video).toEqual({ title: "Christmas visits", src: "/api/uploads/abc.mp4", captions: "/api/uploads/abc.vtt", placement: "top" });
    expect(validateStory(draft({ video: { title: "Elsewhere", src: "https://example.com/v.mp4", placement: "end" } })).video).toBeUndefined();
    const yt = validateStory(
      draft({
        video: { title: "Interview", embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, captions: "/api/uploads/abc.vtt", placement: "sideways" as "top" },
      }),
    );
    expect(yt.video).toEqual({ title: "Interview", embed: { provider: "youtube", id: "dQw4w9WgXcQ" }, placement: "opening" });
    expect(validateStory(draft({ video: { title: "Bad", embed: { provider: "youtube", id: "<script>" }, placement: "top" } })).video).toBeUndefined();
    expect(() => validateStory(draft({ video: { title: "T", src: "/api/uploads/abc.mp4", poster: "https://example.com/p.jpg", placement: "top" } }))).toThrow(
      /cover picture/,
    );
  });
});
