import { describe, expect, it } from "vitest";
import {
  cleanBible,
  cleanEpisode,
  cleanImage,
  consistencyCheck,
  episodeProblems,
  isOut,
  knownAt,
  pronounsFor,
  rememberChat,
  scrub,
  storyBrief,
} from "./livesInProgress";

/* The pure rules behind Lives in Progress: tidying, what's out, pronouns, what a chat is remembered as, and the checks. */

const now = new Date("2026-11-25T00:00:00Z");
const e = (id: string, number: number, status: "published" | "scheduled" | "draft", publishAt: string) => ({ id, arcId: "a", number, status, publishAt });

describe("tidying", () => {
  it("keeps only the Hub's own pictures and links, and a real voice id", () => {
    expect(cleanImage("/api/uploads/abc.webp")).toBe("/api/uploads/abc.webp");
    expect(cleanImage("https://example.com/x.png")).toBe("");
    expect(cleanImage("/images/../secret")).toBe("");
    const b = cleanBible({ media: { voiceId: "not a voice!" }, identity: { fullName: "  Mrs A  " } });
    expect(b.media.voiceId).toBe("");
    expect(b.identity.fullName).toBe("Mrs A");
    const ep = cleanEpisode({
      resources: [
        { title: "Out", href: "https://example.com" },
        { title: "In", href: "/topics/x" },
      ],
      interactions: [{ kind: "nope" }],
    });
    expect(ep.resources).toEqual([{ kind: "topic", title: "In", href: "/topics/x" }]);
    expect(ep.interactions).toEqual([]);
  });
});

describe("what's out", () => {
  it("is published and due; knowledge stops at the episode asked for", () => {
    const list = [
      e("1", 1, "published", "2026-11-11T00:00:00Z"),
      e("2", 2, "published", "2026-11-18T00:00:00Z"),
      e("3", 3, "scheduled", "2026-11-20T00:00:00Z"),
    ];
    expect(isOut(list[2], now)).toBe(false);
    expect(knownAt(list, now).map((x) => x.id)).toEqual(["1", "2"]);
    expect(knownAt(list, now, "1").map((x) => x.id)).toEqual(["1"]);
  });
});

describe("pronouns", () => {
  it("come from the Bible, else the title", () => {
    expect(pronounsFor("she/her", "Margaret Alder").possessive).toBe("her");
    expect(pronounsFor("", "Mr Okafor").possessive).toBe("his");
    expect(pronounsFor("", "Sam").possessive).toBe("their");
  });
});

describe("what a chat is remembered as", () => {
  it("takes topics from a fixed list and the learner's questions, scrubbed", () => {
    const m = rememberChat(
      [
        { role: "user", text: "How are the roses? Ring me on 0412 345 678." },
        { role: "assistant", text: "Isabel came on Sunday." },
        { role: "user", text: "Have you thought about a garden seat?" },
      ],
      [
        { label: "the roses", words: ["rose"] },
        { label: "Isabel", words: ["Isabel"] },
      ],
    );
    expect(m.topics).toEqual(["the roses"]);
    expect(m.questions).toEqual(["How are the roses?", "Have you thought about a garden seat?"]);
    expect(m.suggestions).toEqual(["Have you thought about a garden seat?"]);
    expect(scrub("me@x.com 0412 345 678 1234567")).toBe("[removed] [removed] [removed]");
  });

  it("never claims a chat that isn't stored", () => {
    const brief = storyBrief({ name: "x", bible: null, cast: [], known: [], viewing: null, historical: false, memories: [], now });
    expect(brief).toMatch(/Never suggest you have/);
  });
});

describe("checks", () => {
  it("flags a lecturing line, an unknown cast member, a spoiling teaser, and a story that's all problems", () => {
    const base = { dialogue: "", diary: "", teaser: "", cast: [] as string[], interactions: [], status: "approved" as const };
    const issues = consistencyCheck({
      bible: null,
      cast: [{ id: "c1", name: "Isabel" }],
      episodes: [
        { ...base, id: "a", number: 1, title: "A fall", story: "She is worried.", dialogue: "Dignity of risk is a principle.", teaser: "Next: The incident" },
        { ...base, id: "b", number: 2, title: "The incident", story: "An incident.", cast: ["c9"] },
        { ...base, id: "c", number: 3, title: "Hospital", story: "Pain." },
        { ...base, id: "d", number: 4, title: "Upset", story: "A setback." },
      ],
    }).map((i) => i.text);
    expect(issues.some((t) => /sounds like a lesson/.test(t))).toBe(true);
    expect(issues.some((t) => /isn’t in the supporting cast/.test(t))).toBe(true);
    expect(issues.some((t) => /gives away/.test(t))).toBe(true);
    expect(issues.some((t) => /Every episode is about a problem/.test(t))).toBe(true);
    expect(issues.some((t) => /no approved Character Bible/.test(t))).toBe(true);
  });

  it("lists what an episode needs before review", () => {
    expect(episodeProblems({ title: "", story: "", quote: "", diary: "", publishAt: "", interactions: [], teaser: "" })).toHaveLength(5);
  });
});

describe("the demo arcs", () => {
  it("pass the rules-based checks: no lecturing lines, no unknown cast, no teaser giving the next episode away", async () => {
    const { DEMO_ARCS, DEMO_CAST } = await import("@/content/livesInProgress");
    for (const a of DEMO_ARCS) {
      const issues = consistencyCheck({
        bible: cleanBible({}),
        cast: DEMO_CAST.filter((c) => c.memberId === a.memberId),
        episodes: a.episodes.map((e) => ({ ...e, id: String(e.number), status: e.status ?? "approved" })),
      });
      expect(issues).toEqual([]);
    }
  });
});
