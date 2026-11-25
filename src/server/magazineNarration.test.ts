import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { readGuideDoc } from "@/lib/magazine";
import { createGuide, publishGuide, readGuide, recordGuideEvent } from "./magazine";
import { narrationIssues, narrationPrompt, targetsFor } from "./magazineNarration";

/* The Magazine Audio Guide on the server: what Claude is asked, how its reply is checked, and what learners' listening records. (No calls to Claude or ElevenLabs here.) */

const BEST = "Respect his decision, note it, and let your Trilogy Care contact know as agreed";
const raw = (audio?: object) => ({
  schema: 2,
  ...(audio && { audio }),
  pages: [
    {
      id: "p1",
      title: "Your role",
      purpose: "Know what you do",
      template: "do",
      kind: "content",
      required: true,
      sections: [{ id: "s1", title: "S", blocks: [{ id: "t1", type: "text", body: "You support people at home." }] }],
    },
    {
      id: "p2",
      title: "When someone says no",
      purpose: "Respect choice",
      template: "decide",
      kind: "content",
      required: true,
      sections: [
        {
          id: "s2",
          title: "S",
          blocks: [
            {
              id: "d1",
              type: "decision",
              prompt: "Mr Ellis says no. What do you do?",
              choices: [
                { id: "c1", text: BEST, verdict: "best", feedback: "It’s his choice." },
                { id: "c2", text: "Insist", verdict: "risky", feedback: "No." },
              ],
            },
          ],
        },
      ],
    },
    { id: "quiz", title: "Final check", purpose: "Show it", template: "blank", kind: "assessment", required: true, sections: [] },
  ],
});
const doc = readGuideDoc(raw(), { draft: true });
/** n words, opening with its own first word so two scripts never start alike. */
const words = (n: number, first = "Here") => [first, ...Array.from({ length: n - 1 }, (_, i) => (i % 7 === 0 ? "you" : "word"))].join(" ");

describe("what Claude is asked for", () => {
  it("narrates the course introduction and every content page, never the assessment, as the settings say", () => {
    expect(targetsFor(doc, "course")).toEqual(["intro", "p1", "p2"]);
    const noIntro = readGuideDoc(raw({ levels: { course: false, pages: true } }), { draft: true });
    expect(targetsFor(noIntro, "course")).toEqual(["p1", "p2"]);
    expect(targetsFor(doc, "p2")).toEqual(["p2"]);
    expect(() => targetsFor(doc, "quiz")).toThrow(/isn’t a content page/);
    const onePage = readGuideDoc({ ...raw(), pages: [raw().pages[0]] }, { draft: true });
    expect(targetsFor(onePage, "course")).toEqual(["p1"]);
    expect(() => targetsFor(onePage, "intro")).toThrow(/page introduction only/);
  });

  it("gives Claude the course, the pages in full, the answers it mustn't give away, and the rules", () => {
    const p = narrationPrompt({
      title: "Induction",
      standfirst: "Be shift-ready",
      audience: "Care Partners",
      doc,
      targets: ["intro", "p2"],
      length: "standard",
      note: "Warmer",
    });
    expect(p).toContain("2. [id p2] When someone says no");
    expect(p).toContain('<page id="p2" number="2" of="3">');
    expect(p).not.toContain('<page id="p1"');
    expect(p).toContain(`- ${BEST}`);
    expect(p).toContain("50 to 75 words");
    expect(p).toContain("Hook, don't summarise");
    expect(p).toContain("<note>\nWarmer\n</note>");
    expect(p).toContain('"intro": "the course introduction"');
  });
});

describe("checking Claude's reply", () => {
  const check = narrationIssues(doc, ["intro", "p2"], "standard");
  it("accepts scripts of the right length", () => {
    expect(check({ intro: words(60), pages: [{ id: "p2", script: words(60, "Mr") }] })).toEqual([]);
  });
  it("sends back a missing, extra, far too long or give-away script", () => {
    const issues = check({ intro: words(200), pages: [{ id: "p1", script: words(60) }] }).join(" ");
    expect(issues).toMatch(/The course introduction is 200 words/);
    expect(issues).toMatch(/Write the introduction for page id p2/);
    expect(issues).toMatch(/Only write the scripts asked for \(not p1\)/);
    const spoiler = check({ intro: words(60), pages: [{ id: "p2", script: `${words(50)} ${BEST}.` }] }).join(" ");
    expect(spoiler).toMatch(/gives away an answer/);
  });
});

describe("listening, for learners", () => {
  let db: Db;
  let author: User, coordinator: User;
  const now = new Date("2026-11-19T00:00:00Z");
  beforeEach(() => {
    db = openDb(":memory:");
    author = userById(db, "jordan")!;
    coordinator = userById(db, "riley")!;
  });

  it("keeps the Audio Guide choice with their progress, and records introductions started and finished", () => {
    const c = createGuide(db, author, { title: "Induction", completion: "confirm", doc: { ...raw(), pages: raw().pages.slice(0, 2) } }, now);
    publishGuide(db, author, c.id, "", now);
    const g = readGuide(db, coordinator, c.slug);
    recordGuideEvent(db, coordinator, g.id, { event: "audioGuide", revisionId: g.revisionId, detail: { on: true } }, now);
    expect(readGuide(db, coordinator, c.slug).progress.answers).toMatchObject({ "audio:guide": "on" });
    recordGuideEvent(db, coordinator, g.id, { event: "narration", revisionId: g.revisionId, pageId: "intro", detail: { outcome: "started" } }, now);
    recordGuideEvent(db, coordinator, g.id, { event: "narration", revisionId: g.revisionId, pageId: "p2", detail: { outcome: "finished" } }, now);
    const events = db
      .prepare("SELECT event, page_id FROM magazine_events WHERE guide_id = ? AND event LIKE '%audio%' OR event LIKE 'narration.%' ORDER BY rowid")
      .all(g.id);
    expect(events).toEqual([
      { event: "audio_guide.on", page_id: null },
      { event: "narration.started", page_id: null },
      { event: "narration.finished", page_id: "p2" },
    ]);
    expect(() =>
      recordGuideEvent(db, coordinator, g.id, { event: "narration", revisionId: g.revisionId, pageId: "p2", detail: { outcome: "skipped" } }, now),
    ).toThrow(/Unknown narration event/);
    // Listening never counts as working through the page.
    expect(readGuide(db, coordinator, c.slug).progress.answers).not.toHaveProperty("done:p2");
  });
});

describe("playback settings", () => {
  it("waits for the learner to press Play by default, and keeps the author's Audio guide switch", () => {
    const withAudio = (playback?: string) => readGuideDoc({ ...raw({ ...(playback && { playback }) }) }, { draft: true }).audio?.playback;
    expect(withAudio()).toBe("press-play");
    expect(withAudio("auto")).toBe("auto");
    expect(withAudio("press-play")).toBe("press-play");
    expect(withAudio("offer-auto")).toBe("offer-auto");
  });
});

describe("OpenAI voices", () => {
  it("keeps an OpenAI voice in the settings, and names it in the recording's voice", async () => {
    const { voiceKey } = await import("@/lib/magazineNarration");
    const audio = readGuideDoc(raw({ voice: { kind: "openai", voice: "sage" } }), { draft: true }).audio!;
    expect(audio.voice).toEqual({ kind: "openai", voice: "sage" });
    expect(voiceKey(audio)).toBe("openai:sage");
    expect(readGuideDoc(raw({ voice: { kind: "openai", voice: "Not A Voice!" } }), { draft: true }).audio!.voice).toEqual({ kind: "topic" });
  });

  it("reads how long an MP3 plays from its bit rate", async () => {
    const { mp3Seconds } = await import("./openaiText");
    // An MPEG-1 Layer III frame header at 128 kbps, then 16,000 bytes: one second.
    const buf = Buffer.alloc(16_000);
    buf.set([0xff, 0xfb, 0x90, 0x00], 0);
    expect(mp3Seconds(buf)).toBe(1);
    expect(mp3Seconds(Buffer.from("not audio"))).toBeNull();
  });
});
