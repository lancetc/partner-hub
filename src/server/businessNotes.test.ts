import { inflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { SEED_NOTES } from "@/content/mentorNotes";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createGuide, publishGuide } from "./magazine";
import { orderReplies, screenText, suppress, type ReplyLabel } from "@/lib/businessNotes";
import { noteProblems, type NotesDeckData } from "@/lib/notes";
import { BUSINESS_SEEDS } from "@/content/businessNotes";
import {
  businessAction,
  businessCard,
  businessDeck,
  businessEditorAction,
  businessExport,
  businessInsights,
  businessLibrary,
  businessSearchDocs,
  businessSpace,
  contributeAction,
  ensureBusiness,
  myBusinessNotes,
  threadFor,
} from "./businessNotes";
import { deckAction, deckState, editorAction, noteLibrary, pocketDeck, toggleSave } from "./notes";
import { inbox } from "./notifications";
import { search } from "./search";
import { plannerAccess } from "./caseloadPlanner";

/*
  Care Partner Business Field Notes (docs/business-field-notes.md), PRD acceptance item 13: principal-only at every
  surface, one canonical thread per card, consent and withdrawal, approved guidance above peers, commercially
  sensitive posts held, stale content invalidated, and idempotent saves and reactions.
*/

let db: Db;
let jordan: User, casey: User, sam: User, riley: User;
const now = new Date("2026-11-24T00:00:00Z");
const later = new Date("2026-11-25T00:00:00Z");
const AMIRA = "bfn-amira-first-hire";
const MAYA = "bfn-maya-workload-signals";

/** Run the review steps and publish, as an editor. */
function publish(id: string, at = now) {
  for (const step of ["editorial", "privacy_commercial", "subject_matter"])
    businessEditorAction(db, jordan, { id, action: "check", step, outcome: "pass" }, at);
  businessEditorAction(db, jordan, { id, action: "publish" }, at);
}
const ask = (u: User, text: string, extra: Record<string, unknown> = {}) =>
  businessAction(db, u, { noteId: AMIRA, action: "ask", text, checked: true, ...extra }, now) as { route: string; id?: string; held?: unknown };
const deck = (p: Partial<NotesDeckData> = {}): NotesDeckData => ({
  title: "Business deck",
  intro: "",
  topics: [],
  audiences: [],
  selection: "pool",
  noteIds: [],
  count: 3,
  deal: true,
  contribute: false,
  mode: "think",
  reflection: "",
  edition: "business",
  ...p,
});
function course(data: NotesDeckData) {
  const pages = [
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
  const c = createGuide(db, jordan, { title: "Business deck", completion: "confirm", doc: { schema: 2, pages } }, now);
  publishGuide(db, jordan, c.id, "", now, { allowUnverified: true });
  return c;
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, casey, sam, riley] = ["jordan", "casey", "sam", "riley"].map((id) => userById(db, id)!);
  ensureBusiness(db, now);
});

describe("the fictional seeds", () => {
  it("are complete, prominently illustrative, never screened as sensitive, and wait for review", () => {
    expect(BUSINESS_SEEDS).toHaveLength(3);
    for (const s of BUSINESS_SEEDS) {
      expect(s.data.illustrative).toBe(true);
      expect(s.data.authorName).toMatch(/fictional/);
      expect(noteProblems(s.data)).toEqual([]);
      const sc = screenText([s.data.hook, s.data.scenario, s.data.note, s.data.phrase, s.data.business!.decision, s.data.business!.tried].join("\n"));
      expect(sc).toEqual({ urgent: false, identifying: [], commercial: [] });
    }
    expect(BUSINESS_SEEDS[0].data.hook).toMatch(/hired a coordinator and still ended every day answering the calls/);
    expect(businessLibrary(db, jordan, now).notes.every((n) => n.latest.state === "submitted" && !n.published)).toBe(true);
    // Not in the general mentor library, and the general review can't publish one.
    expect(noteLibrary(db, jordan, now).notes.some((n) => n.latest.id === AMIRA)).toBe(false);
    expect(() => editorAction(db, jordan, { id: AMIRA, action: "review" }, now)).toThrow(/their own library/);
  });

  it("can't be published until the review steps pass, and sign-offs record the real reviewer", () => {
    expect(() => businessEditorAction(db, jordan, { id: AMIRA, action: "publish" }, now)).toThrow(/Editorial review/);
    businessEditorAction(db, jordan, { id: AMIRA, action: "check", step: "editorial", outcome: "pass" }, now);
    expect(() => businessEditorAction(db, jordan, { id: AMIRA, action: "publish" }, now)).toThrow(/Privacy and commercial check/);
    publish(AMIRA);
    const n = businessLibrary(db, jordan, now).notes.find((x) => x.latest.id === AMIRA)!;
    expect(n.published?.reviewedBy).toBe("jordan");
    expect(n.steps.every((s) => s.decision?.by_user === "jordan")).toBe(true);
  });
});

describe("principal-only at every surface", () => {
  beforeEach(() => publish(AMIRA));

  it("casey (the business owner) can read; sam, riley and jordan can't, through the deck, a direct id, an action, search or Community", () => {
    expect(plannerAccess(db, casey)?.role).toBe("owner");
    expect(businessDeck(db, casey, {}, now).cards.map((c) => c.id)).toEqual([AMIRA]);
    expect(businessCard(db, casey, AMIRA, now).card.data.business?.number).toBe(1);
    for (const u of [sam, riley, jordan]) {
      expect(() => businessDeck(db, u, {}, now)).toThrow(/Not found/);
      expect(() => businessCard(db, u, AMIRA, now)).toThrow(/Not found/);
      expect(() => businessAction(db, u, { noteId: AMIRA, action: "save", on: true }, now)).toThrow(/Not found/);
      expect(() => businessSpace(db, u, now)).toThrow(/Not found/);
      expect(businessSearchDocs(db, u)).toEqual([]);
      expect(search(db, u, "hired coordinator answering calls").some((r) => r.href.includes(AMIRA))).toBe(false);
      // The general Pocket Deck route can't save it either.
      expect(() => toggleSave(db, u, { noteId: AMIRA, on: true }, now)).toThrow(/isn’t available/);
    }
    expect(search(db, casey, "hired coordinator answering calls").some((r) => r.href === `/business-notes/${AMIRA}`)).toBe(true);
    // Someone the owner authorised to plan is not a principal.
    db.prepare("INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES (?, 'sam', 'member', 'casey', ?)").run(
      sam.org_id,
      now.toISOString(),
    );
    expect(() => businessDeck(db, sam, {}, now)).toThrow(/Not found/);
  });

  it("never leaks the contributor's private notes, and a Magazine deck deals only to principals", () => {
    const c = course(deck({ selection: "curated", noteIds: [AMIRA] }));
    expect(deckState(db, casey, c.id, "nd", now).cards.map((x) => ("gone" in x ? "" : x.id))).toEqual([AMIRA]);
    expect(() => deckState(db, sam, c.id, "nd", now)).toThrow(/business owners/);
    expect(() => deckAction(db, riley, c.id, { blockId: "nd", action: "flip", noteId: AMIRA }, now)).toThrow(/business owners/);
    // A general deck never deals a business card, to anyone.
    for (const n of SEED_NOTES) editorAction(db, jordan, { id: n.id, action: "review" }, now);
    const general = course(deck({ edition: "general", topics: ["boundaries", "calls"], selection: "pool" }));
    expect(JSON.stringify(deckState(db, casey, general.id, "nd", now).cards)).not.toContain(AMIRA);
    const card = businessCard(db, casey, AMIRA, now).card;
    expect(card.data.business?.privateNote).toBe("");
    expect(card.data.business?.freeText).toBe("");
  });

  it("a saved card's Pocket Deck entry, notification and search result disappear when access goes", () => {
    businessAction(db, casey, { noteId: AMIRA, action: "save", on: true }, now);
    businessEditorAction(db, jordan, { id: AMIRA, action: "chapter-publish", number: 1 }, now);
    expect(inbox(db, casey, now).updates.some((i) => i.href === `/business-notes/${AMIRA}?chapter=1`)).toBe(true);
    expect(inbox(db, sam, now).updates.some((i) => i.href?.includes("business-notes"))).toBe(false);
    const p = pocketDeck(db, casey, now).notes.find((x) => x.id === AMIRA)!;
    expect(p.business).toMatchObject({ href: `/business-notes/${AMIRA}`, chapters: 1, threadState: "open" });
    // Casey stops being the owner.
    db.prepare("DELETE FROM business_planner_access WHERE user_id = 'casey'").run();
    expect(pocketDeck(db, casey, now).notes.find((x) => x.id === AMIRA)).toMatchObject({ gone: true });
    expect(inbox(db, casey, now).updates.some((i) => i.href?.includes("business-notes"))).toBe(false);
    expect(businessSearchDocs(db, casey)).toEqual([]);
  });

  it("editors' reports and the export are for authors only", () => {
    for (const u of [casey, sam]) {
      expect(() => businessLibrary(db, u, now)).toThrow();
      expect(() => businessInsights(db, u, {}, now)).toThrow();
      expect(() => businessExport(db, u, {}, now)).toThrow();
    }
  });
});

describe("one canonical thread per card", () => {
  it("is the same thread everywhere, however often it's asked for", () => {
    publish(AMIRA);
    const a = threadFor(db, AMIRA, now);
    expect(threadFor(db, AMIRA, later).id).toBe(a.id);
    expect(businessCard(db, casey, AMIRA, now).thread.id).toBe(a.id);
    expect(businessSpace(db, casey, now).threads.find((t) => t.noteId === AMIRA)?.href).toBe(`/business-notes/${AMIRA}#discussion`);
    expect((db.prepare("SELECT COUNT(*) AS n FROM bfn_threads WHERE note_id = ?").get(AMIRA) as { n: number }).n).toBe(1);
    expect(() => db.prepare("INSERT INTO bfn_threads (id, note_id, created_at, updated_at) VALUES ('other', ?, '', '')").run(AMIRA)).toThrow();
    // The seeded illustrative Q&A is there, labelled.
    const q = businessCard(db, casey, AMIRA, now).thread.questions[0];
    expect(q.body).toMatch(/delegate first/);
    expect(q.replies.map((r) => r.labelText)).toEqual(["Contributor experience", "Peer perspective"]);
    expect(q.answered).toBe(true);
  });
});

describe("moderation", () => {
  beforeEach(() => publish(AMIRA));

  it("holds future prices, market splits and identifying detail for review, with a reason the author sees and others don't", () => {
    const price = ask(casey, "We plan to raise our hourly rate to $70 an hour from January. What will everyone else charge?");
    expect(price.route).toBe("held");
    const split = ask(casey, "Should we split the northern suburbs between us so we don't compete? You take the north.");
    expect(split.route).toBe("held");
    const person = ask(casey, "How would you handle Mrs Patel, who lives near the shops?");
    expect(person.route).toBe("held");
    const mine = businessCard(db, casey, AMIRA, now).thread.questions.filter((q) => q.status === "held");
    expect(mine).toHaveLength(3);
    expect(mine.find((q) => q.id === price.id)?.notice).toMatch(/commercially sensitive/);
    // No one else sees a held post.
    db.prepare(
      "INSERT INTO business_planner_access (org_id, user_id, grant_role, granted_by, granted_at) VALUES ('northside-coord', 'riley', 'owner', 'seed', ?)",
    ).run(now.toISOString());
    expect(businessCard(db, riley, AMIRA, now).thread.questions.some((q) => q.status === "held")).toBe(false);
    // The editors see it in their queue, and can approve, decline or leave it.
    expect(businessLibrary(db, jordan, now).community.held.map((p) => p.id)).toEqual(expect.arrayContaining([price.id, split.id, person.id]));
    // The author revises it into a decision-method question, and it's posted.
    const r = businessAction(
      db,
      casey,
      { noteId: AMIRA, action: "revise", postId: price.id, text: "How did you decide when your prices needed reviewing?", checked: true },
      now,
    );
    expect(r).toMatchObject({ route: "posted" });
  });

  it("routes a live incident to the incident process and stores nothing", () => {
    const before = (db.prepare("SELECT COUNT(*) AS n FROM bfn_posts").get() as { n: number }).n;
    const r = ask(casey, "A client fell this morning and is on the floor right now, what do I do?");
    expect(r).toMatchObject({ route: "urgent", href: "/tools/sirs-first-steps" });
    expect(JSON.stringify(r)).toMatch(/no incident report has been lodged/);
    expect((db.prepare("SELECT COUNT(*) AS n FROM bfn_posts").get() as { n: number }).n).toBe(before);
  });

  it("needs the pre-submit prompts confirmed, and a closed thread takes no posts", () => {
    expect(() => businessAction(db, casey, { noteId: AMIRA, action: "ask", text: "How long did the handover take?" }, now)).toThrow(/three questions/);
    businessEditorAction(db, jordan, { id: AMIRA, action: "thread-close", reason: "Policy changed; see the new guide.", replacement: "/tools" }, now);
    expect(() => ask(casey, "How long did the handover take?")).toThrow(/closed/);
  });

  it("screens commercially sensitive terms but lets decision methods through", () => {
    expect(screenText("Let's all charge the same rate for gardening next year.").commercial.length).toBeGreaterThan(0);
    expect(screenText("Can we share our client lists?").commercial.length).toBeGreaterThan(0);
    expect(screenText("We should coordinate our bids for the council tender together.").commercial.length).toBeGreaterThan(0);
    expect(screenText("How did you decide when to review your fees?").commercial).toEqual([]);
    expect(screenText("What did you learn about cash timing in your second year?")).toEqual({ urgent: false, identifying: [], commercial: [] });
  });
});

describe("labelled answers: approved guidance always above peers", () => {
  it("orders an approved annotation first, however many helpful votes a peer reply has", () => {
    const r = (id: string, label: ReplyLabel, helpful: number, at = "2026-11-01") => ({ id, label, helpful, pinned: false, at });
    const ordered = orderReplies([r("peer", "peer", 50), r("contrib", "contributor", 0), r("old", "outdated", 99), r("ok", "approved", 0), r("p2", "peer", 3)]);
    expect(ordered.map((x) => x.id)).toEqual(["ok", "contrib", "peer", "p2", "old"]);
  });

  it("an editor's source-backed annotation is labelled, pinned first, and can't be made without a source", () => {
    publish(AMIRA);
    const q = businessCard(db, casey, AMIRA, now).thread.questions[0];
    // Peers vote for the peer reply.
    const peer = q.replies.find((x) => x.label === "peer")!;
    businessAction(db, casey, { noteId: AMIRA, action: "reply-helpful", postId: peer.id }, now);
    expect(() =>
      businessEditorAction(db, jordan, { id: AMIRA, action: "annotate", postId: q.id, text: "Delegated roles follow the current guide." }, now),
    ).toThrow(/source/);
    businessEditorAction(
      db,
      jordan,
      {
        id: AMIRA,
        action: "annotate",
        postId: q.id,
        text: "Delegated decisions follow the current delegation guide.",
        sourceTitle: "Delegation guide",
        sourceHref: "/tools",
      },
      now,
    );
    const replies = businessCard(db, casey, AMIRA, now).thread.questions[0].replies;
    expect(replies[0]).toMatchObject({ label: "approved", labelText: "Approved Trilogy guidance", by: "Trilogy Care", source: { title: "Delegation guide" } });
    // A peer can't post as approved guidance.
    const mine = businessAction(
      db,
      casey,
      { noteId: AMIRA, action: "reply", parentId: q.id, text: "This is approved, trust me.", checked: true, label: "approved" },
      now,
    ) as {
      card: { thread: { questions: { replies: { mine: boolean; label: string }[] }[] } };
    };
    expect(mine.card.thread.questions[0].replies.find((x) => x.mine)?.label).toBe("peer");
  });
});

describe("contributing, consent and withdrawal", () => {
  const story = {
    hook: "“I thought a local hub would bring the referrals in by itself.”",
    scenario: "We opened a small office and waited. Very little changed for months.",
    note: "A place isn’t a relationship. I should have spent the first months meeting people, not decorating an office.",
    phrase: "Before you sign a lease, list five local people you’ll meet in the first month.",
    consent: { audience: true, attribution: true },
    business: {
      collection: "running",
      stage: "established",
      theme: "home-hub",
      era: "Our fifth year",
      decision: "Whether to open a local hub to grow referrals.",
      believed: "That being visible on the main street would bring people in.",
      tried: "Opening the hub and waiting for walk-ins.",
      failed: "Waiting. The hub was quiet until we went out and met people.",
      toolIds: ["referral"],
      display: "first",
      businessLabel: "Downs Care",
      privateNote: "The landlord is my cousin.",
      consents: { crossFormat: true, syntheticVoice: false },
    },
  };

  it("drafts privately, needs the prompts, records separate consents, and publishes only after the contributor confirms an edit and the checks pass", () => {
    const draft = contributeAction(db, casey, { action: "draft", data: story }, now) as {
      note: { id: string; data: { authorName: string; illustrative: boolean } };
    };
    const id = draft.note.id;
    expect(draft.note.data.authorName).toBe("Casey · Downs Care");
    expect(draft.note.data.illustrative).toBe(false);
    expect(() => contributeAction(db, casey, { action: "submit", id }, now)).toThrow(/three questions/);
    contributeAction(db, casey, { action: "submit", id, checked: true }, now);
    const mine = myBusinessNotes(db, casey, now).notes.find((n) => n.latest.id === id)!;
    expect(mine.latest.state).toBe("submitted");
    expect(mine.consents[0].record).toMatchObject({ textAudience: true, crossFormat: true, syntheticVoice: false, portrait: false, recordedVoice: false });
    // An editor's substantive edit waits for the contributor.
    businessEditorAction(db, jordan, { id, action: "edit", data: { ...story, hook: "“I thought a local office would bring referrals in on its own.”" } }, now);
    expect(myBusinessNotes(db, casey, now).notes.find((n) => n.latest.id === id)!.latest.state).toBe("changes");
    contributeAction(db, casey, { action: "approve-edits", id }, now);
    // Confirmed, but not published: the checks come first.
    expect(myBusinessNotes(db, casey, now).notes.find((n) => n.latest.id === id)!.published).toBeNull();
    publish(id);
    expect(businessDeck(db, casey, {}, now).cards.some((c) => c.id === id)).toBe(true);
    expect(businessCard(db, casey, id, now).card.data.business?.privateNote).toBe("");
    // Declining doesn't touch anyone's learning: there's nothing to complete here.
  });

  it("narrowing a consent takes effect everywhere at once; withdrawing removes the card from the deck, Pocket Deck, search, decks and the Inbox", () => {
    const { note } = contributeAction(db, casey, { action: "draft", data: story }, now) as { note: { id: string } };
    contributeAction(db, casey, { action: "submit", id: note.id, checked: true }, now);
    publish(note.id);
    businessEditorAction(db, jordan, { id: AMIRA, action: "check", step: "editorial", outcome: "pass" }, now);
    const c = course(deck({ selection: "curated", noteIds: [note.id], count: 3 }));
    expect(deckState(db, casey, c.id, "nd", now).cards.some((x) => !("gone" in x) && x.id === note.id)).toBe(true);
    contributeAction(db, casey, { action: "consent", id: note.id, crossFormat: false }, now);
    const fresh = course(deck({ selection: "curated", noteIds: [note.id], count: 3 }));
    expect(deckState(db, casey, fresh.id, "nd", now).cards).toEqual([]);
    expect(() => contributeAction(db, casey, { action: "consent", id: note.id, crossFormat: true }, now)).toThrow(/turn off/);

    businessAction(db, casey, { noteId: note.id, action: "save", on: true }, now);
    contributeAction(db, casey, { action: "withdraw", id: note.id }, later);
    expect(businessDeck(db, casey, {}, later).cards.some((x) => x.id === note.id)).toBe(false);
    expect(() => businessCard(db, casey, note.id, later)).toThrow(/Not found/);
    expect(pocketDeck(db, casey, later).notes.find((x) => x.id === note.id)).toMatchObject({ gone: true });
    expect(businessSearchDocs(db, casey).some((d) => d.href.includes(note.id))).toBe(false);
    expect(threadFor(db, note.id, later).state).toBe("withdrawn");
    expect(
      businessLibrary(db, jordan, later)
        .notes.find((n) => n.latest.id === note.id)
        ?.flags.some((f) => f.kind === "withdrawn"),
    ).toBe(true);
  });
});

describe("stale content", () => {
  it("a published edit is a new version; old links resolve to it with a notice; a flagged card stops being dealt", () => {
    publish(AMIRA);
    businessAction(db, casey, { noteId: AMIRA, action: "save", on: true }, now);
    businessAction(db, casey, { noteId: AMIRA, action: "ask", text: "How long did the two handovers take you?", checked: true }, now);
    businessEditorAction(
      db,
      jordan,
      { id: AMIRA, action: "edit", data: { ...BUSINESS_SEEDS[0].data, phrase: "Pick one decision you still take back, and observe the next two." } },
      later,
    );
    // Readers keep the published version until the new one passes review.
    expect(businessCard(db, casey, AMIRA, later).card.version).toBe(1);
    publish(AMIRA, later);
    const v = businessCard(db, casey, AMIRA, later, "1");
    expect(v.card.version).toBe(2);
    expect(v.updatedFrom).toBe(1);
    expect(v.thread.questions.find((q) => q.mine)?.olderVersion).toBe(true);
    expect(pocketDeck(db, casey, later).notes.find((x) => x.id === AMIRA)).toMatchObject({ updatedSince: true });
    const c = course(deck({ selection: "curated", noteIds: [AMIRA] }));
    businessEditorAction(db, jordan, { id: AMIRA, action: "flag", reason: "The delegation guide changed." }, later);
    expect(businessCard(db, casey, AMIRA, later).card).toMatchObject({ state: "needs_review", canCopy: false });
    expect(deckState(db, casey, c.id, "nd", later).cards).toEqual([]);
  });

  it("a check-in is a dated chapter that keeps the original card", () => {
    publish(AMIRA);
    expect(() => businessEditorAction(db, jordan, { id: MAYA, action: "chapter-publish", number: 1 }, now)).toThrow();
    businessEditorAction(db, jordan, { id: AMIRA, action: "chapter-publish", number: 1 }, now);
    const v = businessCard(db, casey, AMIRA, now);
    expect(v.chapters).toEqual([expect.objectContaining({ number: 1, title: "Eight weeks later", dated: "2026-09-07" })]);
    expect(v.card.data.note).toMatch(/counting the clients I had/);
  });
});

describe("idempotent saves and reactions", () => {
  it("repeating a save, a helpful vote, a reply vote or a question changes nothing", () => {
    publish(AMIRA);
    businessAction(db, casey, { noteId: AMIRA, action: "save", on: true }, now);
    businessAction(db, casey, { noteId: AMIRA, action: "save", on: true }, now);
    expect((db.prepare("SELECT COUNT(*) AS n FROM mentor_note_saves WHERE note_id = ?").get(AMIRA) as { n: number }).n).toBe(1);
    businessAction(db, casey, { noteId: AMIRA, action: "helpful", on: true }, now);
    const h = businessAction(db, casey, { noteId: AMIRA, action: "helpful", on: true }, now) as unknown as { helpful: number };
    expect(h.helpful).toBe(1);
    const q = businessCard(db, casey, AMIRA, now).thread.questions[0];
    const reply = q.replies[0];
    businessAction(db, casey, { noteId: AMIRA, action: "reply-helpful", postId: reply.id }, now);
    businessAction(db, casey, { noteId: AMIRA, action: "reply-helpful", postId: reply.id }, now);
    expect(businessCard(db, casey, AMIRA, now).thread.questions[0].replies.find((r) => r.id === reply.id)?.helpful).toBe(1);
    const a = ask(casey, "Did you change the escalation guide again later?", { key: "retry-key-1" });
    const b = ask(casey, "Did you change the escalation guide again later?", { key: "retry-key-1" });
    expect(b).toMatchObject({ id: a.id, repeated: true });
    businessAction(db, casey, { noteId: AMIRA, action: "flip" }, now);
    businessAction(db, casey, { noteId: AMIRA, action: "flip" }, now);
    expect((db.prepare("SELECT COUNT(*) AS n FROM bfn_events WHERE event = 'business_card_flipped'").get() as { n: number }).n).toBe(1);
  });
});

describe("insights and the export", () => {
  it("suppress small groups and never include post text or private words", () => {
    publish(AMIRA);
    businessAction(db, casey, { noteId: AMIRA, action: "flip" }, now);
    businessAction(db, casey, { noteId: AMIRA, action: "thought", text: "SECRET-FIRST-THOUGHT" }, now);
    ask(casey, "UNIQUE-QUESTION-TEXT: how did you plan the first month?");
    const ins = businessInsights(db, jordan, {}, now);
    expect(ins.funnel.find((f) => f.event === "business_card_flipped")?.people).toBeNull();
    expect(suppress(0)).toBe(0);
    expect(suppress(5)).toBe(5);
    const xlsx = businessExport(db, jordan, {}, now).toString("latin1");
    expect(xlsx.startsWith("PK")).toBe(true);
    // Read every deflated part of the zip and check no private or raw text is there.
    const text: string[] = [];
    const buf = businessExport(db, jordan, {}, now);
    for (let i = 0; i < buf.length - 30; i++) {
      if (buf.readUInt32LE(i) !== 0x04034b50) continue;
      const size = buf.readUInt32LE(i + 18);
      const nameLen = buf.readUInt16LE(i + 26);
      const extra = buf.readUInt16LE(i + 28);
      const start = i + 30 + nameLen + extra;
      text.push(inflateRawSync(buf.subarray(start, start + size)).toString("utf8"));
    }
    const all = text.join("\n");
    expect(all).toContain("Card engagement aggregate");
    expect(all).toContain("Definitions");
    expect(all).not.toContain("SECRET-FIRST-THOUGHT");
    expect(all).not.toContain("UNIQUE-QUESTION-TEXT");
  });

  it("a playbook proposal goes on the Problem desk, citing the questions, and needs existing guidance checked first", () => {
    publish(AMIRA);
    const a = ask(casey, "How did you write the escalation guide for the first hire?");
    expect(() =>
      businessEditorAction(db, jordan, { action: "proposal-create", title: "An escalation guide for a first hire", questionIds: [a.id] }, now),
    ).toThrow(/existing/);
    const r = businessEditorAction(
      db,
      jordan,
      {
        action: "proposal-create",
        title: "An escalation guide for a first hire",
        questionIds: [a.id],
        existingChecked: "Checked Work Tools and the Hiring Runway article: no escalation guide yet.",
        output: "job_aid",
      },
      now,
    ) as unknown as { created: { themeId: string } };
    const theme = db.prepare("SELECT title FROM pd_themes WHERE id = ?").get(r.created.themeId) as { title: string };
    expect(theme.title).toBe("An escalation guide for a first hire");
    const cases = db.prepare("SELECT source, source_ref, summary FROM pd_cases WHERE theme_id = ?").all(r.created.themeId) as {
      source: string;
      source_ref: string;
      summary: string;
    }[];
    expect(cases).toEqual([expect.objectContaining({ source: "community", source_ref: a.id })]);
    expect(cases[0].summary).not.toContain("escalation guide for the first hire");
  });
});
