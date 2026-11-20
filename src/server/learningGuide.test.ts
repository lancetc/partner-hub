import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { activityDone, publishChecks, readGuideDoc, type GuideBlock } from "@/lib/magazine";
import { guidePlayable, guideScriptHash, guideState } from "@/lib/magazineGuide";
import { createGuide, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";
import { guideIdentity, guideUses, saveIdentity, withdrawRecording } from "./learningGuide";

/* The AI Learning Guide: a recorded, scripted asset. Learners only get media made from the approved script and checked. */

let db: Db;
let owner: User, author: User, learner: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);

const script = "Dot has cared for her roses for years. She still wants to prune them herself, even though her family is worried. Before anyone changes the plan, what would you want to understand?";
const VIDEO = "/api/uploads/11111111-1111-1111-1111-111111111111.mp4";
const VTT = "/api/uploads/22222222-2222-2222-2222-222222222222.vtt";
const hash = guideScriptHash(script);
const base = { id: "g1", type: "guide", mode: "transmission", purpose: "question", script, screenText: "What matters to Dot?", owner: "Jordan Lee", source: { label: "Induction, Lesson 2.1" } };
const approved = { ...base, status: "approved", approved: { by: "Dana", at: now.toISOString(), hash } };
const withMedia = (extra: object = {}) => ({ ...approved, media: { kind: "video", src: VIDEO, captions: VTT, seconds: 22, scriptHash: hash, ...extra } });
const checked = withMedia({ checked: { by: "Dana", at: now.toISOString() } });
const pages = (blocks: unknown[]) => [
  { id: "p1", title: "Dot and the rose garden", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s1", title: "S", blocks }] },
];
const read = (b: unknown) => readGuideDoc({ schema: 2, pages: pages([b]) }, { draft: true }).pages[0].sections[0].blocks[0] as GuideBlock;
const blocking = (b: unknown) => publishChecks(readGuideDoc({ schema: 2, pages: pages([b]) }, { draft: true }), "confirm").blocking.join(" ");

beforeEach(() => {
  db = openDb(":memory:");
  owner = userById(db, "jordan")!;
  author = userById(db, "dana")!;
  learner = userById(db, "riley")!;
});

describe("a guide segment's script and media", () => {
  it("moves from draft to checked, and goes back when the script changes", () => {
    expect(guideState(read({ ...base, status: "draft" }))).toBe("draft");
    expect(guideState(read(approved))).toBe("approved");
    expect(guideState(read(withMedia()))).toBe("ready");
    expect(guideState(read(checked))).toBe("checked");
    // A video with no captions isn't finished, however carefully it was watched.
    expect(guideState(read(withMedia({ captions: undefined, checked: { by: "Dana", at: now.toISOString() } })))).toBe("ready");
    // The words change: the approval no longer holds, and the recording is of something else.
    const edited = read({ ...checked, script: `${script} And who would you ask?` });
    expect(guideState(edited)).toBe("draft");
    expect(guidePlayable(edited)).toBe(false);
    // Approved again, the old recording is stale until it's made again.
    const again = read({ ...checked, script: "A different script entirely, approved afresh.", approved: { by: "Dana", at: now.toISOString(), hash: guideScriptHash("A different script entirely, approved afresh.") } });
    expect(guideState(again)).toBe("stale");
    // Spacing alone isn't a change.
    expect(guideState(read({ ...checked, script: `  ${script.replace(/ /g, "  ")}  ` }))).toBe("checked");
  });

  it("can't be published until the script is approved and matching media is checked; nothing about it is an activity", () => {
    expect(blocking({ ...base, status: "draft" })).toMatch(/script isn’t approved yet/);
    expect(blocking(approved)).toMatch(/upload the video made from the approved script/);
    expect(blocking(withMedia())).toMatch(/watch the whole recording against the script/);
    expect(blocking(withMedia({ captions: undefined }))).toMatch(/add a captions file/);
    expect(blocking({ ...checked, mode: "voice" })).toMatch(/needs an audio recording, not a video|needs the picture/);
    expect(blocking(checked)).toBe("");
    expect(activityDone(read(checked), {})).toBeNull();
    const soft = publishChecks(readGuideDoc({ schema: 2, pages: pages([{ ...checked, owner: undefined, source: undefined, script: `${script} In my years as a nurse, I've cared for many people like Dot.` }]) }, { draft: true }), "confirm");
    expect(soft.suggestions.join(" ")).toMatch(/reads as first-hand experience/);
    expect(soft.suggestions.join(" ")).toMatch(/name the script’s owner/);
  });
});

describe("what learners get", () => {
  it("is the recording only when it's cleared to play; otherwise the script as text, even if published anyway", () => {
    const c = createGuide(db, owner, { title: "Dot", completion: "confirm", doc: { schema: 2, pages: pages([{ ...withMedia(), id: "unchecked" }, checked]) } }, now);
    publishGuide(db, owner, c.id, "", now, { allowUnverified: true });
    const blocks = readGuide(db, learner, c.slug).doc.pages[0].sections[0].blocks as GuideBlock[];
    expect(blocks[0].media).toBeUndefined();
    expect(blocks[0].script).toBe(script);
    expect(blocks[1].media).toMatchObject({ src: VIDEO, captions: VTT });
    // Playing it is recorded as what happened, and finishes nothing.
    const g = readGuide(db, learner, c.slug);
    recordGuideEvent(db, learner, c.id, { event: "guide", revisionId: g.revisionId, blockId: "g1", detail: { outcome: "completed" } }, later(1));
    expect(() => recordGuideEvent(db, learner, c.id, { event: "guide", revisionId: g.revisionId, blockId: "g1", detail: { outcome: "passed" } }, later(1))).toThrow(/Unknown guide event/);
    const after = readGuide(db, learner, c.slug);
    expect(after.progress.finished).toEqual([]);
    expect(after.completed).toBeNull();
  });

  it("stops at once when a recording is withdrawn, everywhere, without republishing; the published record isn't rewritten", () => {
    const c = createGuide(db, owner, { title: "Dot", completion: "confirm", doc: { schema: 2, pages: pages([checked]) } }, now);
    publishGuide(db, owner, c.id, "", now, { allowUnverified: true });
    const uses = guideUses(db, author).uses;
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ course: "Dot", where: "live", edition: 1, state: "checked", playing: true, owner: "Jordan Lee", source: "Induction, Lesson 2.1" });
    expect(() => withdrawRecording(db, author, { src: VIDEO }, later(1))).toThrow(/Say why/);
    expect(() => withdrawRecording(db, learner, { src: VIDEO, note: "x" }, later(1))).toThrow();
    const out = withdrawRecording(db, author, { src: VIDEO, note: "The guidance on pruning changed." }, later(1));
    expect(out.uses[0]).toMatchObject({ playing: false, withdrawn: { by: author.name, note: "The guidance on pruning changed." } });
    expect((readGuide(db, learner, c.slug).doc.pages[0].sections[0].blocks[0] as GuideBlock).media).toBeUndefined();
    expect(db.prepare("SELECT doc FROM magazine_revisions WHERE guide_id = ?").get(c.id)).toMatchObject({ doc: expect.stringContaining(VIDEO) });
    withdrawRecording(db, author, { src: VIDEO, restore: true }, later(2));
    expect((readGuide(db, learner, c.slug).doc.pages[0].sections[0].blocks[0] as GuideBlock).media?.src).toBe(VIDEO);
    // A draft change shows as its own row in the review.
    saveGuideDraft(db, owner, c.id, { doc: { schema: 2, pages: pages([{ ...checked, script: "New words." }]) } }, later(3));
    expect(guideUses(db, author).uses.map((u) => [u.where, u.state])).toEqual([
      ["live", "checked"],
      ["draft", "draft"],
    ]);
  });
});

describe("the guide's identity", () => {
  it("is one for the whole Hub, says it's AI, and only a Hub administrator changes it", () => {
    expect(guideIdentity(db).intro).toMatch(/your AI learning guide\. These are recorded, scripted lessons/);
    expect(() => saveIdentity(db, author, { name: "Ava" }, now)).toThrow(/Only a Hub administrator/);
    expect(() => saveIdentity(db, owner, { name: "Ava", intro: "Meet Ava, your friendly colleague." }, now)).toThrow(/has to say the guide is AI/);
    saveIdentity(db, owner, { name: "Ava", intro: "Meet {name}, your AI learning guide. These are recorded, scripted lessons reviewed by Trilogy Care.", rights: "Provider-approved synthetic identity." }, now);
    expect(guideIdentity(db)).toMatchObject({ name: "Ava", intro: "Meet Ava, your AI learning guide. These are recorded, scripted lessons reviewed by Trilogy Care." });
    // Learners get the name, the introduction and the portrait: never the provider references or rights record.
    expect(Object.keys(guideIdentity(db)).sort()).toEqual(["intro", "name", "portrait"]);
    const c = createGuide(db, owner, { title: "Dot", completion: "confirm", doc: { schema: 2, pages: pages([checked]) } }, now);
    publishGuide(db, owner, c.id, "", now, { allowUnverified: true });
    expect(readGuide(db, learner, c.slug).guide.name).toBe("Ava");
  });
});
