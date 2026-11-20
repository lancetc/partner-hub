import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lessons } from "@/content/lessons";
import { ordered } from "@/lib/lessonGraph";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import {
  characterDetail,
  characterHistory,
  courseFromPlan,
  generateStoryAudio,
  momentDetail,
  planDetail,
  recordStoryEvent,
  storyAction,
  storyFor,
  storyLibrary,
  storyPlaces,
} from "./story";

/* Story Plans on the server: approved canon, pinned placements, history that respects access, and voice made only from approved words. */

const spoken: { text: string; voice?: string }[] = [];
vi.mock("./tts", () => ({
  ttsConfig: () => ({ apiKey: "test", voiceId: "narrator1", modelId: "test-model", configured: true }),
  narratorName: (v?: string) => (v ? `Voice ${v}` : "The Hub narrator"),
  narration: async (text: string, voice?: string) => {
    spoken.push({ text, voice });
    return { audio: Buffer.from(`ID3 test recording of: ${text}`), words: [{ word: "a", start: 0, end: 2.4 }] };
  },
}));

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-21T00:00:00Z");
const act = (input: Record<string, unknown>) => storyAction(db, jordan, input, now) as unknown as Record<string, string> & { impact?: string[] };
const topic = lessons[0];
const roomy = ordered(topic).find((c) => c.type !== "listen" && c.visual.kind !== "presenter")!;
const card = roomy.id;
const fullVideo = ordered(topic).find((c) => c.visual.kind === "presenter" && c.visual.video?.orientation === "portrait");
const guide = () =>
  db.prepare("SELECT id, slug, draft FROM magazine_guides WHERE status = 'published' ORDER BY id LIMIT 1").get() as { id: string; slug: string; draft: string };
const firstBlock = (g: { draft: string }) => {
  const page = (JSON.parse(g.draft) as { pages: { id: string; sections: { blocks: { id: string }[] }[] }[] }).pages[0];
  return { pageId: page.id, blockId: page.sections[0].blocks[0].id };
};

beforeAll(() => {
  process.env.HUB_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "hub-story-"));
});
beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
  spoken.length = 0;
});

describe("the library", () => {
  it("is for learning authors, and starts with the fictional pilot as sample canon", () => {
    expect(() => storyLibrary(db, riley, now)).toThrow();
    expect(() => storyAction(db, sam, { action: "start-profile", name: "Someone" }, now)).toThrow();
    const lib = storyLibrary(db, jordan, now);
    expect(lib.characters.map((c) => c.name)).toEqual(["Ava", "Dot", "Fiona"]);
    expect(lib.characters.every((c) => c.approved && c.sample && !c.changed)).toBe(true);
    expect(lib.characters.find((c) => c.name === "Dot")).toMatchObject({ lastEvent: "A morning at the markets", appearances: 1, moments: 2 });
    expect(lib.episodes.map((e) => e.title)).toEqual([
      "Thursday without Lena",
      "The library request",
      "Dot and the roses",
      "A morning at the markets",
      "An invoice that looks right",
    ]);
    expect(lib.plans).toHaveLength(1);
    // The photo library still has everyone else, with no story yet.
    expect(lib.others.length).toBeGreaterThan(10);
  });

  it("gives Ava an approved practitioner profile and two episodes of her own", () => {
    const a = characterDetail(db, jordan, "ava", now);
    expect(a.approved?.narrativeRole).toMatch(/fictional care coordination practitioner/);
    expect(a.approved?.facts.map((f) => f.id)).toContain("bell");
    expect(a.episodes.filter((e) => e.people.some((p) => p.characterId === "ava" && p.role === "focus")).map((e) => e.id)).toEqual([
      "ep-library",
      "ep-invoice",
    ]);
    expect(a.moments.filter((m) => m.speaks).map((m) => m.kind)).toEqual(["opening_transmission", "new_information", "debrief"]);
  });
});

describe("shared canon", () => {
  it("changes only through an approved revision with a reason, and lists what already tells the story", () => {
    act({ action: "place", id: "mo-dot-checkin", kind: "topic", ref: topic.slug, place: card });
    const d = characterDetail(db, jordan, "dot", now);
    const draft = { ...d.draft, facts: d.draft.facts.map((f) => (f.id === "roses" ? { ...f, text: "Dot tends the roses in her back garden." } : f)) };
    act({ action: "save-profile", id: "dot", profile: draft, steward: d.steward, audience: [] });
    const changed = characterDetail(db, jordan, "dot", now);
    expect(changed.changes).toEqual([
      "Fact changed: “Dot tends the roses in her front garden, and has for years.” becomes “Dot tends the roses in her back garden.”",
    ]);
    expect(changed.approved?.facts.find((f) => f.id === "roses")?.text).toMatch(/front garden/);
    expect(changed.impact).toEqual(["Appearance: A Coordinator’s Day", `Later check-in in ${topic.title} (${roomy.heading || roomy.label || card})`]);
    expect(() => act({ action: "approve-profile", id: "dot" })).toThrow(/why the approved story is changing/);
    const out = act({ action: "approve-profile", id: "dot", note: "The Door Explorer shows the roses at the back." });
    expect(out.revision).toBe(2);
    expect(out.impact).toHaveLength(2);
    expect(characterDetail(db, jordan, "dot", now).revisions.map((r) => r.number)).toEqual([2, 1]);
    expect(() => act({ action: "approve-profile", id: "dot", note: "Again, for no reason at all." })).toThrow(/Nothing has changed/);
    // The moment placed earlier still says what it was approved to say.
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0].script).toMatch(/The roses had a good spring/);
  });

  it("leaves approval to a named steward, and starts a new character as a draft", () => {
    const { id } = act({ action: "start-profile", name: "Mr Tan" });
    expect(characterDetail(db, jordan, id, now)).toMatchObject({ approved: null, revision: 0, steward: jordan.name });
    expect(() => act({ action: "approve-profile", id })).toThrow(/Say who this person is/);
    expect(() => act({ action: "start-profile", name: "dot" })).toThrow(/already in the character library/);
    act({ action: "save-profile", id: "fiona", profile: characterDetail(db, jordan, "fiona", now).draft, steward: riley.name, audience: ["coordinator"] });
    expect(characterDetail(db, jordan, "fiona", now).canApprove).toBe(jordan.superadmin === 1);
  });
});

describe("placing a moment", () => {
  it("shows learners the approved revision it pinned, in a Topic and in a Magazine course", () => {
    const g = guide();
    const { pageId, blockId } = firstBlock(g);
    act({ action: "place", id: "mo-ava-opening", kind: "topic", ref: topic.slug, place: card });
    act({ action: "place", id: "mo-ava-opening", kind: "guide", ref: g.id, place: `page:${pageId}` });
    act({ action: "place", id: "mo-dot-response", kind: "guide", ref: g.id, place: blockId, position: "after" });
    const inTopic = storyFor(db, riley, { topic: topic.slug }, now).moments;
    const inCourse = storyFor(db, riley, { guide: g.slug }, now).moments;
    expect(inTopic).toHaveLength(1);
    expect(inTopic[0]).toMatchObject({
      kind: "opening_transmission",
      place: card,
      revision: 1,
      nextAction: "Choose what to ask Dot first",
      instruction: "Before suggesting a change, decide what you would ask Dot.",
      video: null,
    });
    expect(inTopic[0].speaker.name).toBe("Ava");
    expect(inTopic[0].featured?.name).toBe("Dot");
    // The same contract in both formats, and only the opening is a transmission.
    expect(inCourse.map((m) => [m.kind, m.place, m.position])).toEqual([
      ["opening_transmission", `page:${pageId}`, "before"],
      ["person_response", blockId, "after"],
    ]);
    expect(inCourse[0].script).toBe(inTopic[0].script);
    expect(inCourse[1].hypothetical).toBe(true);
    expect(storyFor(db, riley, { topic: "no-such-topic" }, now).moments).toEqual([]);
  });

  it("keeps showing the old script until the author updates the placement", () => {
    act({ action: "place", id: "mo-ava-debrief", kind: "topic", ref: topic.slug, place: card });
    const m = momentDetail(db, jordan, "mo-ava-debrief", now);
    act({
      action: "save-moment",
      id: m.id,
      episodeId: m.episodeId,
      featuredId: m.featuredId,
      data: { ...m.draft, text: "A new line for the notebook: did it actually help?" },
    });
    // A draft changes nothing a learner sees.
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0].script).toMatch(/I nearly answered the ladder question/);
    expect(momentDetail(db, jordan, m.id, now).changed).toBe(true);
    const out = act({ action: "approve-moment", id: m.id });
    expect(out.revision).toBe(2);
    expect(out.impact).toEqual([expect.stringMatching(/still shows version 1$/)]);
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0]).toMatchObject({ revision: 1, script: expect.stringMatching(/ladder question/) });
    const p = momentDetail(db, jordan, m.id, now).placements[0];
    expect(p).toMatchObject({ revision: 1, behind: true, found: true });
    act({ action: "repin", placementId: p.id });
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0]).toMatchObject({
      revision: 2,
      script: "A new line for the notebook: did it actually help?",
    });
    act({ action: "moment-status", id: m.id, status: "retired" });
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments).toEqual([]);
  });

  it("only places approved moments, in places that exist", () => {
    const { id } = act({ action: "save-moment", kind: "debrief", speakerId: "ava", data: { text: "Short." } });
    expect(() => act({ action: "place", id, kind: "topic", ref: topic.slug, place: card })).toThrow(/Approve the moment before placing it/);
    expect(() => act({ action: "approve-moment", id })).toThrow(/Say why this moment belongs here/);
    expect(() => act({ action: "place", id: "mo-ava-debrief", kind: "topic", ref: topic.slug, place: "no-such-card" })).toThrow(/Choose a card/);
    if (fullVideo)
      expect(() => act({ action: "place", id: "mo-ava-debrief", kind: "topic", ref: topic.slug, place: fullVideo.id })).toThrow(/no room beside it/);
    expect(() => act({ action: "place", id: "mo-ava-debrief", kind: "guide", ref: guide().id, place: "no-such-block" })).toThrow(/isn’t in the course/);
    expect(() => act({ action: "save-moment", kind: "debrief", speakerId: "mrs-patel", data: {} })).toThrow(/a character with a story profile/);
    const places = storyPlaces(db, jordan);
    expect(places.topics.find((t) => t.ref === topic.slug)?.places[0].id).toBe(card);
    expect(places.guides.find((x) => x.ref === guide().id)?.places[0].id).toMatch(/^page:/);
  });

  it("never lets a learner’s path change the shared story", () => {
    act({ action: "place", id: "mo-dot-response", kind: "topic", ref: topic.slug, place: card });
    const before = JSON.stringify([characterDetail(db, jordan, "dot", now).approved, storyLibrary(db, jordan, now).episodes]);
    const p = storyFor(db, riley, { topic: topic.slug }, now).moments[0];
    for (const who of [riley, sam]) recordStoryEvent(db, who, { event: "story_moment_shown", placementId: p.placementId, key: `shown-${who.id}-1` }, now);
    expect(JSON.stringify([characterDetail(db, jordan, "dot", now).approved, storyLibrary(db, jordan, now).episodes])).toBe(before);
    expect(storyFor(db, sam, { topic: topic.slug }, now).moments[0].script).toBe(p.script);
  });
});

describe("a character’s history", () => {
  const appear = (kind: string, ref: string, episodeId: string, extra: Record<string, unknown> = {}) =>
    act({ action: "save-appearance", id: "dot", kind, ref, episodeId, type: "focus", ...extra });

  it("lists what the learner may open, in story order, up to where they are", () => {
    const g = guide();
    appear("topic", topic.slug, "ep-roses");
    appear("course", g.id, "ep-markets", { summary: "Dot and the Saturday markets." });
    act({ action: "place", id: "mo-ava-opening", kind: "topic", ref: topic.slug, place: card });
    const placement = storyFor(db, riley, { topic: topic.slug }, now).moments[0].placementId;
    const h = characterHistory(db, riley, "dot", { placement }, now);
    expect(h.character).toMatchObject({ name: "Dot", fictional: "A fictional character" });
    expect(h.context).toEqual({ title: "Dot and the roses", whenLabel: "This spring" });
    expect(h.upTo.map((i) => [i.title, i.format, i.href])).toEqual([
      ["Thursday without Lena", "Elsewhere in the Hub", "/play/coordinators-day"],
      ["Dot and the roses", "Topic", `/topics/${topic.slug}`],
    ]);
    // The later appearance is counted, and its summary isn't sent until asked for.
    expect(h.laterCount).toBe(1);
    expect(h.later).toEqual([]);
    expect(JSON.stringify(h)).not.toMatch(/Saturday markets/);
    const more = characterHistory(db, riley, "dot", { placement, later: "1" }, now);
    expect(more.later.map((i) => [i.title, i.href])).toEqual([["A morning at the markets", `/magazine/${g.slug}`]]);
    // With no context, the whole permitted history is in order.
    expect(characterHistory(db, riley, "dot", {}, now).upTo.map((i) => i.seq)).toEqual([5, 20, 30]);
  });

  it("leaves out a course the learner can’t read: no title, no summary, no count", () => {
    const g = guide();
    appear("course", g.id, "ep-markets", { summary: "An internal-only briefing about Dot." });
    db.prepare("UPDATE magazine_guides SET audience = '[\"staff\"]' WHERE id = ?").run(g.id);
    const h = characterHistory(db, riley, "dot", { later: "1" }, now);
    expect(h.upTo.map((i) => i.title)).toEqual(["Thursday without Lena"]);
    expect(h.laterCount).toBe(0);
    expect(JSON.stringify(h)).not.toMatch(/internal-only|markets/);
    expect(characterHistory(db, jordan, "dot", {}, now).upTo).toHaveLength(2);
  });

  it("hides a character who isn’t for this audience, wherever they’re placed", () => {
    act({ action: "save-profile", id: "ava", profile: characterDetail(db, jordan, "ava", now).draft, steward: "", audience: ["staff"] });
    act({ action: "place", id: "mo-ava-debrief", kind: "topic", ref: topic.slug, place: card });
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments).toEqual([]);
    expect(() => characterHistory(db, riley, "ava", {}, now)).toThrow(/isn’t here/);
    expect(storyFor(db, jordan, { topic: topic.slug }, now).moments).toHaveLength(1);
    expect(() => characterHistory(db, riley, "mrs-patel", {}, now)).toThrow();
  });

  it("links an appearance only to content that exists", () => {
    expect(() => appear("topic", "no-such-topic", "ep-roses")).toThrow(/published Topic/);
    expect(() => appear("page", guide().id, "ep-roses", { pageId: "nope" })).toThrow(/page of that course/);
    expect(() => appear("other", "", "ep-roses", { label: "Somewhere", href: "https://example.com" })).toThrow(/Hub path/);
    expect(() => appear("topic", topic.slug, "no-such-episode")).toThrow(/Choose the episode/);
  });
});

describe("voice", () => {
  it("records only approved words, keeps them with their revision, and plays nothing until it’s checked", async () => {
    act({ action: "place", id: "mo-dot-checkin", kind: "topic", ref: topic.slug, place: card });
    await expect(generateStoryAudio(db, riley, "mo-dot-checkin", now)).rejects.toThrow();
    const out = await generateStoryAudio(db, jordan, "mo-dot-checkin", now);
    expect(out.clips).toBe(4);
    expect(spoken.map((s) => s.text.slice(0, 20))).toEqual(["It’s Dot. The roses ", "Better than I expect", "She still rings to c", "The markets on Satur"]);
    expect(spoken.every((s) => s.voice === undefined)).toBe(true);
    const m = momentDetail(db, jordan, "mo-dot-checkin", now);
    expect(m.audio.script?.src).toMatch(/^\/api\/uploads\//);
    expect(Object.keys(m.audio.answers ?? {})).toEqual(["plan", "fiona", "markets"]);
    expect(m.audio.checked).toBeNull();
    // Unchecked: the learner gets the full text and no audio.
    const before = storyFor(db, riley, { topic: topic.slug }, now).moments[0];
    expect(before.audio).toEqual({ script: null, answers: {} });
    expect(before.questions).toHaveLength(3);
    act({ action: "check-audio", id: "mo-dot-checkin" });
    const after = storyFor(db, riley, { topic: topic.slug }, now).moments[0];
    expect(after.audio.script).toBe(m.audio.script?.src);
    expect(Object.keys(after.audio.answers)).toEqual(["plan", "fiona", "markets"]);
  });

  it("starts a new revision with no recording, and leaves the old placement its own audio", async () => {
    act({ action: "place", id: "mo-ava-debrief", kind: "topic", ref: topic.slug, place: card });
    await generateStoryAudio(db, jordan, "mo-ava-debrief", now);
    act({ action: "check-audio", id: "mo-ava-debrief" });
    const old = storyFor(db, riley, { topic: topic.slug }, now).moments[0];
    const m = momentDetail(db, jordan, "mo-ava-debrief", now);
    act({
      action: "save-moment",
      id: m.id,
      episodeId: m.episodeId,
      featuredId: m.featuredId,
      data: { ...m.draft, text: "Did it actually help? Go back and find out." },
    });
    act({ action: "approve-moment", id: m.id });
    expect(momentDetail(db, jordan, m.id, now).audio).toEqual({});
    // Still pinned to version 1: the same words and the recording made from them.
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0]).toEqual(old);
    act({ action: "repin", placementId: momentDetail(db, jordan, m.id, now).placements[0].id });
    expect(storyFor(db, riley, { topic: topic.slug }, now).moments[0]).toMatchObject({
      script: "Did it actually help? Go back and find out.",
      audio: { script: null, answers: {} },
    });
    act({ action: "remove-audio", id: m.id });
    expect(() => act({ action: "check-audio", id: m.id })).toThrow(/no recording to check/);
  });

  it("uses the character’s approved voice, and won’t record a draft", async () => {
    const d = characterDetail(db, jordan, "ava", now);
    act({
      action: "save-profile",
      id: "ava",
      profile: { ...d.draft, voice: { id: "abcdEFGH1234", name: "Field voice", reason: "Warm and unhurried." } },
      steward: d.steward,
      audience: [],
    });
    act({ action: "approve-profile", id: "ava", note: "Giving Ava her own voice for the pilot." });
    await generateStoryAudio(db, jordan, "mo-ava-debrief", now);
    expect(spoken[0].voice).toBe("abcdEFGH1234");
    const { id } = act({ action: "save-moment", kind: "debrief", speakerId: "ava", data: { text: "Not approved.", purpose: "A reason that is long enough." } });
    await expect(generateStoryAudio(db, jordan, id, now)).rejects.toThrow(/Approve the script first/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE event = 'story.audio_generated'").get()).toEqual({ n: 1 });
  });
});

describe("story plans", () => {
  it("suggests a fitting character with reasons, and checks continuity", () => {
    const p = planDetail(db, jordan, "plan-dot-roses", now);
    expect(p.suggestions.fits[0]).toMatchObject({ id: "dot", name: "Dot" });
    expect(p.suggestions.fits[0].reasons.length).toBeGreaterThan(0);
    expect(p.anchor?.episodes.map((e) => e.title)).toEqual(["Thursday without Lena", "Dot and the roses", "A morning at the markets"]);
    expect(p.anchor?.appearances).toEqual([{ format: "Elsewhere in the Hub", label: "A Coordinator’s Day", href: "/play/coordinators-day", found: true }]);
    expect(p.warnings).toEqual([]);
    act({ action: "save-plan", id: p.id, title: p.title, data: { ...p.data, tension: `${p.data.tension} Dot’s son has told her to stop.` } });
    const warned = planDetail(db, jordan, p.id, now);
    expect(warned.warnings.map((w) => w.id)).toEqual(["relation:dot:son"]);
    // An editor can answer a warning with a recorded explanation; it stays on the plan.
    act({
      action: "save-plan",
      id: p.id,
      title: p.title,
      data: { ...warned.data, resolved: { "relation:dot:son": "Proposed as a new fact for the steward." } },
    });
    expect(planDetail(db, jordan, p.id, now).data.resolved).toEqual({ "relation:dot:son": "Proposed as a new fact for the steward." });
  });

  it("turns the beats into an outline with a reason for each block, and can start a Magazine draft", () => {
    const p = planDetail(db, jordan, "plan-dot-roses", now);
    expect(p.outline.map((s) => s.beat)).toEqual([
      "Person’s goal",
      "Work situation",
      "Learner choice",
      "Complication or clue",
      "Consequence and feedback",
      "Transfer to work",
    ]);
    expect(p.outline[2].blocks[0]).toMatchObject({ type: "decision" });
    expect(p.outline.every((s) => s.blocks.every((b) => b.why.startsWith("Supports “")))).toBe(true);
    expect(p.outline.map((s) => s.moments)).toEqual([0, 1, 0, 1, 1, 1]);
    const { guideId } = courseFromPlan(db, jordan, p.id, now);
    const g = db.prepare("SELECT status, draft FROM magazine_guides WHERE id = ?").get(guideId) as { status: string; draft: string };
    expect(g.status).toBe("draft");
    expect((JSON.parse(g.draft) as { pages: { template: string }[] }).pages.map((x) => x.template)).toEqual([
      "decide",
      "decide",
      "decide",
      "notice",
      "decide",
      "do",
    ]);
    expect(courseFromPlan(db, jordan, p.id, now).guideId).toBe(guideId);
    expect(planDetail(db, jordan, p.id, now).guide?.id).toBe(guideId);
  });

  it("can be written by hand, with or without a story, and prefilled from a Problem desk theme", () => {
    const { id } = act({ action: "save-plan", title: "A plain job aid", data: { mode: "none" } });
    expect(planDetail(db, jordan, id, now)).toMatchObject({ warnings: [], outline: [], anchor: null });
    const story = act({ action: "save-plan", title: "A new story", data: { mode: "story" } });
    expect(planDetail(db, jordan, story.id, now).data.beats).toHaveLength(7);
    expect(() => act({ action: "plan-from-theme", themeId: "theme-invoice-rates" })).toThrow(/Problem desk/);
  });
});

describe("events", () => {
  it("records engagement once per key, apart from attempts and completions", () => {
    act({ action: "place", id: "mo-dot-checkin", kind: "topic", ref: topic.slug, place: card });
    const p = storyFor(db, riley, { topic: topic.slug }, now).moments[0];
    const completions = () => (db.prepare("SELECT COUNT(*) AS n FROM lesson_completions").get() as { n: number }).n;
    const was = completions();
    expect(recordStoryEvent(db, riley, { event: "story_check_in_opened", placementId: p.placementId, key: "open-0001" }, now)).toEqual({ recorded: true });
    expect(recordStoryEvent(db, riley, { event: "story_check_in_opened", placementId: p.placementId, key: "open-0001" }, now)).toEqual({ recorded: false });
    recordStoryEvent(db, riley, { event: "story_question_selected", placementId: p.placementId, detail: "plan", key: "ask-00001" }, now);
    expect(() => recordStoryEvent(db, riley, { event: "lesson_completed", placementId: p.placementId }, now)).toThrow(/Unknown event/);
    expect(db.prepare("SELECT event, character_id, moment_id, revision, kind, ref, place, audience, detail FROM story_events ORDER BY id").all()).toEqual([
      {
        event: "story_check_in_opened",
        character_id: "dot",
        moment_id: "mo-dot-checkin",
        revision: 1,
        kind: "topic",
        ref: topic.slug,
        place: card,
        audience: "coordinator",
        detail: "",
      },
      {
        event: "story_question_selected",
        character_id: "dot",
        moment_id: "mo-dot-checkin",
        revision: 1,
        kind: "topic",
        ref: topic.slug,
        place: card,
        audience: "coordinator",
        detail: "plan",
      },
    ]);
    expect(completions()).toBe(was);
  });
});
