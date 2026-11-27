import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById } from "./auth";
import type { Story } from "@/content/stories";
import { syncStories } from "./storyRegistry";
import { saveStory } from "./stories";
import {
  answerQuestion,
  archivePick,
  briefingAction,
  currentBriefing,
  cueProblems,
  draftBriefing,
  suggestCues,
  editionOf,
  featuredFor,
  markStoryRead,
  readSlugs,
  recordNewsVisit,
  setQuestion,
  updatedLabel,
  weeklyQuestion,
  whenLabel,
} from "./newsEdition";
import { draftStoryScript } from "@/lib/storyNarration";

/* The homepage news as a living edition (server/newsEdition): what's new since your last visit, the feature chosen for you, and the rest. */

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
  syncStories(db);
});
const u = (id: string) => userById(db, id)!;
const now = new Date("2026-11-27T00:30:00Z"); // Friday 27 November, 11:30 am in Sydney
const story = (slug: string, over: Partial<Story> = {}): Story => ({
  slug,
  category: "trilogy",
  title: `Story ${slug}`,
  dek: "A standfirst.",
  byline: "Trilogy Care team",
  date: "2026-11-20T00:00:00Z",
  readMinutes: 2,
  visual: { variant: "petals", tone: "teal", icon: "heart", alt: "" },
  body: [{ type: "p", text: "Opening." }],
  audience: ["partner", "coordinator"],
  ...over,
});

describe("the featured story", () => {
  const list = [
    story("pinned", { featured: true, date: "2026-11-01T00:00:00Z" }),
    story("christmas", { title: "Supporting clients through Christmas", date: "2026-11-10T00:00:00Z" }),
    story("newest", { date: "2026-11-26T00:00:00Z" }),
    story("coord", { audience: ["coordinator"], date: "2026-11-15T00:00:00Z" }),
  ];

  it("shows only stories ticked as featured, unread first, never one chosen for the season or the role", () => {
    const withTwo = [...list, story("pinned-newer", { featured: true, date: "2026-11-05T00:00:00Z" })];
    expect(featuredFor(withTwo, u("jordan"), new Set(), now).map((x) => x.story.slug)).toEqual(["pinned-newer", "pinned"]);
    expect(featuredFor(withTwo, u("jordan"), new Set(), now).every((x) => x.reason === "feature")).toBe(true);
    // Read the newer one: the other comes first, and the read one stays to browse back to.
    expect(featuredFor(withTwo, u("jordan"), new Set(["pinned-newer"]), now).map((x) => x.story.slug)).toEqual(["pinned", "pinned-newer"]);
  });

  it("lets a priority announcement lead until it's read, and stops featuring after the pinned date", () => {
    const withPriority = [...list, story("urgent", { priority: true, date: "2026-11-25T00:00:00Z" })];
    expect(featuredFor(withPriority, u("jordan"), new Set(), now).map((x) => [x.story.slug, x.reason])).toEqual([
      ["urgent", "priority"],
      ["pinned", "feature"],
    ]);
    expect(featuredFor(withPriority, u("jordan"), new Set(["urgent"]), now).map((x) => x.story.slug)).toEqual(["pinned"]);
    const expired = list.map((s) => (s.slug === "pinned" ? { ...s, featuredUntil: "2026-11-20" } : s));
    expect(featuredFor(expired, u("jordan"), new Set(), now)).toEqual([{ story: list[2], reason: "new" }]);
  });

  it("leads with the newest story when nothing is ticked, so the front page is never empty", () => {
    const none = list.map((s) => ({ ...s, featured: undefined }));
    expect(featuredFor(none, u("jordan"), new Set(none.map((s) => s.slug)), now).map((x) => x.story.slug)).toEqual(["newest"]);
  });

  it("picks an older story worth revisiting, keeping its date, and never one being featured", () => {
    const old = [story("autumn", { date: "2026-09-01T00:00:00Z" }), story("xmas-last-year", { title: "Christmas visits", date: "2026-10-01T00:00:00Z" })];
    expect(archivePick([...list, ...old], u("jordan"), new Set(), new Set(["pinned"]), now)?.slug).toBe("xmas-last-year");
    expect(archivePick(list, u("jordan"), new Set(), new Set(["pinned"]), now)).toBeNull();
  });
});

describe("the edition and your last visit", () => {
  it("remembers the previous visit, keeping it through a reload, and counts what's new since", () => {
    expect(recordNewsVisit(db, u("jordan"), new Date("2026-11-24T00:00:00Z"))).toBeNull();
    // Back three days later: the last visit was the 24th.
    expect(recordNewsVisit(db, u("jordan"), now)).toBe("2026-11-24T00:00:00.000Z");
    // A reload ten minutes later is the same visit.
    expect(recordNewsVisit(db, u("jordan"), new Date(now.getTime() + 600_000))).toBe("2026-11-24T00:00:00.000Z");
    const e = editionOf([story("a", { date: "2026-11-26T00:00:00Z" }), story("b")], [], "2026-11-24T00:00:00.000Z", now);
    expect(e.edition).toBe("November edition");
    expect(e.date).toBe("Friday 27 November 2026");
    expect(e.since).toBe("1 new story since your last visit");
    expect(editionOf([story("a")], [], null, now).since).toBe("1 story in this edition");
  });

  it("says when the news changed, and when each brief happened, in plain words", () => {
    expect(updatedLabel(new Date("2026-11-26T22:00:00Z"), now)).toBe("Updated this morning");
    expect(updatedLabel(new Date("2026-11-26T03:00:00Z"), now)).toBe("Updated yesterday");
    expect(whenLabel(new Date("2026-11-24T03:00:00Z"), now)).toBe("Earlier this week");
    expect(whenLabel(new Date("2026-11-30T03:00:00Z"), now)).toBe("Coming up");
  });

  it("records a story as read when it's opened", () => {
    markStoryRead(db, u("jordan"), "christmas", now);
    markStoryRead(db, u("jordan"), "christmas", now);
    expect([...readSlugs(db, u("jordan"))]).toEqual(["christmas"]);
    expect(() => markStoryRead(db, u("jordan"), "../x", now)).toThrow();
  });
});

describe("the weekly question and the briefing", () => {
  it("shows results only once you've answered, and a new question closes the last", () => {
    setQuestion(db, u("jordan"), { action: "set", question: "What's your biggest challenge?", options: ["Services", "Budgets", ""] }, now);
    const q = weeklyQuestion(db, u("sam"), now)!;
    expect(q.options.map((o) => o.text)).toEqual(["Services", "Budgets"]);
    expect(q.results).toBeNull();
    const after = answerQuestion(db, u("sam"), { questionId: q.id, optionId: "o2" }, now)!;
    expect(after.mine).toBe("o2");
    expect(after.results?.find((r) => r.id === "o2")?.count).toBe(1);
    setQuestion(db, u("jordan"), { action: "set", question: "Another question?", options: ["Yes", "No"] }, now);
    expect(weeklyQuestion(db, u("sam"), now)?.question).toBe("Another question?");
    expect(() => answerQuestion(db, u("sam"), { questionId: q.id, optionId: "o1" }, now)).toThrow(/closed/);
    expect(() => setQuestion(db, u("sam"), { action: "set", question: "Mine?", options: ["a", "b"] }, now)).toThrow(/Only learning authors/);
  });

  it("shows the briefing to learners only once a recording of its script is approved", async () => {
    await briefingAction(db, u("jordan"), { action: "save", script: "Here's what's happening this week." }, now);
    expect(currentBriefing(db, now)).toBeNull();
    await expect(briefingAction(db, u("jordan"), { action: "approve" }, now)).rejects.toThrow(/Record/);
  });
});

describe("every story has an introduction script", () => {
  it("drafts one from the story when it's saved without one, and keeps an author's own", () => {
    const draft = {
      title: "Christmas visits",
      dek: "Christmas can be lonely.",
      category: "trilogy" as const,
      date: "2026-11-27T00:00:00Z",
      audience: ["coordinator" as const],
      visual: { variant: "petals" as const, tone: "teal" as const, icon: "heart" as const, alt: "" },
      body: [
        { type: "p" as const, text: "Families travel. Services pause." },
        { type: "h2" as const, text: "Start with a conversation" },
        { type: "h2" as const, text: "Plan ahead" },
      ],
    };
    expect(draftStoryScript(draft)).toBe("Christmas can be lonely. Families travel. Services pause. In this story: start with a conversation and plan ahead.");
    const { slug } = saveStory(db, u("jordan"), null, draft, now);
    const saved = JSON.parse((db.prepare("SELECT data FROM authored_stories WHERE slug = ?").get(slug) as { data: string }).data) as Story;
    expect(saved.narration?.script).toContain("Christmas can be lonely.");
    saveStory(db, u("jordan"), slug, { ...saved, narration: { script: "My own words." } }, now);
    expect((JSON.parse((db.prepare("SELECT data FROM authored_stories WHERE slug = ?").get(slug) as { data: string }).data) as Story).narration?.script).toBe(
      "My own words.",
    );
  });
});

describe("the briefing's narration cues", () => {
  const list = [
    story("christmas", { title: "Supporting clients through Christmas", featured: true, date: "2026-11-25T00:00:00Z" }),
    story("visit-time", {
      title: "Confirm extra visit time first",
      date: "2026-11-24T00:00:00Z",
      category: "policy",
      policy: { status: "announced", issuer: "Trilogy Care", sourceTitle: "", sourceUrl: "", published: "2026-11-20", owner: "", reviewDate: "" },
    }),
  ];

  it("drafts a cue for everything the script mentions, each pointing at a published story or a part of the newspaper", () => {
    const d = draftBriefing(list, [], now, { question: true });
    expect(d.script).toContain("Our feature is Supporting clients through Christmas.");
    expect(d.cues.map((c) => c.target)).toEqual(["section:masthead", "story:christmas", "story:visit-time", "section:question"]);
    for (const c of d.cues) expect(d.script).toContain(c.excerpt);
  });

  it("suggests cues for a script written another way, from the headlines it mentions", () => {
    const cues = suggestCues("Here's the week. There's our feature, Supporting clients through Christmas, and the weekly question is open.", list);
    expect(cues.map((c) => [c.target, c.excerpt])).toEqual([
      ["section:masthead", "Here's the week."],
      ["story:christmas", "Supporting clients through Christmas"],
      ["section:question", "and the weekly question is open."],
    ]);
  });

  it("flags a cue whose story is unpublished or retitled, and leaves it out for learners", () => {
    const cues = draftBriefing(list, [], now).cues;
    expect(cueProblems(cues, [list[0]])).toEqual([{ id: "c3", problem: "“Confirm extra visit time first” isn’t published any more." }]);
    expect(cueProblems(cues, [{ ...list[0], title: "Christmas, revisited" }, list[1]])[0].problem).toMatch(/headline has changed/);
  });
});

describe("suggested cues and News in Brief", () => {
  it("points the first News in Brief item the script mentions at News in Brief", () => {
    const cues = suggestCues("Here's the week. There's Virtual cuppa: meet other Care Partners coming up.", [], [
      { id: "b1", kind: "The week ahead", title: "Virtual cuppa: meet other Care Partners", text: "", href: "/community", when: "", at: "" } as never,
    ]);
    expect(cues.map((c) => [c.target, c.excerpt])).toEqual([
      ["section:masthead", "Here's the week."],
      ["section:brief", "Virtual cuppa: meet other"],
    ]);
  });
});
