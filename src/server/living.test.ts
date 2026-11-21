import { strFromU8, unzipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { RETURN_PILOT, RETURN_PILOT_NOTE } from "@/content/livingPilot";
import { storyGate } from "@/lib/livingAssist";
import { reviewHash } from "@/lib/relayConfig";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { createReturnPilot, fieldNotes, livingAction, noteAction, openNote, recordLivingEvent, returnDetail, returnFor, transferSubmitted } from "./living";
import { decisionFor } from "./livingAssist";
import { archiveGuide, authorGuide, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";
import { inbox } from "./notifications";
import { exportRegister, problemAction, themeDetail } from "./problemDesk";
import { createRelayPilot } from "./relayAdmin";
import { signalDetail, signalFigures, signalList } from "./signalRoom";
import { characterHistory } from "./story";

/*
  Living cases on the server (docs/living-cases.md): who is invited back and when, that a note can only arrive
  once, that a learner's own line is theirs alone, that the shared story never moves because of an answer, and that
  the Signal Room keeps cases, contacts, practice and work apart.
*/

let db: Db;
let jordan: User, riley: User, sam: User, alex: User;
let roses = "";
let markets = "";
let slug = "";
const start = new Date("2026-11-01T09:00:00Z");
const days = (n: number, from = start) => new Date(from.getTime() + n * 86_400_000);
const RET = RETURN_PILOT.id;

/** Marks Ava Relay reviewed on every page (a publish check of its own), then publishes. */
function publish(id: string, at: Date) {
  const a = authorGuide(db, jordan, id);
  const doc = structuredClone(a.doc);
  for (const p of doc.pages) if (p.relay) p.relay.reviewed = { by: jordan.id, at: at.toISOString(), hash: reviewHash(doc.relay, p.relay) };
  saveGuideDraft(db, jordan, id, { doc, basedOn: a.savedAt }, at);
  publishGuide(db, jordan, id, "Pilot", at);
}
const answer = (user: User, guideId: string, blockId: string, choiceId: string, at: Date) => {
  const g = readGuide(db, user, authorGuide(db, jordan, guideId).slug);
  const r = recordGuideEvent(db, user, guideId, { event: "decision", revisionId: g.revisionId, blockId, choiceId }, at) as { attempt: number };
  transferSubmitted(db, user, guideId, blockId, r.attempt, at);
  return r;
};
const count = (sql: string, ...args: string[]) => (db.prepare(sql).get(...args) as { n: number }).n;
const notesIn = (user: User, at: Date) => inbox(db, user, at).updates.filter((u) => u.category === "Field note from Ava");

/** The pilot, reviewed: both courses published, the return approved and its note released. */
function release(at = start) {
  livingAction(db, jordan, { action: "save", id: RET, owner: "Partner Enablement", reviewOn: "2027-02-01" }, at);
  livingAction(db, jordan, { action: "approve", id: RET }, at);
  publish(markets, at);
  livingAction(db, jordan, { action: "release-note", id: RET }, at);
}

beforeEach(() => {
  db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users (id, name, email, org_id, role, audience) VALUES ('alex', 'Alex Coordinator', 'alex@example.test', 'trilogy', 'learner', 'coordinator')",
  ).run();
  [jordan, riley, sam, alex] = ["jordan", "riley", "sam", "alex"].map((id) => userById(db, id)!);
  roses = createRelayPilot(db, jordan, start).id;
  publish(roses, start);
  // The Signal Room's samples, so the pilot can link to its theme.
  signalList(db, jordan, start);
  const made = createReturnPilot(db, jordan, start);
  markets = made.guideId;
  slug = authorGuide(db, jordan, markets).slug;
});

describe("the pilot", () => {
  it("is added as drafts: nothing approved, published, released or sent", () => {
    const d = returnDetail(db, jordan, RET, start);
    expect(d.status).toBe("draft");
    expect(d.course).toMatchObject({ status: "draft", published: false });
    expect(d.note.status).toBe("draft");
    // The earlier decision is found in the rose garden course, and the theme is the synthetic sample.
    expect(d.earlier?.id).toBe(roses);
    expect(d.link).toMatchObject({ from_block: "first-question", to_block: "markets-question", from_episode: "ep-roses", to_episode: "ep-markets" });
    expect(d.theme?.id).toBe(RETURN_PILOT.themeId);
    // Dot's possible response is a draft moment: not approved, not placed.
    expect(db.prepare("SELECT status FROM story_moments WHERE id = 'mo-dot-markets'").get()).toEqual({ status: "draft" });
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, start)).toBeNull();
    expect(fieldNotes(db, riley, start).notes).toEqual([]);
    expect(() => createReturnPilot(db, jordan, start)).toThrow(/already here/);
    expect(() => createReturnPilot(db, riley, start)).toThrow();
  });

  it("asks a different question, uses only blocks the Hub has, and gives every one a reason", () => {
    const d = returnDetail(db, jordan, RET, start);
    expect(d.first?.prompt).toBe("What do you do first?");
    expect(d.second?.prompt).toBe("Before you answer either of them, what would you clarify?");
    expect(d.blocks.every((b) => b.known)).toBe(true);
    expect(d.blocks.map((b) => b.type)).toEqual(expect.arrayContaining(["perspectives", "decision", "journal", "confidence"]));
    expect(d.blocks.every((b) => b.placement && b.placement.why.length > 20)).toBe(true);
    // Only the owner and the review date are missing.
    expect(d.problems.blocking).toEqual([]);
    expect(() => livingAction(db, jordan, { action: "approve", id: RET }, start)).toThrow(/owner/);
    // The decision is practice with feedback, and the page says what it can't show.
    const q = d.blocks.find((b) => b.id === "markets-question")!;
    expect(q.evidence).toBe("Practised with feedback");
    expect(q.cannot).toMatch(/not an assessed result/);
  });

  it("maps the episode, marking shared story apart from one learner's practice", () => {
    const d = returnDetail(db, jordan, RET, start);
    expect(d.map.map((m) => [m.key, m.kind])).toEqual([
      ["previous", "canon"],
      ["change", "canon"],
      ["decision", "branch"],
      ["consequence", "branch"],
      ["response", "canon"],
      ["action", "work"],
    ]);
    expect(d.map.find((m) => m.key === "decision")!.blocks.map((b) => b.id)).toEqual(expect.arrayContaining(["markets-question", "dot-and-fiona"]));
    expect(d.map.find((m) => m.key === "previous")!.text).toContain("Dot and the roses");
  });
});

describe("approval", () => {
  it("refuses a return that repeats the first question, gives away what comes later, or writes a choice as shared story", () => {
    const d = returnDetail(db, jordan, RET, start);
    // The first story's own decision as the transfer activity: the same question again.
    livingAction(db, jordan, { action: "save", id: RET, toGuide: roses, toPage: "rose-garden", toBlock: "first-question" }, start);
    expect(returnDetail(db, jordan, RET, start).problems.blocking.join(" ")).toMatch(/worded almost as it was the first time/);
    livingAction(db, jordan, { action: "save", id: RET, toGuide: markets, toPage: "the-markets", toBlock: "markets-question" }, start);
    livingAction(
      db,
      jordan,
      { action: "save", id: RET, data: { ...d.data, changed: "Because you asked her first last time, Dot has decided to give up the ladder." } },
      start,
    );
    expect(returnDetail(db, jordan, RET, start).problems.blocking.join(" ")).toMatch(/as if it followed from a learner’s answer/);
    // Pointing the return at the earlier episode puts "A morning at the markets" later in the story than the page.
    livingAction(db, jordan, { action: "save", id: RET, data: d.data, toEpisode: "ep-roses", fromEpisode: "ep-thursday" }, start);
    const spoiled = returnDetail(db, jordan, RET, start).problems.blocking.join(" ");
    expect(spoiled).toMatch(/gives away a later episode, “A morning at the markets”/);
    // And a proposed episode is never canon.
    livingAction(db, jordan, { action: "save", id: RET, toEpisode: "ep-invoice" }, start);
    expect(returnDetail(db, jordan, RET, start).problems.blocking.join(" ")).toMatch(/proposed event/);
    expect(() => livingAction(db, jordan, { action: "approve", id: RET }, start)).toThrow(/Not yet/);
  });

  it("pins what learners get: later edits wait for another approval", () => {
    release();
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, start)!.recap).toContain("In spring");
    const d = returnDetail(db, jordan, RET, start);
    livingAction(
      db,
      jordan,
      { action: "save", id: RET, data: { ...d.data, recap: "A rewritten recap that nobody has approved yet, long enough to pass." } },
      days(1),
    );
    const after = returnDetail(db, jordan, RET, days(1));
    expect(after.approved).toMatchObject({ changed: true, characterRevision: 1 });
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, days(1))!.recap).toContain("In spring");
    livingAction(db, jordan, { action: "approve", id: RET }, days(2));
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, days(2))!.recap).toContain("A rewritten recap");
  });

  it("releases a note only for an approved return with a published page and a linked earlier activity", () => {
    expect(() => livingAction(db, jordan, { action: "release-note", id: RET }, start)).toThrow(/Approve the return first/);
    livingAction(db, jordan, { action: "save", id: RET, owner: "Partner Enablement", reviewOn: "2027-02-01" }, start);
    livingAction(db, jordan, { action: "approve", id: RET }, start);
    expect(() => livingAction(db, jordan, { action: "release-note", id: RET }, start)).toThrow(/Publish the page/);
    publish(markets, start);
    // A hook that could give away an answer on a shared screen is refused.
    livingAction(
      db,
      jordan,
      { action: "save-note", id: RET, data: { ...RETURN_PILOT_NOTE, hook: "Last time you chose to ask Dot first. See what happens next." } },
      start,
    );
    expect(() => livingAction(db, jordan, { action: "release-note", id: RET }, start)).toThrow(/learner’s own answer/);
    livingAction(db, jordan, { action: "save-note", id: RET, data: RETURN_PILOT_NOTE }, start);
    livingAction(db, jordan, { action: "release-note", id: RET }, start);
    expect(returnDetail(db, jordan, RET, start).note.status).toBe("live");
    expect(() => livingAction(db, riley, { action: "release-note", id: RET }, start)).toThrow();
  });
});

describe("opening a return", () => {
  beforeEach(() => release());

  it("reads on its own for someone new, and adds a line only for the learner whose answer it is", () => {
    answer(riley, roses, "first-question", "offer-gardener", days(1));
    const mine = returnFor(db, riley, { guide: slug, page: "the-markets" }, days(20))!;
    expect(mine.returning).toBe(true);
    expect(mine.mine).toBe("Last time you began with an offer of help. Fiona has made one here. What would you want to know before it’s accepted?");
    expect(mine.earlier).toEqual({ title: "Dot and the roses", href: expect.stringContaining("/rose-garden") });
    // Alex never answered the first story: the same page, a neutral recap, and nothing of Riley's.
    const fresh = returnFor(db, alex, { guide: slug, page: "the-markets" }, days(20))!;
    expect(fresh).toMatchObject({ returning: false, mine: null, recap: mine.recap, changed: mine.changed, decide: mine.decide });
    expect(JSON.stringify(fresh)).not.toContain("offer of help");
    // A page that isn't a return has no opening.
    expect(returnFor(db, riley, { guide: authorGuide(db, jordan, roses).slug, page: "rose-garden" }, days(20))).toBeNull();
  });

  it("uses the first answer, and drops the line when the earlier course is no longer theirs to open", () => {
    answer(riley, roses, "first-question", "ladder-goes", days(1));
    answer(riley, roses, "first-question", "ask-dot", days(1.1));
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, days(3))!.mine).toMatch(/started from Fiona’s concern/);
    archiveGuide(db, jordan, roses, days(4));
    const after = returnFor(db, riley, { guide: slug, page: "the-markets" }, days(5))!;
    expect(after).toMatchObject({ mine: null, returning: false, earlier: null });
  });

  it("is closed to anyone the course isn't shared with", () => {
    // Sam is a Care Partner; the course is for coordinators.
    expect(returnFor(db, sam, { guide: slug, page: "the-markets" }, days(1))).toBeNull();
    expect(() => recordLivingEvent(db, sam, { event: "return_episode_opened", returnId: RET, key: "abcdefgh1" }, days(1))).toThrow();
  });

  it("leaves the shared story exactly as it was, whatever anyone chooses", () => {
    const canon = () => JSON.stringify(db.prepare("SELECT id, title, summary, changes, status, seq FROM story_episodes ORDER BY id").all());
    const profile = () => JSON.stringify(db.prepare("SELECT character_id, number, profile FROM character_revisions ORDER BY character_id, number").all());
    const before = [canon(), profile()];
    const story = () => characterHistory(db, alex, "dot", { episode: "ep-markets" }, days(30));
    const told = JSON.stringify(story());
    answer(riley, roses, "first-question", "ladder-goes", days(1));
    answer(riley, markets, "markets-question", "accept-offer", days(16));
    answer(riley, markets, "markets-question", "what-it-gives", days(16.1));
    expect([canon(), profile()]).toEqual(before);
    // Another learner's page, and Dot's history as they see it, are what they were.
    expect(JSON.stringify(story())).toBe(told);
    expect(returnFor(db, alex, { guide: slug, page: "the-markets" }, days(30))!.changed).toContain("Saturday markets");
    // The approved return itself hasn't moved either.
    expect(returnDetail(db, jordan, RET, days(30)).approved?.changed).toBe(false);
  });

  it("records an opening, the activity and each submitted answer once", () => {
    const open = () => recordLivingEvent(db, riley, { event: "return_episode_opened", returnId: RET, key: "k-1234567" }, days(1));
    expect(open().recorded).toBe(true);
    // A reload, with a new key from the page: still one opening for this version.
    expect(recordLivingEvent(db, riley, { event: "return_episode_opened", returnId: RET, key: "k-7654321" }, days(1)).recorded).toBe(false);
    answer(riley, markets, "markets-question", "how-far", days(2));
    transferSubmitted(db, riley, markets, "markets-question", 1, days(2));
    answer(riley, markets, "markets-question", "what-it-gives", days(2.1));
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'return_episode_opened'")).toBe(1);
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'transfer_response_submitted'")).toBe(2);
    // The event holds that it happened. What was chosen stays in the Magazine's own record.
    expect(JSON.stringify(db.prepare("SELECT * FROM living_events").all())).not.toMatch(/how-far|what-it-gives/);
    expect(() => recordLivingEvent(db, riley, { event: "field_note_delivered", returnId: RET, key: "k-1234567" }, days(1))).toThrow();
  });
});

describe("Field Notes", () => {
  beforeEach(() => release());

  it("arrives once, about two weeks after the first decision, and only for people who answered it", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    // Not yet: the delay runs from their answer.
    expect(fieldNotes(db, riley, days(10)).notes).toEqual([]);
    expect(notesIn(riley, days(10))).toEqual([]);
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_eligible'")).toBe(1);
    const got = fieldNotes(db, riley, days(15.5));
    expect(got.notes).toHaveLength(1);
    expect(got.notes[0]).toMatchObject({ state: "new", reason: "Dot has a new decision", optional: true, minutes: 5, title: "Dot at the markets" });
    expect(got.notes[0].earlier).toEqual({ title: "Dot and the roses", href: expect.any(String) });
    // Alex never answered the first story; Sam can't open the course.
    expect(fieldNotes(db, alex, days(40)).notes).toEqual([]);
    expect(fieldNotes(db, sam, days(40)).notes).toEqual([]);
    // Asked for again and again (a reload, a second tab, the Inbox): one delivery, one Inbox line, one event each.
    for (let i = 0; i < 4; i++) fieldNotes(db, riley, days(16 + i));
    expect(count("SELECT COUNT(*) n FROM field_note_deliveries WHERE user_id = 'riley'")).toBe(1);
    expect(notesIn(riley, days(20))).toHaveLength(1);
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_delivered'")).toBe(1);
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_eligible'")).toBe(1);
    // The Inbox line says nothing of what they answered.
    expect(notesIn(riley, days(20))[0]).toMatchObject({ title: "Dot has a new decision", body: RETURN_PILOT_NOTE.hook });
  });

  it("opens to the page, marks it read, and never touches a completion", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    const id = fieldNotes(db, riley, days(16)).notes[0].id;
    const opened = openNote(db, riley, id, days(16));
    expect(opened).toEqual({ state: "open", href: `/magazine/${slug}/the-markets?note=${id}` });
    expect(fieldNotes(db, riley, days(16)).notes[0].state).toBe("read");
    expect(notesIn(riley, days(16))[0].read).toBe(true);
    openNote(db, riley, id, days(17));
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_opened'")).toBe(1);
    expect(count("SELECT COUNT(*) n FROM magazine_completions")).toBe(0);
    // Someone else's note looks the same as no note.
    expect(openNote(db, alex, id, days(17))).toEqual({ state: "none", href: "/magazine" });
    expect(() => noteAction(db, alex, { action: "dismiss", id }, days(17))).toThrow(/isn’t here/);
  });

  it("can be snoozed or dismissed, and the story stays findable", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    const id = fieldNotes(db, riley, days(16)).notes[0].id;
    noteAction(db, riley, { action: "snooze", id }, days(16));
    expect(fieldNotes(db, riley, days(18)).notes).toEqual([]);
    expect(notesIn(riley, days(18))).toEqual([]);
    // Back a week later, as new.
    expect(fieldNotes(db, riley, days(24)).notes.map((n) => n.state)).toEqual(["new"]);
    expect(notesIn(riley, days(24))).toHaveLength(1);
    noteAction(db, riley, { action: "dismiss", id }, days(24));
    expect(fieldNotes(db, riley, days(25)).notes).toEqual([]);
    expect(notesIn(riley, days(25))).toEqual([]);
    // Dismissing is about the note. The page opens as it always did, and Dot's history still lists it.
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, days(25))).not.toBeNull();
    expect(readGuide(db, riley, slug).title).toBe("Dot at the markets");
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_dismissed'")).toBe(1);
    expect(count("SELECT COUNT(*) n FROM field_note_deliveries WHERE user_id = 'riley'")).toBe(1);
  });

  it("isn't sent to someone who has already been back", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    answer(riley, markets, "markets-question", "what-it-gives", days(5));
    expect(fieldNotes(db, riley, days(30)).notes).toEqual([]);
    expect(notesIn(riley, days(30))).toEqual([]);
    expect(count("SELECT COUNT(*) n FROM living_events WHERE event = 'field_note_delivered'")).toBe(0);
  });

  it("is taken back when the note or the page is withdrawn, or the person's role changes", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    answer(alex, roses, "first-question", "ask-dot", days(1));
    const id = fieldNotes(db, riley, days(16)).notes[0].id;
    fieldNotes(db, alex, days(16));
    // Riley moves to a role the course isn't shared with: the note and its Inbox line go, and its link no longer opens.
    db.prepare("UPDATE users SET audience = 'partner' WHERE id = 'riley'").run();
    const moved = userById(db, "riley")!;
    expect(fieldNotes(db, moved, days(17)).notes).toEqual([]);
    expect(notesIn(moved, days(17))).toEqual([]);
    expect(openNote(db, moved, id, days(17))).toEqual({ state: "unavailable", href: "/magazine" });
    expect(returnFor(db, moved, { guide: slug, page: "the-markets" }, days(17))).toBeNull();
    // Their record that it once arrived is kept.
    expect(count("SELECT COUNT(*) n FROM field_note_deliveries WHERE user_id = 'riley' AND delivered_at IS NOT NULL")).toBe(1);
    // The course is archived: Alex's note goes too, with a clear state if the old link is followed.
    archiveGuide(db, jordan, markets, days(18));
    expect(fieldNotes(db, alex, days(19)).notes).toEqual([]);
    expect(notesIn(alex, days(19))).toEqual([]);
    expect(openNote(db, alex, id, days(19)).state).toBe("unavailable");
  });

  it("goes with the return when that is withdrawn, and needs a reason", () => {
    answer(riley, roses, "first-question", "ask-dot", days(1));
    fieldNotes(db, riley, days(16));
    expect(() => livingAction(db, jordan, { action: "withdraw", id: RET, reason: "no" }, days(17))).toThrow(/why/);
    livingAction(db, jordan, { action: "withdraw", id: RET, reason: "A source error was found in the feedback." }, days(17));
    expect(fieldNotes(db, riley, days(18)).notes).toEqual([]);
    expect(notesIn(riley, days(18))).toEqual([]);
    expect(returnFor(db, riley, { guide: slug, page: "the-markets" }, days(18))).toBeNull();
    expect(returnDetail(db, jordan, RET, days(18)).note).toMatchObject({ status: "withdrawn", withdrawnReason: "A source error was found in the feedback." });
    // The page itself is still a published Magazine page, and what Riley did is untouched.
    expect(readGuide(db, riley, slug).title).toBe("Dot at the markets");
    expect(count("SELECT COUNT(*) n FROM magazine_events WHERE user_id = 'riley' AND event = 'decision.answered'")).toBe(1);
    expect(() => livingAction(db, jordan, { action: "delete", id: RET }, days(18))).toThrow(/kept/);
  });
});

describe("the Signal Room", () => {
  it("shows one case raised three times as one case and three contacts, and keeps a separate case separate", () => {
    const d = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-11" }, start);
    expect(d.theme.sample).toBe(true);
    // Five real cases and a false match: 3 + 2 + 1 + 1 + 1 contacts.
    expect(d.counts).toMatchObject({ cases: 5, contactEvents: 8, repeatContacts: 2, updates: 1, parties: 2, casesWithoutParty: 2 });
    expect(d.falseMatches).toBe(1);
    const thrice = d.returned.find((k) => k.ref === "SAMPLE-CMP-3101")!;
    expect(thrice).toMatchObject({ contacts: 3, repeats: 2, updates: 0, party: "Partner business A" });
    // The same business's other case is its own case, not an update to the first.
    expect(d.returned.some((k) => k.ref === "SAMPLE-CMP-3266")).toBe(false);
    expect(d.trend.find((t) => t.bucket === "2026-10")).toMatchObject({ newCases: 1, contacts: 1, repeats: 0 });
    expect(d.trend.find((t) => t.bucket === "2026-07")).toMatchObject({ newCases: 1, repeats: 1, contacts: 3 });
    // By channel: complaints alone.
    const complaints = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-11", source: "complaint" }, start);
    expect(complaints.counts).toMatchObject({ cases: 3, contactEvents: 6 });
    expect(() => signalDetail(db, riley, RETURN_PILOT.themeId, {}, start)).toThrow();
  });

  it("adds a repeat contact to a case without making another case, and refuses a party that could identify someone", () => {
    const before = themeDetail(db, jordan, RETURN_PILOT.themeId, {}, start);
    const one = before.cases.find((c) => c.sourceRef === "SAMPLE-CMP-3266")!;
    problemAction(db, jordan, { action: "add-event", caseId: one.id, kind: "repeat", on: "2026-10-20", note: "Back again." }, start);
    const after = themeDetail(db, jordan, RETURN_PILOT.themeId, {}, start);
    expect(after.counts.cases).toBe(before.counts.cases);
    expect(after.counts.contactEvents).toBe(before.counts.contactEvents + 1);
    expect(after.counts.repeatContacts).toBe(before.counts.repeatContacts + 1);
    expect(() => problemAction(db, jordan, { action: "case-party", caseId: one.id, party: "jo@example.com" }, start)).toThrow(/de-identified/);
    expect(() => problemAction(db, jordan, { action: "case-party", caseId: one.id, party: "Account 4471902" }, start)).toThrow(/de-identified/);
    problemAction(db, jordan, { action: "case-party", caseId: one.id, party: "Partner business D" }, start);
    expect(themeDetail(db, jordan, RETURN_PILOT.themeId, {}, start).counts.parties).toBe(3);
  });

  it("keeps questions by verified theme, with what nobody has grouped shown as unknown", () => {
    const d = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-11" }, start);
    const mine = d.questions.series.find((s) => s.role === "this")!;
    // A community question in August and a webinar question in September.
    expect(mine.total).toBe(2);
    expect(d.questions.series.length).toBeLessThanOrEqual(4);
    expect(d.questions.series.map((s) => s.role)).toEqual([...new Set(d.questions.series.map((s) => s.role))]);
  });

  it("reads learning from the Hub's records by version, by route, and apart from the work measure", () => {
    release();
    for (const u of [riley, alex]) answer(u, roses, "first-question", "ask-dot", days(1));
    answer(riley, markets, "markets-question", "how-far", days(16));
    answer(riley, markets, "markets-question", "what-it-gives", days(16.1));
    // Sam is moved into the audience and answers the return without the first story.
    db.prepare("UPDATE users SET audience = 'coordinator' WHERE id = 'sam'").run();
    answer(userById(db, "sam")!, markets, "markets-question", "what-it-gives", days(17));
    const d = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-12" }, days(30));
    const ret = d.learning.find((l) => l.which === "return")!;
    expect(ret.versions).toHaveLength(1);
    expect(ret.versions[0]).toMatchObject({
      revision: 1,
      answered: 2,
      retried: 1,
      first: { best: 1, acceptable: 1, risky: 0 },
      latest: { best: 2, acceptable: 0, risky: 0 },
      thin: true,
    });
    expect(d.learning.find((l) => l.which === "first")!.versions[0]).toMatchObject({ answered: 2, first: { best: 2 } });
    const t = d.transfer[0];
    expect(t.versions[0].cohorts.returned).toMatchObject({ n: 1, first: { acceptable: 1 }, medianDays: 15 });
    expect(t.versions[0].cohorts.fresh).toMatchObject({ n: 1, first: { best: 1 }, medianDays: null });
    // Alex answered the first and hasn't come back.
    expect(t).toMatchObject({ answeredEarlier: 2, firstOnly: 1 });
    // The work measure is the owner's typed figures, with its own definition, and nothing learned is mixed into it.
    expect(d.work.map((m) => m.bucket)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(d.work.at(-1)).toMatchObject({ numerator: 22, denominator: 428, rate: 5.1 });
    expect(d.response.measure.owner).toBe("Quality lead (fictional)");
    expect(d.response.competing).toContain("new plan-change form");
    // Every material change is on the timeline, in date order, whoever owned it.
    expect(d.timeline.map((x) => x.kind)).toEqual(
      expect.arrayContaining([
        "Targeted communication",
        "Learning",
        "Portal or product change",
        "Manager coaching",
        "Learning release",
        "Return approved",
        "Field Note released",
      ]),
    );
    expect(d.timeline.map((x) => x.on)).toEqual([...d.timeline.map((x) => x.on)].sort());
    // By role: nobody is staff.
    const staff = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-12", audience: "staff" }, days(30));
    expect(staff.learning.find((l) => l.which === "return")!.versions[0].answered).toBe(0);
    // What a drafted summary may see: counts only.
    const shown = signalFigures(d);
    expect(shown).toContain("5 unique cases, 8 contacts");
    expect(shown).not.toMatch(/Partner business|SAMPLE-CMP|riley|alex/i);
  });

  it("starts a new series when the question changes, and never adds the two together", () => {
    release();
    answer(riley, markets, "markets-question", "what-it-gives", days(1));
    const a = authorGuide(db, jordan, markets);
    const doc = structuredClone(a.doc);
    const block = doc.pages[0].sections.flatMap((s) => s.blocks).find((b) => b.id === "markets-question")!;
    if (block.type === "decision") block.prompt = "Fiona has rung again about Saturday. What do you want to understand first?";
    for (const p of doc.pages) if (p.relay) p.relay.reviewed = { by: jordan.id, at: days(2).toISOString(), hash: reviewHash(doc.relay, p.relay) };
    saveGuideDraft(db, jordan, markets, { doc, basedOn: a.savedAt }, days(2));
    publishGuide(db, jordan, markets, "A reworded question", days(2), { moveLearners: true });
    answer(alex, markets, "markets-question", "accept-offer", days(3));
    const d = signalDetail(db, jordan, RETURN_PILOT.themeId, { from: "2026-06", to: "2026-12" }, days(5));
    const ret = d.learning.find((l) => l.which === "return")!;
    expect(ret.versions.map((v) => [v.revision, v.answered])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(ret.series).toHaveLength(2);
    expect(ret.series[0].rubric).not.toBe(ret.series[1].rubric);
    expect(d.transfer[0].series).toHaveLength(2);
    // The author is told the published question is no longer the one that was approved.
    expect(returnDetail(db, jordan, RET, days(5)).questionMoved).toBe(true);
  });

  it("says so when there is no work measure, and proposes no story where the fix isn't learning", () => {
    const d = signalDetail(db, jordan, "theme-contact-on-file", {}, start);
    expect(d.work).toEqual([]);
    expect(d.returns).toEqual([]);
    expect(d.response.learning).toBe("No learning item");
    expect(signalFigures(d)).toContain("no linked work measure yet");
    const gate = storyGate(decisionFor(db, "theme-contact-on-file"));
    expect(gate).toMatchObject({ ok: false });
    expect(!gate.ok && gate.reason).toMatch(/can’t change/);
    // The pilot's theme is one a story can answer.
    expect(storyGate(decisionFor(db, RETURN_PILOT.themeId))).toEqual({ ok: true });
  });

  it("records a review with its interpretation, can end in no further training, and reopens without rewriting it", () => {
    const id = RETURN_PILOT.themeId;
    problemAction(
      db,
      jordan,
      {
        action: "review",
        id,
        decision: "process",
        interpretation: "mixed",
        decidedOn: "2026-11-01",
        evidence: "Reversals fell in October, the month the Portal form went live. Too few people have answered the return to read anything from it.",
        competing: "The new plan-change form asks for the person’s own words.",
        nextAction: "No further training. Keep the form and review in February.",
      },
      start,
    );
    const first = signalDetail(db, jordan, id, {}, days(1));
    expect(first.reviews[0]).toMatchObject({
      decision: "process",
      interpretation: "mixed",
      nextAction: "No further training. Keep the form and review in February.",
    });
    expect(first.sinceReview).toBe(0);
    // A repeat contact after the review: the decision can be looked at again.
    const kase = themeDetail(db, jordan, id, {}, start).cases.find((c) => c.sourceRef === "SAMPLE-CMP-3101")!;
    problemAction(db, jordan, { action: "add-event", caseId: kase.id, kind: "repeat", on: "2026-11-10", note: "Raised again." }, days(10));
    const again = signalDetail(db, jordan, id, {}, days(11));
    expect(again.sinceReview).toBe(1);
    expect(() => problemAction(db, jordan, { action: "reopen-decision", id, reason: "x" }, days(11))).toThrow();
    problemAction(db, jordan, { action: "reopen-decision", id, reason: "A fourth contact about the same case." }, days(11));
    const reopened = signalDetail(db, jordan, id, {}, days(12));
    expect(reopened.theme.status).toBe("investigate");
    expect(reopened.response.status).toBe("draft");
    // The earlier review is history: still there, word for word.
    expect(reopened.reviews).toHaveLength(1);
    expect(reopened.reviews[0].evidence).toBe(first.reviews[0].evidence);
    expect(signalList(db, jordan, days(12)).verified.find((t) => t.id === id)!.latest).toMatchObject({ decision: "process", interpretation: "mixed" });
  });

  it("exports the decision, the return, its reasons and the evidence, without a case narrative, a learner or a source reference", () => {
    release();
    answer(riley, roses, "first-question", "ask-dot", days(1));
    answer(riley, markets, "markets-question", "what-it-gives", days(16));
    const out = exportRegister(db, jordan, { from: "2026-06", to: "2026-12" }, days(30));
    const files = unzipSync(new Uint8Array(out.buffer));
    const book = strFromU8(files["xl/workbook.xml"]);
    for (const name of ["Signals", "Returns and notes", "Block reasons", "Learning evidence", "Reviews", "Data notes"]) expect(book).toContain(name);
    const all = Object.entries(files)
      .filter(([k]) => k.endsWith(".xml"))
      .map(([, v]) => strFromU8(v))
      .join("\n");
    expect(all).toContain("Dot at the markets");
    expect(all).toContain("Repeat contacts");
    expect(all).toContain("Fewer than 10: not shown");
    expect(all).toContain("Partner business A");
    // Jordan is a superadmin in the demo data, so the reference is shown to them and said to be.
    const superadmin = Boolean(jordan.superadmin);
    expect(all.includes("SAMPLE-CMP-3101")).toBe(superadmin);
    if (!superadmin) expect(all).toContain("Withheld");
    // No case summary, no learner, and nothing a learner chose by name.
    expect(all).not.toContain("weekly outing was replaced");
    expect(all).not.toMatch(/riley@|Riley/);
    // Someone who isn't a superadmin never gets the reference.
    const author = { ...jordan, superadmin: 0 } as User;
    const plain = Object.entries(unzipSync(new Uint8Array(exportRegister(db, author, { from: "2026-06", to: "2026-12" }, days(30)).buffer)))
      .filter(([k]) => k.endsWith(".xml"))
      .map(([, v]) => strFromU8(v))
      .join("\n");
    expect(plain).not.toContain("SAMPLE-CMP-3101");
    expect(plain).toContain("Withheld");
    expect(() => exportRegister(db, riley, {}, days(30))).toThrow();
  });
});
