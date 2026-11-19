import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { activityDone, publishChecks, readGuideDoc } from "@/lib/magazine";
import { createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { deleteNote, myNotes, noteStats, saveNote, setActionStatus } from "./magazineNotes";

/* Reflect and apply: private notes that are never graded, shared or counted towards completion by default. */

let db: Db;
let author: User, learner: User, other: User;
const now = new Date("2026-11-20T00:00:00Z");
const later = (mins: number) => new Date(now.getTime() + mins * 60_000);

const journal = { id: "j1", type: "journal", prompt: "Dot wants to keep pruning her roses herself. What matters most to you before suggesting a change?", scaffold: "What would you ask first?" };
const revisit = { id: "j2", type: "journal", prompt: "What would you now ask Dot?", revisits: "j1" };
const labels = ["Not confident", "Unsure", "Somewhat confident", "Confident"].map((label, i) => ({ id: `o${i + 1}`, label }));
const pulseBefore = { id: "p-before", type: "pulse", kind: "confidence", question: "How confident are you in spotting a rate mismatch?", options: labels };
const pulseAfter = { ...pulseBefore, id: "p-after", compareWith: "p-before" };
const views = {
  id: "pv",
  type: "perspectives",
  prompt: "Two ways to respond to the complaint",
  after: "j1",
  views: [
    { id: "v1", title: "Reassure the client straight away", reasoning: "It shows you care.", misses: "It can promise an outcome you can't deliver." },
    { id: "v2", title: "Capture their account first", reasoning: "It keeps the record accurate.", misses: "It can feel cold if you don't acknowledge the upset." },
  ],
  guidance: { body: "Listen, record what they said and pass the complaint on the same day.", source: { label: "Complaints policy" } },
};
const action = {
  id: "a1",
  type: "action",
  prompt: "Choose one thing to try on your next invoice review.",
  suggestions: [
    { id: "s1", text: "Check the agreed rate against each service line before approval." },
    { id: "s2", text: "Ask the provider about any line I can't match." },
  ],
};
const actionLater = { id: "a2", type: "action", prompt: "Did you try it? What happened?", suggestions: [], revisits: "a1" };
const text = { id: "t", type: "text", body: "A case about Dot." };
const pages = (blocks: unknown[], more: unknown[] = []) => [
  { id: "p1", title: "The case", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s1", title: "S", blocks }] },
  ...(more.length ? [{ id: "p2", title: "Looking back", purpose: "", template: "blank", kind: "content", required: true, sections: [{ id: "s2", title: "S", blocks: more }] }] : []),
];
const all = () => pages([text, journal, views, pulseBefore, action], [revisit, pulseAfter, actionLater]);

function course(doc: unknown = { schema: 2, pages: all() }) {
  const c = createGuide(db, author, { title: "Reflect course", completion: "confirm", doc }, now);
  publishGuide(db, author, c.id, "", now, { allowUnverified: true });
  return { c, rev: readGuide(db, learner, c.slug).revisionId };
}

beforeEach(() => {
  db = openDb(":memory:");
  author = userById(db, "jordan")!;
  learner = userById(db, "riley")!;
  other = userById(db, "sam") ?? userById(db, "alex")!;
});

describe("the blocks in a course", () => {
  it("are read as written, never count as an activity by default, and hold up publishing only for a broken pair", () => {
    const doc = readGuideDoc({ schema: 2, pages: all() });
    const blocks = doc.pages.flatMap((p) => p.sections.flatMap((s) => s.blocks));
    expect(blocks.map((b) => b.type)).toEqual(["text", "journal", "perspectives", "pulse", "action", "journal", "pulse", "action"]);
    for (const b of blocks.slice(1)) expect(activityDone(b, {})).toBeNull();
    expect(publishChecks(doc, "confirm").blocking).toEqual([]);
    // Asking for a response: writing or choosing not to both count; nothing about length or agreement.
    const required = readGuideDoc({ schema: 2, pages: pages([{ ...journal, required: true }]) }).pages[0].sections[0].blocks[0];
    expect(activityDone(required, {})).toBe(false);
    expect(activityDone(required, { "done:j1": "1" })).toBe(true);
    // A pair that's gone, comes later, or uses different labels can't be published.
    const broken = (more: unknown[]) => publishChecks(readGuideDoc({ schema: 2, pages: pages([text], more) }, { draft: true }), "confirm").blocking.join(" ");
    expect(broken([revisit])).toMatch(/journal it looks back at isn’t there any more/);
    expect(broken([pulseAfter, pulseBefore])).toMatch(/comes after it/);
    expect(broken([pulseBefore, { ...pulseAfter, options: labels.slice(0, 3) }])).toMatch(/response labels differ/);
    const soft = publishChecks(readGuideDoc({ schema: 2, pages: pages([{ ...journal, prompt: "Tell us about a real client's name and what happened." }, { ...views, flag: undefined }]) }), "confirm");
    expect(soft.suggestions.join(" ")).toMatch(/fictional or de-identified/);
    expect(soft.suggestions.join(" ")).toMatch(/verified by its policy owner/);
  });
});

describe("a learner's private notes", () => {
  it("autosave as a draft, save, and keep a follow-up apart from the original", () => {
    const { c, rev } = course();
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "I'd ask what", state: "draft" }, now)).toMatchObject({ state: "draft" });
    expect(() => saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "  ", state: "saved" }, now)).toThrow(/Write a few words first/);
    const first = saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "I'd ask what the roses mean to her.", state: "saved" }, later(1));
    expect(first).toMatchObject({ state: "saved", body: "I'd ask what the roses mean to her." });
    // Autosave while editing later keeps it saved; skipping doesn't wipe it.
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "I'd ask what the roses mean to her, first.", state: "draft" }, later(2)).state).toBe("saved");
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", state: "skipped" }, later(3)).body).toMatch(/roses mean to her, first/);
    const followUp = saveNote(db, learner, c.id, { revisionId: rev, blockId: "j2", body: "Now I'd ask how we make it safer, not whether she stops.", state: "saved" }, later(60));
    expect(followUp).toMatchObject({ revisitOf: "j1" });
    const notes = myNotes(db, learner, c.id).notes;
    expect(notes.map((n) => [n.blockId, n.pageTitle, n.revisitOf])).toEqual([
      ["j1", "The case", null],
      ["j2", "Looking back", "j1"],
    ]);
    expect(notes[0].body).toMatch(/roses mean to her, first/);
    // Their copy of the course carries their own notes, so the blocks show them.
    expect(readGuide(db, learner, c.slug).progress.notes.j1).toMatchObject({ state: "saved" });
  });

  it("are theirs alone: no one else's copy, list or counts carries the words; they can delete them", () => {
    const { c, rev } = course();
    saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "A private thought about Dot.", state: "saved" }, now);
    expect(readGuide(db, other, c.slug).progress.notes).toEqual({});
    expect(myNotes(db, other, c.id).notes).toEqual([]);
    expect(myNotes(db, author, c.id).notes).toEqual([]);
    const stats = noteStats(db, author, c.id);
    expect(stats.blocks.j1).toMatchObject({ saved: 1, skipped: 0 });
    expect(JSON.stringify(stats)).not.toMatch(/private thought|riley/i);
    expect(() => noteStats(db, learner, c.id)).toThrow();
    // Events say that something was saved, never what.
    const events = db.prepare("SELECT event, detail FROM magazine_events WHERE guide_id = ? AND event LIKE 'journal.%'").all(c.id);
    expect(events).toEqual([{ event: "journal.saved", detail: "{}" }]);
    expect(deleteNote(db, other, c.id, "j1", later(1))).toEqual({ deleted: false });
    expect(deleteNote(db, learner, c.id, "j1", later(1))).toEqual({ deleted: true });
    expect(myNotes(db, learner, c.id).notes).toEqual([]);
  });

  it("keep a note when the course is republished, even if its block is later removed", () => {
    const { c, rev } = course();
    saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "Kept across editions.", state: "saved" }, now);
    saveGuideDraft(db, author, c.id, { doc: { schema: 2, pages: pages([text, pulseBefore]) } }, later(1));
    publishGuide(db, author, c.id, "", later(2), { allowUnverified: true, moveLearners: true });
    expect(() => saveNote(db, learner, c.id, { revisionId: rev, blockId: "j1", body: "x", state: "saved" }, later(3))).toThrow(/has been updated/);
    expect(myNotes(db, learner, c.id).notes[0]).toMatchObject({ body: "Kept across editions.", inCourse: false, prompt: journal.prompt });
  });
});

describe("pulse checks and action notes", () => {
  it("record a view, not a score; a pair lets the learner see their own change", () => {
    const { c, rev } = course();
    expect(() => saveNote(db, learner, c.id, { revisionId: rev, blockId: "p-before", choice: "nope" }, now)).toThrow(/Choose one of the responses/);
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "p-before", choice: "o2" }, now)).toMatchObject({ choice: "o2", choiceLabel: "Unsure" });
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "p-after", choice: "o3" }, later(30))).toMatchObject({ choiceLabel: "Somewhat confident" });
    const g = readGuide(db, learner, c.slug);
    expect([g.progress.notes["p-before"].choiceLabel, g.progress.notes["p-after"].choiceLabel]).toEqual(["Unsure", "Somewhat confident"]);
    // Not a note, not a completion, and no breakdown of answers for authors.
    expect(myNotes(db, learner, c.id).notes).toEqual([]);
    expect(g.completed).toBeNull();
    expect(JSON.stringify(noteStats(db, author, c.id))).not.toMatch(/Unsure|o2/);
  });

  it("take a suggested action or the learner's own, and later how it went", () => {
    const { c, rev } = course();
    expect(() => saveNote(db, learner, c.id, { revisionId: rev, blockId: "a1" }, now)).toThrow(/Choose an action, or write your own/);
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "a1", choice: "s1" }, now)).toMatchObject({ choiceLabel: action.suggestions[0].text });
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "a1", body: "I'll check rates before I approve anything." }, later(1))).toMatchObject({ choice: null, body: "I'll check rates before I approve anything." });
    expect(setActionStatus(db, learner, c.id, { blockId: "a1", status: "not_yet" }, later(2)).status).toBe("not_yet");
    expect(() => saveNote(db, learner, c.id, { revisionId: rev, blockId: "a2", body: "x" }, later(3))).toThrow(/Choose how it went/);
    expect(saveNote(db, learner, c.id, { revisionId: rev, blockId: "a2", status: "adjusted", body: "I check the top three lines." }, later(3))).toMatchObject({ status: "adjusted", revisitOf: "a1" });
    expect(() => setActionStatus(db, other, c.id, { blockId: "a1", status: "tried" }, later(4))).toThrow(/isn’t there/);
    expect(myNotes(db, learner, c.id).notes.map((n) => [n.blockId, n.status])).toEqual([
      ["a1", "not_yet"],
      ["a2", "adjusted"],
    ]);
  });
});
