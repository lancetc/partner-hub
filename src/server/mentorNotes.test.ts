import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { publishChecks } from "@/lib/magazine";
import {
  canCopyPhrase,
  cleanNote,
  dealDeck,
  deckComplete,
  emptyDeck,
  noteProblems,
  rankPool,
  type Candidate,
  type MentorNote,
  type NotesDeckData,
} from "@/lib/notes";
import { SEED_NOTES } from "@/content/mentorNotes";
import { deckAction, deckState, editorAction, myNoteAction, myNotes, noteLibrary, noteUse, pocketDeck, saveMyNote, toggleHelpful, toggleSave } from "./notes";

/* Notes to a Younger Me: only reviewed notes are dealt, decks stay stable, votes never endorse, saves are pointers, and nothing publishes on anyone's behalf. */

let db: Db;
let jordan: User, riley: User, sam: User;
const now = new Date("2026-11-20T00:00:00Z");
const deck = (p: Partial<NotesDeckData> = {}): NotesDeckData => ({
  title: "Notes",
  intro: "",
  topics: ["boundaries", "calls"],
  audiences: [],
  selection: "hybrid",
  noteIds: [],
  count: 3,
  deal: true,
  contribute: false,
  mode: "read",
  reflection: "Which part would you keep?",
  ...p,
});
const pages = (data: NotesDeckData) => [
  {
    id: "p1",
    title: "Deck",
    purpose: "",
    template: "blank",
    kind: "content",
    required: true,
    allActivities: false,
    sections: [{ id: "s1", title: "Notes", blocks: [{ id: "nd", type: "mentor", ...data }] }],
  },
];
const reviewAll = () => {
  for (const n of SEED_NOTES) editorAction(db, jordan, { id: n.id, action: "review" }, now);
};
function course(data: NotesDeckData) {
  const c = createGuide(db, jordan, { title: "Deck", completion: "confirm", doc: { schema: 2, pages: pages(data) } }, now);
  publishGuide(db, jordan, c.id, "", now);
  return c;
}
const fake = (id: string, author: string, badge: "CP" | "CC" = "CP", state: MentorNote["state"] = "reviewed"): MentorNote => ({
  id,
  version: 1,
  state,
  data: cleanNote({ ...SEED_NOTES[0].data, authorName: author, badge }),
  authorUser: "",
  reason: "",
  reviewedBy: "",
  reviewedAt: "2026-11-01T00:00:00Z",
  updatedAt: "",
});

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
});

describe("the seed deck", () => {
  it("is five illustrative notes across two topics, waiting for review, and the gardener card promises nothing", () => {
    expect(SEED_NOTES).toHaveLength(5);
    expect(SEED_NOTES.every((n) => n.data.illustrative && noteProblems(n.data).length === 0)).toBe(true);
    const g = SEED_NOTES[0].data;
    expect(JSON.stringify(g)).not.toMatch(/audit|out-of-pocket|bill/i);
    expect(g.policyNote).toMatch(/registered provider keeps responsibility/);
    expect(noteLibrary(db, jordan, now).notes.every((n) => n.latest.state === "submitted")).toBe(true);
  });

  it("can't go in a course until reviewed, even with Publish anyway", () => {
    const c = createGuide(db, jordan, { title: "Deck", completion: "confirm", doc: { schema: 2, pages: pages(deck()) } }, now);
    expect(() => publishGuide(db, jordan, c.id, "", now, { allowUnverified: true })).toThrow(/needs reviewed notes/);
    reviewAll();
    expect(() => publishGuide(db, jordan, c.id, "", now)).not.toThrow();
    expect(publishChecks({ schema: 2, pages: pages(deck({ selection: "curated" })) } as never, "confirm").blocking.join(" ")).toMatch(
      /needs the cards to show/,
    );
  });
});

describe("dealing", () => {
  it("deals only reviewed, on-topic notes for the reader, spreads authors, and stays stable for a learner", () => {
    const cands: Candidate[] = [
      { note: fake("a", "Ann"), helpful: 50 },
      { note: fake("b", "Ann"), helpful: 40 },
      { note: fake("c", "Bo", "CC"), helpful: 0 },
      { note: fake("d", "Cy"), helpful: 0 },
      { note: fake("x", "Unreviewed", "CP", "submitted"), helpful: 999 },
      { note: fake("y", "Flagged", "CP", "needs_review"), helpful: 999 },
    ];
    const ranked = rankPool(cands, deck(), "partner", "seed", "2026-11-20").map((n) => n.id);
    expect(ranked).not.toContain("x");
    expect(ranked).not.toContain("y");
    expect(ranked.slice(0, 3).map((id) => cands.find((c) => c.note.id === id)!.note.data.authorName)).toEqual(expect.arrayContaining(["Ann", "Bo", "Cy"]));
    expect(dealDeck(cands, deck(), "partner", "seed", "2026-11-20")).toEqual(dealDeck(cands, deck(), "partner", "seed", "2026-11-20"));
    expect(dealDeck(cands, deck({ noteIds: ["d"] }), "partner", "seed", "2026-11-20")[0]).toBe("d");
    expect(dealDeck(cands, deck({ selection: "curated", noteIds: ["x", "c"] }), "partner", "seed", "2026-11-20")).toEqual(["c"]);
  });

  it("completes once the first cards are turned and the reflection is answered", () => {
    const s = { ...emptyDeck(), dealt: ["a", "b", "c", "d"], flipped: ["a", "b", "c"] };
    expect(deckComplete(deck(), s)).toBe(false);
    expect(deckComplete(deck(), { ...s, reflection: "The warm boundary." })).toBe(true);
    expect(deckComplete(deck({ reflection: "" }), s)).toBe(true);
  });
});

describe("a learner's deck", () => {
  it("is dealt once, never reorders, deals another without repeats, and keeps instincts private", () => {
    reviewAll();
    const c = course(deck());
    const first = deckState(db, riley, c.id, "nd", now);
    expect(first.cards).toHaveLength(3);
    expect(deckState(db, riley, c.id, "nd", now).state.dealt).toEqual(first.state.dealt);
    const more = deckAction(db, riley, c.id, { blockId: "nd", action: "deal" }, now);
    expect(more.state.dealt).toHaveLength(4);
    expect(new Set(more.state.dealt).size).toBe(4);
    deckAction(db, riley, c.id, { blockId: "nd", action: "deal" }, now);
    const done = deckAction(db, riley, c.id, { blockId: "nd", action: "deal" }, now);
    expect(done).toMatchObject({ exhausted: true });
    expect(done.state.dealt).toHaveLength(5);
    deckAction(db, riley, c.id, { blockId: "nd", action: "instinct", noteId: first.state.dealt[0], text: "Just say yes" }, now);
    let r = first.state.dealt.map((id) => deckAction(db, riley, c.id, { blockId: "nd", action: "flip", noteId: id }, now)).pop()!;
    expect(r.completedNow).toBe(false);
    r = deckAction(db, riley, c.id, { blockId: "nd", action: "reflect", text: "Warm boundaries." }, now);
    expect(r).toMatchObject({ completedNow: true, state: { completed: true } });
    expect(JSON.stringify(db.prepare("SELECT detail FROM magazine_events WHERE event = 'notes.completed'").all())).not.toMatch(/Just say yes|Warm/);
  });
});

describe("cards everywhere", () => {
  it("counts one helpful vote per person, which they can take back, and a vote never endorses", () => {
    reviewAll();
    const id = SEED_NOTES[1].id;
    toggleHelpful(db, riley, { noteId: id, on: true }, now);
    toggleHelpful(db, riley, { noteId: id, on: true }, now);
    expect(toggleHelpful(db, sam, { noteId: id, on: true }, now)).toMatchObject({ helpful: 2, mineHelpful: true, label: "Editor-reviewed for learning" });
    expect(toggleHelpful(db, riley, { noteId: id, on: false }, now).helpful).toBe(1);
  });

  it("keeps Pocket Deck private, as pointers to the newest version, and explains a withdrawn note", () => {
    reviewAll();
    const id = SEED_NOTES[2].id;
    toggleSave(db, riley, { noteId: id, on: true }, now);
    toggleSave(db, riley, { noteId: id, on: true }, now);
    expect(pocketDeck(db, riley, now).notes).toHaveLength(1);
    expect(pocketDeck(db, sam, now).notes).toHaveLength(0);
    // The editor improves the wording: the saved card shows the new version.
    const data = { ...SEED_NOTES[2].data, phrase: "Take your time. Which part shall I go over again?" };
    editorAction(db, jordan, { id, action: "edit", data }, now);
    editorAction(db, jordan, { id, action: "review" }, new Date("2026-11-21T00:00:00Z"));
    const [saved] = pocketDeck(db, riley, now).notes;
    expect(saved).toMatchObject({ version: 2, updatedSince: true, data: { phrase: "Take your time. Which part shall I go over again?" } });
    editorAction(db, jordan, { id, action: "withdraw", reason: "Superseded by the new call guidance" }, now);
    expect(pocketDeck(db, riley, now).notes[0]).toMatchObject({ gone: true, why: "Superseded by the new call guidance" });
  });

  it("turns copying off while a note is re-reviewed, and keeps it out of new decks", () => {
    reviewAll();
    const id = SEED_NOTES[0].id;
    noteUse(db, riley, { noteId: id, event: "copied" }, now);
    expect(() => editorAction(db, jordan, { id, action: "flag", reason: "" }, now)).toThrow(/why/);
    editorAction(db, jordan, { id, action: "flag", reason: "Supplier insurance rules changed" }, now);
    expect(() => noteUse(db, riley, { noteId: id, event: "copied" }, now)).toThrow(/re-reviewed/);
    // Only one other reviewed boundaries note is left, so a boundaries-only deck of three can't be published.
    const b = createGuide(
      db,
      jordan,
      { title: "Boundaries deck", completion: "confirm", doc: { schema: 2, pages: pages(deck({ topics: ["boundaries"], selection: "pool" })) } },
      now,
    );
    let problems: string[] = [];
    try {
      publishGuide(db, jordan, b.id, "", now);
    } catch (e) {
      problems = (e as { problems: string[] }).problems;
    }
    expect(problems.join(" ")).toMatch(/is only 1 reviewed note on this topic; the deck shows 3/);
    // A deck on both topics never deals the flagged note.
    const c = course(deck({ selection: "pool", count: 3 }));
    const dealt = deckAction(db, sam, c.id, { blockId: "nd", action: "deal" }, now);
    expect(dealt.state.dealt).not.toContain(id);
    expect(canCopyPhrase({ state: "needs_review", data: SEED_NOTES[0].data })).toBe(false);
  });
});

describe("leaving a note", () => {
  const mine = () => ({
    ...SEED_NOTES[3].data,
    illustrative: false,
    authorName: "Riley L.",
    authorRole: "Care coordinator",
    hook: "“I thought I had to know every answer on the first call.”",
  });

  it("is never published on the author's behalf: submit, editor edits, author approves", () => {
    const { note } = saveMyNote(db, riley, { data: { ...mine(), consent: { audience: false, attribution: true } } }, now);
    expect(() => myNoteAction(db, riley, { id: note.id, action: "submit" }, now)).toThrow(/Agree to the audience/);
    saveMyNote(db, riley, { id: note.id, data: mine() }, now);
    expect(() => saveMyNote(db, sam, { id: note.id, data: mine() }, now)).toThrow(/isn’t yours/);
    myNoteAction(db, riley, { id: note.id, action: "submit" }, now);
    expect(() => saveMyNote(db, riley, { id: note.id, data: mine() }, now)).toThrow(/with the editors/);
    // The editor tightens the wording: it waits for Riley's OK, and isn't dealt meanwhile.
    editorAction(db, jordan, { id: note.id, action: "edit", data: { ...mine(), note: `${mine().note} Ask early.` } }, now);
    expect(() => editorAction(db, jordan, { id: note.id, action: "review" }, now)).toThrow(/nothing waiting/);
    expect(myNotes(db, riley, now).notes[0]).toMatchObject({ latest: { state: "changes" }, published: null });
    myNoteAction(db, riley, { id: note.id, action: "approve-edits" }, now);
    expect(myNotes(db, riley, now).notes[0].published).toMatchObject({ state: "reviewed", data: { note: expect.stringMatching(/Ask early\.$/) } });
  });

  it("lets the author decline the edits, or withdraw, and refuses identifiers", () => {
    const { note } = saveMyNote(db, riley, { data: mine() }, now);
    myNoteAction(db, riley, { id: note.id, action: "submit" }, now);
    editorAction(db, jordan, { id: note.id, action: "edit", data: { ...mine(), note: `${mine().note} Changed.` } }, now);
    myNoteAction(db, riley, { id: note.id, action: "decline-edits" }, now);
    expect(myNotes(db, riley, now).notes[0].latest).toMatchObject({ state: "submitted", version: 1 });
    myNoteAction(db, riley, { id: note.id, action: "withdraw" }, now);
    expect(myNotes(db, riley, now).notes[0].latest.state).toBe("withdrawn");
    expect(noteProblems({ ...mine(), scenario: "Mrs Jones on 0412 345 678 rang." }).join(" ")).toMatch(/phone number/);
  });
});
