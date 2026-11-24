import { beforeEach, describe, expect, it } from "vitest";
import { SEED_SNIPPETS } from "@/content/playbooks";
import { lessons, type Lesson } from "@/content/lessons";
import { blankLesson } from "@/content/blankLesson";
import { resources } from "@/content/resources";
import { stories } from "@/content/stories";
import { ordered } from "@/lib/lessonGraph";
import { AID_TEMPLATES } from "@/lib/playbook";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import {
  aidAdminAction,
  aidReport,
  aidsForTopic,
  aidViewed,
  clientAidEvent,
  ensurePassageKinds,
  favouriteAction,
  favouriteFor,
  favouritesList,
  normText,
  pageMarks,
  savePassage,
} from "./favourites";
import { createLesson, deleteLesson, publishLesson, saveDraft } from "./authoredLessons";
import { saveStory, setStoryStatus } from "./stories";
import { archiveGuide, authorGuide, createGuide, publishGuide, readGuide, saveGuideDraft } from "./magazine";
import { askLead, playbookAction, playbookLibrary, playbookList, resolveSnippet, toggleSaved } from "./playbooks";
import { search } from "./search";

/*
  Job Aids, Highlights and Favourites: one governed aid everywhere, one private list per person, and a saved
  passage that is always read against its source again before it's shown.
*/

let db: Db;
let jordan: User, riley: User, sam: User, casey: User;
const now = new Date("2026-11-21T00:00:00Z");
const later = (days: number) => new Date(now.getTime() + days * 86_400_000);
const RATE = "invoice-rate-check";
const ASK = "ask-before-changing-the-plan";
const act = (input: Record<string, unknown>, at = now) => playbookAction(db, jordan, input, at);
function release(id: string, extra: Record<string, unknown> = {}, at = now) {
  const seed = SEED_SNIPPETS.find((s) => s.id === id)!.release;
  act(
    {
      action: "save-release",
      id,
      data: { ...seed, effectiveOn: "2026-11-01", reviewBy: "2027-05-20", approvals: { owner: "Finance lead", clinical: "", quality: "" }, ...extra },
    },
    at,
  );
  act({ action: "submit", id }, at);
  return act({ action: "approve", id }, at);
}
const contacts = () =>
  act({ action: "save-contact", key: "finance-support", routes: { partner: "Finance queue", coordinator: "Finance queue", staff: "Finance queue" } });
type View = Extract<ReturnType<typeof resolveSnippet>, { permitted: true }>;
const view = (u: User, id: string, at = now) => resolveSnippet(db, u, id, at) as View;
const list = (u: User, input: Record<string, unknown> = {}, at = now) => favouritesList(db, u, input, at);

const SENTENCE = "Compare the service, the date, the unit and the rate on each invoice line with the current agreement.";
/** A published guide for coordinators with one passage worth saving. Returns what a reader has open. */
function guide(body = `Before you approve an invoice, slow down. **${SENTENCE}** If something differs, pause.`) {
  const doc = {
    schema: 2,
    pages: [
      {
        id: "p1",
        title: "Checking an invoice",
        purpose: "",
        template: "blank",
        kind: "content",
        required: true,
        allActivities: false,
        sections: [
          { id: "s1", title: "Before you approve", blocks: [{ id: "b1", type: "text", body }] },
          {
            id: "s2",
            title: "Afterwards",
            blocks: [{ id: "b2", type: "text", body: "Keep a note of what you queried and when you expect an answer back from the supplier." }],
          },
        ],
      },
    ],
  };
  const c = createGuide(db, jordan, { title: "Invoice guide", standfirst: "A short guide.", audience: ["coordinator"], completion: "reference", doc }, now);
  publishGuide(db, jordan, c.id, "First", now);
  const r = readGuide(db, riley, c.id);
  return { id: c.id, slug: r.slug, revisionId: r.revisionId };
}
function republish(id: string, body: string, at: Date) {
  const a = authorGuide(db, jordan, id);
  const doc = structuredClone(a.doc);
  const b = doc.pages[0].sections[0].blocks[0];
  if (b.type === "text") b.body = body;
  saveGuideDraft(db, jordan, id, { doc, basedOn: a.savedAt }, at);
  publishGuide(db, jordan, id, "Again", at);
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam, casey] = ["jordan", "riley", "sam", "casey"].map((id) => userById(db, id)!);
});

describe("a playbook is the Hub's Job Aid", () => {
  it("has a template, a trigger and a quick action, and can't be released without saying when to use it", () => {
    expect(playbookList(db, riley, now).playbooks).toEqual([]);
    contacts();
    release(RATE);
    const v = view(riley, RATE);
    expect(v).toMatchObject({
      title: "Invoice rate check",
      template: "checklist",
      trigger: "You are about to approve a supplier invoice.",
      minutes: 2,
      readiness: "current",
    });
    expect(v.groups).toEqual(AID_TEMPLATES.checklist.groups);
    expect(v.release).toMatchObject({
      number: 1,
      quick: expect.stringContaining("Open the current agreement"),
      example: expect.stringContaining("made-up invoice"),
    });
    release(ASK);
    expect(view(riley, ASK)).toMatchObject({ template: "conversation", groups: { now: "Ask", then: "Confirm", exception: "Follow up" } });
    // The pilot aids are for coordinators and staff: a Care Partner doesn't get them, by name or at all.
    expect(resolveSnippet(db, sam, RATE, now)).toMatchObject({ permitted: false, title: "" });
    expect(playbookList(db, sam, now).playbooks.map((p) => p!.id)).not.toContain(RATE);
    // No trigger, no release.
    const made = act({ action: "save-snippet", newId: "no-trigger", data: { ...SEED_SNIPPETS.find((s) => s.id === RATE)!.data, trigger: "" } }) as {
      id: string;
    };
    const seed = SEED_SNIPPETS.find((s) => s.id === RATE)!.release;
    act({
      action: "save-release",
      id: made.id,
      data: { ...seed, effectiveOn: "2026-11-01", reviewBy: "2027-05-20", approvals: { owner: "Finance lead", clinical: "", quality: "" } },
    });
    act({ action: "submit", id: made.id });
    expect(() => act({ action: "approve", id: made.id })).toThrow();
    expect(playbookLibrary(db, jordan, now).snippets.find((x) => x.id === made.id)!.problems).toEqual([
      "Say when to use it: the task the worker is doing, in their words.",
    ]);
    expect(resolveSnippet(db, riley, made.id, now)).toMatchObject({ release: null, readiness: "fallback" });
  });

  it("is found by its task in site search, only by people whose role may open it", () => {
    contacts();
    // Nothing shows until it's approved: not in Work Tools, and not in search.
    expect(search(db, riley, "invoice rate").some((r) => r.id === `aid:${RATE}`)).toBe(false);
    release(RATE);
    const hit = search(db, riley, "approve a supplier invoice").find((r) => r.id === `aid:${RATE}`)!;
    expect(hit).toMatchObject({ href: `/tools/${RATE}`, meta: "Work tool · Checklist" });
    expect(search(db, riley, "pause the approval").some((r) => r.id === `aid:${RATE}`)).toBe(true);
    expect(search(db, sam, "invoice rate").some((r) => r.id === `aid:${RATE}`)).toBe(false);
  });
});

describe("saving a whole Job Aid", () => {
  beforeEach(() => {
    contacts();
    release(RATE);
  });

  it("is one save however often it's pressed, private to the person, and removed by a second press", () => {
    expect(toggleSaved(db, riley, RATE, true, now)).toEqual({ saved: true, first: true });
    expect(toggleSaved(db, riley, RATE, true, now)).toEqual({ saved: true, first: false });
    expect((db.prepare("SELECT COUNT(*) n FROM favourites").get() as { n: number }).n).toBe(1);
    expect(view(riley, RATE).saved).toBe(true);
    const mine = list(riley);
    expect(mine.counts).toEqual({ all: 1, job_aid: 1, passage: 0 });
    expect(mine.items[0]).toMatchObject({
      kind: "job_aid",
      title: "Invoice rate check",
      detail: "Use when: You are about to approve a supplier invoice.",
      label: "Checklist",
      state: "current",
      href: `/tools/${RATE}?from=favourites`,
    });
    // Nobody else's list has it, and its id opens nothing for anyone else.
    expect(list(casey).items).toEqual([]);
    expect(() => favouriteFor(db, casey, mine.items[0].id, now)).toThrow(/isn’t here/);
    expect(() => favouriteAction(db, casey, { action: "remove", id: mine.items[0].id }, now)).toThrow(/isn’t here/);
    // A Care Partner can't save an aid that isn't theirs.
    expect(() => toggleSaved(db, sam, RATE, true, now)).toThrow(/isn’t shared with your role/);
    expect(toggleSaved(db, riley, RATE, false, now)).toEqual({ saved: false, first: false });
    expect(list(riley).items).toEqual([]);
    expect(db.prepare("SELECT event FROM aid_events ORDER BY id").all()).toEqual([{ event: "job_aid_favourited" }, { event: "job_aid_unfavourited" }]);
  });

  it("opens at the current release, says once when it's been updated, and shows nothing of a withdrawn aid", () => {
    toggleSaved(db, riley, RATE, true, now);
    release(RATE, { changeSummary: "Adds the unit check.", quick: "Open the agreement and compare every line." }, later(3));
    expect(list(riley, {}, later(3)).items[0]).toMatchObject({ state: "updated", note: "Updated: release 2 is the current one." });
    aidViewed(db, riley, RATE, { from: "favourites", key: "view-0001" }, later(3));
    aidViewed(db, riley, RATE, { from: "favourites", key: "view-0001" }, later(3));
    expect(list(riley, {}, later(3)).items[0]).toMatchObject({ state: "current", note: "Release 2 · Finance" });
    expect((db.prepare("SELECT COUNT(*) n FROM aid_events WHERE event = 'job_aid_update_seen'").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) n FROM aid_events WHERE event = 'job_aid_viewed'").get() as { n: number }).n).toBe(1);
    // Withdrawn for safety: the favourite stays, the steps don't.
    act({ action: "withdraw", id: RATE, reason: "The query process has changed." }, later(4));
    const gone = list(riley, {}, later(4)).items[0];
    expect(gone).toMatchObject({ state: "unavailable", quote: "", detail: "" });
    expect(JSON.stringify(gone)).not.toContain("Open the agreement");
    act({ action: "restore", id: RATE }, later(5));
    // No longer shared with coordinators: not even its name is left.
    const data = { ...SEED_SNIPPETS.find((s) => s.id === RATE)!.data, audiences: ["staff"] };
    act({ action: "save-snippet", id: RATE, data }, later(5));
    const hidden = list(riley, {}, later(5)).items[0];
    expect(hidden).toMatchObject({ state: "unavailable", title: "A Job Aid you can no longer open", href: "/tools" });
    expect(JSON.stringify(hidden)).not.toContain("Invoice rate check");
  });

  it("adds the pilot's source section to a record that was seeded before it existed, without disturbing what's there", () => {
    const old = openDb(":memory:");
    // A database from before the Job Aids pilot: the invoices record has one section, at version 1.
    old.prepare("INSERT INTO playbook_sources (doc_id, version, data, at, by_user) VALUES ('supplier-invoices', 1, ?, '2026-11-01T00:00:00.000Z', 'seed')").run(
      JSON.stringify({
        id: "supplier-invoices",
        title: "Supplier invoices",
        system: "Hub policy record",
        owner: "Finance",
        audiences: ["coordinator", "staff"],
        sections: [{ anchor: "rejected-invoice", heading: "Rejected", text: "An owner's edited text." }],
      }),
    );
    const j = userById(old, "jordan")!;
    const lib = playbookLibrary(old, j, now);
    const record = lib.sources.find((x) => x.id === "supplier-invoices")!;
    expect(record.version).toBe(2);
    expect(record.sections.map((x) => x.anchor)).toEqual(["rejected-invoice", "rate-check"]);
    // The owner's own wording of the section that was there is untouched.
    expect(record.sections[0].text).toBe("An owner's edited text.");
    expect(lib.snippets.find((x) => x.id === RATE)!.source.state).not.toBe("unmapped");
  });

  it("brings Shift Wallet saves across as Favourites", () => {
    const fresh = openDb(":memory:");
    fresh.prepare("INSERT INTO playbook_saves (user_id, snippet_id, saved_at) VALUES ('riley', 'sirs-first-steps', '2026-11-01T00:00:00.000Z')").run();
    const r = userById(fresh, "riley")!;
    expect(favouritesList(fresh, r, {}, now).items).toHaveLength(1);
    expect(favouritesList(fresh, r, {}, now).items[0]).toMatchObject({ kind: "job_aid", savedAt: "2026-11-01T00:00:00.000Z" });
    // And only once.
    expect(favouritesList(fresh, r, {}, now).counts.all).toBe(1);
  });
});

describe("highlighting a passage", () => {
  it("saves published words from one part of a page, once, and nothing that isn't there", () => {
    const g = guide();
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: `  ${SENTENCE}  ` }, now);
    expect(saved).toMatchObject({ saved: true, already: false, first: true, quote: SENTENCE, sourceTitle: "Invoice guide" });
    // Across the bold markers and a line break, it is still the same passage, and saving it again is one save.
    const again = savePassage(
      db,
      riley,
      { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE.replace("the unit", "the\nunit") },
      now,
    );
    expect(again).toMatchObject({ id: saved.id, already: true, first: false });
    expect((db.prepare("SELECT COUNT(*) n FROM saved_passages").get() as { n: number }).n).toBe(1);
    const item = list(riley).items[0];
    expect(item).toMatchObject({
      kind: "passage",
      label: "Highlight",
      quote: SENTENCE,
      state: "current",
      detail: "From Invoice guide",
      href: `/magazine/${g.slug}?fav=${saved.id}#block-b1`,
    });
    const bad = (input: Record<string, unknown>) => () =>
      savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", ...input }, now);
    // Words that aren't in the page can't be stored as a highlight: not a note, not a client's details.
    expect(bad({ quote: "Mrs Smith of 12 Rose Street disputes her invoice." })).toThrow(/within one part of the page/);
    expect(bad({ quote: "the rate" })).toThrow(/a little more/);
    expect(bad({ quote: "x".repeat(700) })).toThrow(/long passage/);
    // Across two blocks, or from a block that isn't there.
    expect(bad({ quote: `${SENTENCE} Keep a note of what you queried` })).toThrow(/within one part of the page/);
    expect(bad({ blockId: "no-such-block", quote: SENTENCE })).toThrow(/within one part of the page/);
    expect(() =>
      savePassage(db, riley, { source: "guide", id: g.slug, revisionId: "an-older-edition", pageId: "p1", blockId: "b1", quote: SENTENCE }, now),
    ).toThrow(/has been updated/);
    // A Care Partner can't read this guide, so can't save from it.
    expect(() => savePassage(db, sam, { source: "guide", id: g.slug, pageId: "p1", blockId: "b1", quote: SENTENCE }, now)).toThrow();
    expect(normText("Compare **the rate**,\n on each line.")).toBe("compare the rate on each line");
  });

  it("offers a whole section to people who can't make a precise selection", () => {
    const g = guide();
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", sectionId: "s2" }, now);
    expect(saved.quote).toBe("Keep a note of what you queried and when you expect an answer back from the supplier.");
    expect(db.prepare("SELECT whole_section, section_id, block_id FROM saved_passages").get()).toEqual({ whole_section: 1, section_id: "s2", block_id: "b2" });
    expect(() => savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", sectionId: "no-such-section" }, now)).toThrow(
      /isn’t on this page/,
    );
  });

  it("is read against the source again every time: changed, superseded, or gone", () => {
    const g = guide();
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, now);
    // Published again with the passage untouched: still there, and flagged until the learner has checked it.
    republish(g.id, `A new opening line. ${SENTENCE} If something differs, pause.`, later(1));
    expect(list(riley, {}, later(1)).items[0]).toMatchObject({
      state: "changed",
      quote: SENTENCE,
      note: expect.stringContaining("Guidance changed since you saved this"),
    });
    favouriteAction(db, riley, { action: "checked", id: saved.id }, later(1));
    expect(list(riley, {}, later(1)).items[0]).toMatchObject({ state: "current", note: "" });
    // Published again with the wording changed: the old words are shown as superseded, never as current.
    republish(g.id, "Compare every line with the agreement that applied on the date of service.", later(2));
    const old = list(riley, {}, later(2)).items[0];
    expect(old).toMatchObject({ state: "superseded", quote: SENTENCE, note: expect.stringContaining("no longer in the current guidance") });
    expect(favouriteFor(db, riley, saved.id, later(2))).toMatchObject({ state: "superseded" });
    // Archived: the quote goes too.
    archiveGuide(db, jordan, g.id, later(3));
    const gone = list(riley, {}, later(3)).items[0];
    expect(gone).toMatchObject({ state: "unavailable", quote: "", title: "A saved passage" });
    expect(JSON.stringify(gone)).not.toContain("Compare the service");
  });

  it("saves from a Job Aid's own words, and hides them if the aid is withdrawn", () => {
    contacts();
    release(RATE);
    const quote = "For each line, compare the service, the date, the unit and the rate with the agreement.";
    const saved = savePassage(db, riley, { source: "aid", id: RATE, quote }, now);
    expect(list(riley).items[0]).toMatchObject({
      kind: "passage",
      state: "current",
      detail: "From Invoice rate check · Release 1",
      href: `/tools/${RATE}?fav=${saved.id}`,
    });
    expect(() => savePassage(db, riley, { source: "aid", id: RATE, quote: "Approve it anyway if the supplier insists." }, now)).toThrow(
      /within one part of the page/,
    );
    expect(() => savePassage(db, sam, { source: "aid", id: RATE, quote }, now)).toThrow(/isn’t shared with your role/);
    act({ action: "withdraw", id: RATE, reason: "Under review." }, later(1));
    expect(list(riley, {}, later(1)).items[0]).toMatchObject({ state: "unavailable", quote: "" });
  });

  it("can be renamed, pinned, searched and removed, and a label can't hold someone's details", () => {
    const g = guide();
    contacts();
    release(RATE);
    const p = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, now);
    toggleSaved(db, riley, RATE, true, later(1));
    expect(list(riley, {}, later(1)).items.map((i) => i.kind)).toEqual(["job_aid", "passage"]);
    favouriteAction(db, riley, { action: "pin", id: p.id }, later(1));
    expect(list(riley, {}, later(1)).items[0]).toMatchObject({ kind: "passage", pinned: true });
    favouriteAction(db, riley, { action: "rename", id: p.id, title: "Rate check line" }, later(1));
    expect(() => favouriteAction(db, riley, { action: "rename", id: p.id, title: "Call 0412 345 678 about this" }, later(1))).toThrow(/a phone number/);
    expect(list(riley, { q: "rate check line" }, later(1)).items.map((i) => i.title)).toEqual(["Rate check line"]);
    expect(list(riley, { q: "agreement" }, later(1)).items).toHaveLength(1);
    expect(list(riley, { kind: "job_aid" }, later(1)).items.map((i) => i.title)).toEqual(["Invoice rate check"]);
    // Opening one moves it up the list of unpinned items and is counted as a return.
    favouriteAction(db, riley, { action: "opened", id: p.id, key: "open-0001" }, later(2));
    favouriteAction(db, riley, { action: "opened", id: p.id, key: "open-0001" }, later(2));
    expect((db.prepare("SELECT COUNT(*) n FROM aid_events WHERE event = 'saved_item_opened'").get() as { n: number }).n).toBe(1);
    favouriteAction(db, riley, { action: "remove", id: p.id }, later(2));
    expect(list(riley, {}, later(2)).counts).toEqual({ all: 1, job_aid: 1, passage: 0 });
    expect((db.prepare("SELECT COUNT(*) n FROM saved_passages").get() as { n: number }).n).toBe(0);
  });
});

describe("a Job Aid on a Topic card", () => {
  it("is placed by reference, for the roles it's shared with", () => {
    contacts();
    release(RATE);
    const topic = lessons[0];
    const card = ordered(topic).find((c) => c.type !== "listen" && c.type !== "presenter")!.id;
    expect(() => aidAdminAction(db, riley, { action: "place-topic", id: RATE, slug: topic.slug, card }, now)).toThrow();
    aidAdminAction(db, jordan, { action: "place-topic", id: RATE, slug: topic.slug, card, why: "Use it at your next invoice review." }, now);
    aidAdminAction(db, jordan, { action: "place-topic", id: RATE, slug: topic.slug, card, why: "Use it the next time you review an invoice." }, now);
    const mine = aidsForTopic(db, riley, topic.slug, now).aids;
    expect(mine).toEqual([{ placementId: expect.stringMatching(/^ap-/), snippetId: RATE, card, why: "Use it the next time you review an invoice." }]);
    expect(aidsForTopic(db, sam, topic.slug, now).aids).toEqual([]);
    expect(() => aidAdminAction(db, jordan, { action: "place-topic", id: RATE, slug: topic.slug, card: "no-such-card" }, now)).toThrow(/Choose a card/);
    expect(() => aidAdminAction(db, jordan, { action: "place-topic", id: "no-such-aid", slug: topic.slug, card }, now)).toThrow(/isn’t in the library/);
    aidAdminAction(db, jordan, { action: "unplace-topic", id: RATE, placementId: mine[0].placementId }, now);
    expect(aidsForTopic(db, riley, topic.slug, now).aids).toEqual([]);
  });
});

describe("use, and what it is evidence of", () => {
  it("is counted by aid and release with its denominator, and holds no one's highlights", () => {
    contacts();
    release(RATE);
    const g = guide();
    aidViewed(db, riley, RATE, { from: "work-tools", key: "v-000001" }, now);
    aidViewed(db, jordan, RATE, { from: "work-tools", key: "v-000002" }, now);
    toggleSaved(db, riley, RATE, true, now);
    const fav = list(riley).items[0];
    favouriteAction(db, riley, { action: "opened", id: fav.id, key: "o-000001" }, later(1));
    expect(clientAidEvent(db, riley, { event: "current_source_opened", snippetId: RATE, key: "s-000001" }, now)).toEqual({ ok: true, recorded: true });
    expect(clientAidEvent(db, riley, { event: "current_source_opened", snippetId: RATE, key: "s-000001" }, now)).toEqual({ ok: true, recorded: false });
    expect(clientAidEvent(db, riley, { event: "favourites_opened", key: "f-000001" }, now)).toMatchObject({ recorded: true });
    expect(() => clientAidEvent(db, riley, { event: "job_aid_favourited", snippetId: RATE }, now)).toThrow(/Unknown event/);
    expect(() => clientAidEvent(db, sam, { event: "current_source_opened", snippetId: RATE }, now)).toThrow(/isn’t shared/);
    savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, now);
    askLead(
      db,
      riley,
      { snippetId: RATE, question: "Which agreement applies when the visit date is after a renewal?", issue: "notcovered", idempotencyKey: "gap-0001" },
      now,
    );
    aidAdminAction(
      db,
      jordan,
      { action: "review", id: RATE, decision: "keep", note: "Opened by most coordinators; one open question about renewals." },
      later(1),
    );
    expect(() => aidAdminAction(db, jordan, { action: "review", id: RATE, decision: "maybe", note: "x" }, later(1))).toThrow(/Choose keep/);

    const r = aidReport(db, jordan, { from: "2026-11-01", to: "2026-11-30" }, later(1));
    const aid = r.aids.find((a) => a.id === RATE)!;
    expect(aid).toMatchObject({
      release: 1,
      viewers: 2,
      thin: true,
      views: 2,
      saves: 1,
      savedNow: 1,
      returns: 1,
      returners: 1,
      sourceClicks: 1,
      issues: 1,
      owner: "Finance",
    });
    // Everyone whose role the aid is shared with: the denominator beside every count.
    const eligible = (db.prepare("SELECT COUNT(*) n FROM users WHERE audience IN ('coordinator', 'staff')").get() as { n: number }).n;
    expect(aid.eligible).toBe(eligible);
    expect(aid.review).toMatchObject({ decision: "Keep", note: expect.stringContaining("renewals") });
    expect(r.totals).toMatchObject({ favouritesOpened: 1, peopleWithFavourites: 1, passagesSaved: 1 });
    // Saving and opening are adoption. Nothing here says anyone finished or passed anything, and no quote is in it.
    const everything = JSON.stringify(r) + JSON.stringify(db.prepare("SELECT * FROM aid_events").all());
    expect(everything).not.toContain("Compare the service");
    expect(everything).not.toContain("renewal?");
    expect(readGuide(db, riley, g.id).completed).toBeNull();
    expect(() => aidReport(db, riley, {}, now)).toThrow();
    expect(aidReport(db, jordan, { from: "2026-10-01", to: "2026-10-31" }, now).aids.find((a) => a.id === RATE)).toMatchObject({
      viewers: 0,
      views: 0,
      savedNow: 1,
    });
  });
});

describe("the marker for an earlier highlight", () => {
  const marks = (u: User, g: { slug: string }, input: Record<string, unknown> = {}, at = now) =>
    pageMarks(db, u, { source: "guide", id: g.slug, page: "p1", ...input }, at).marks;

  it("marks an exact match, for the person who saved it only, on the page it's on", () => {
    const g = guide();
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, now);
    expect(marks(riley, g)).toEqual([{ id: saved.id, blockId: "b1", quote: SENTENCE }]);
    // Someone else reading the same page sees no marks of riley's; nor does someone who can't read it.
    expect(marks(jordan, g)).toEqual([]);
    expect(marks(sam, g)).toEqual([]);
    // Another page of the course has nothing marked.
    expect(marks(riley, g, { page: "p2" })).toEqual([]);
    expect(() => pageMarks(db, riley, { source: "scorm", id: g.slug }, now)).toThrow(/Unknown source/);
  });

  it("doesn't mark a changed or missing passage, and Favourites says why", () => {
    const g = guide();
    const saved = savePassage(db, riley, { source: "guide", id: g.slug, revisionId: g.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, now);
    // Published again, the words untouched: not marked until the reader has checked it, as Favourites asks.
    republish(g.id, `A new opening line. ${SENTENCE} If something differs, pause.`, later(1));
    expect(marks(riley, g, {}, later(1))).toEqual([]);
    expect(list(riley, {}, later(1)).items[0].state).toBe("changed");
    favouriteAction(db, riley, { action: "checked", id: saved.id }, later(1));
    expect(marks(riley, g, {}, later(1))).toEqual([{ id: saved.id, blockId: "b1", quote: SENTENCE }]);
    // The wording changed: not marked, and superseded in Favourites.
    republish(g.id, "Compare every line with the agreement that applied on the date of service.", later(2));
    expect(marks(riley, g, {}, later(2))).toEqual([]);
    expect(list(riley, {}, later(2)).items[0].state).toBe("superseded");
    // The source is gone: nothing marked, and unavailable in Favourites.
    archiveGuide(db, jordan, g.id, later(3));
    expect(marks(riley, g, {}, later(3))).toEqual([]);
    expect(list(riley, {}, later(3)).items[0].state).toBe("unavailable");
    // Removed from Favourites: no longer marked anywhere.
    const h = guide();
    const again = savePassage(db, riley, { source: "guide", id: h.slug, revisionId: h.revisionId, pageId: "p1", blockId: "b1", quote: SENTENCE }, later(3));
    favouriteAction(db, riley, { action: "remove", id: again.id }, later(3));
    expect(marks(riley, h, {}, later(3))).toEqual([]);
  });

  it("marks a Job Aid's words in the aid", () => {
    contacts();
    release(RATE);
    const quote = "For each line, compare the service, the date, the unit and the rate with the agreement.";
    const saved = savePassage(db, riley, { source: "aid", id: RATE, quote }, now);
    expect(pageMarks(db, riley, { source: "aid", id: RATE }, now).marks).toEqual([{ id: saved.id, blockId: "aid", quote }]);
    act({ action: "withdraw", id: RATE, reason: "Under review." }, later(1));
    expect(pageMarks(db, riley, { source: "aid", id: RATE }, later(1)).marks).toEqual([]);
  });
});

const CARD = "A supplier invoice is checked line by line against the agreement that applied on the day.";
/** A published Topic (a throwaway, as an author would make one) whose first card has a passage worth saving. */
function topic(body = CARD) {
  const input = { ...blankLesson(), title: "ZZ Test invoice topic" } as Lesson;
  input.nodes = { ...input.nodes, intro: { ...input.nodes.intro, heading: "Check each line", body } as Lesson["nodes"][string] };
  const { slug } = createLesson(db, jordan, input, now);
  return { slug, version: publishLesson(db, jordan, slug, now).version };
}
function republishTopic(slug: string, body: string, at: Date) {
  const live = structuredClone(lessons.find((l) => l.slug === slug)!);
  live.nodes.intro = { ...live.nodes.intro, body } as Lesson["nodes"][string];
  saveDraft(db, jordan, slug, live, at);
  return publishLesson(db, jordan, slug, at).version;
}

describe("highlighting a Topic card", () => {
  const PART = "checked line by line against the agreement";

  it("anchors to the topic, the card and its version, and saves only words on that card", () => {
    const tp = topic();
    const saved = savePassage(db, riley, { source: "topic", id: tp.slug, revisionId: tp.version, blockId: "intro", quote: PART }, now);
    expect(saved).toMatchObject({ saved: true, first: true, quote: PART, sourceTitle: "ZZ Test invoice topic" });
    expect(db.prepare("SELECT source_kind, source_id, block_id, section_id, version FROM saved_passages").get()).toEqual({
      source_kind: "topic",
      source_id: tp.slug,
      block_id: "intro",
      section_id: "intro",
      version: tp.version,
    });
    expect(list(riley).items[0]).toMatchObject({
      kind: "passage",
      state: "current",
      quote: PART,
      detail: "From ZZ Test invoice topic · Check each line",
      href: `/topics/${tp.slug}?card=intro&fav=${saved.id}`,
    });
    expect(pageMarks(db, riley, { source: "topic", id: tp.slug, page: "intro" }, now).marks).toEqual([{ id: saved.id, blockId: "intro", quote: PART }]);
    expect(pageMarks(db, riley, { source: "topic", id: tp.slug, page: "summary" }, now).marks).toEqual([]);
    const bad = (input: Record<string, unknown>) => () =>
      savePassage(db, riley, { source: "topic", id: tp.slug, blockId: "intro", quote: PART, ...input }, now);
    // Not on that card, a card that isn't there, an older version, a topic that isn't there.
    expect(bad({ quote: "Mrs Smith disputes the invoice from Tuesday." })).toThrow(/within one part of the page/);
    expect(bad({ blockId: "no-such-card" })).toThrow(/within one part of the page/);
    expect(bad({ revisionId: "0.9" })).toThrow(/updated since you opened it/);
    expect(bad({ id: "no-such-topic" })).toThrow(/Topic not found/);
    expect(bad({ source: "scorm" })).toThrow(/can’t be highlighted/);
    // Save this card: the card's words, with nothing selected.
    const whole = savePassage(db, riley, { source: "topic", id: tp.slug, revisionId: tp.version, sectionId: "intro" }, now);
    expect(whole.quote).toBe(CARD);
    // The use event names the source, never the words.
    const ev = db.prepare("SELECT * FROM aid_events WHERE event = 'passage_selection_saved'").all();
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ source_kind: "topic", source_id: tp.slug });
    expect(JSON.stringify(ev)).not.toContain("line by line");
  });

  it("keeps the server's rules for version and withdrawal", () => {
    const tp = topic();
    const saved = savePassage(db, riley, { source: "topic", id: tp.slug, revisionId: tp.version, blockId: "intro", quote: PART }, now);
    // A new version with the words untouched: flagged until checked, and not marked meanwhile.
    const v2 = republishTopic(tp.slug, `New first line. ${CARD}`, later(1));
    expect(v2).not.toBe(tp.version);
    expect(list(riley, {}, later(1)).items[0]).toMatchObject({ state: "changed", quote: PART });
    expect(pageMarks(db, riley, { source: "topic", id: tp.slug, page: "intro" }, later(1)).marks).toEqual([]);
    favouriteAction(db, riley, { action: "checked", id: saved.id }, later(1));
    expect(list(riley, {}, later(1)).items[0].state).toBe("current");
    // Reworded: superseded, never shown as current.
    republishTopic(tp.slug, "Each invoice line is compared with the agreement in force on the day.", later(2));
    expect(list(riley, {}, later(2)).items[0]).toMatchObject({ state: "superseded", quote: PART });
    // Deleted (withdrawn): unavailable, and the words go.
    deleteLesson(db, jordan, tp.slug, later(3));
    const gone = list(riley, {}, later(3)).items[0];
    expect(gone).toMatchObject({ state: "unavailable", quote: "" });
    expect(JSON.stringify(gone)).not.toContain("line by line");
    expect(() => savePassage(db, riley, { source: "topic", id: tp.slug, blockId: "intro", quote: PART }, later(3))).toThrow(/Topic not found/);
  });

  it("is closed to learners while the topic is a challenge mission that hasn't opened", () => {
    const tp = topic();
    const saved = savePassage(db, riley, { source: "topic", id: tp.slug, revisionId: tp.version, blockId: "intro", quote: PART }, now);
    db.prepare(
      "INSERT INTO challenges (id, name, starts_on, points, status, created_by, created_at, updated_at) VALUES ('ch-zz', 'ZZ Test challenge', '2027-01-04', '{}', 'draft', 'jordan', ?, ?)",
    ).run(now.toISOString(), now.toISOString());
    db.prepare("INSERT INTO challenge_missions (challenge_id, day, lesson_slug) VALUES ('ch-zz', 1, ?)").run(tp.slug);
    expect(() => savePassage(db, sam, { source: "topic", id: tp.slug, blockId: "intro", quote: PART }, now)).toThrow(/Topic not found/);
    expect(favouriteFor(db, riley, saved.id, now)).toMatchObject({ state: "unavailable", quote: "" });
    expect(pageMarks(db, riley, { source: "topic", id: tp.slug }, now).marks).toEqual([]);
    // An author can still open it, so can still save from it.
    expect(savePassage(db, jordan, { source: "topic", id: tp.slug, blockId: "intro", quote: PART }, now).saved).toBe(true);
  });
});

const NEWS = "Coordinators now confirm a change to a visit with the client before the visit goes ahead.";
/** A published story (a throwaway): an opening, a subheading, and a paragraph worth saving. */
function story() {
  const body = [
    { type: "p" as const, text: "A short opening paragraph for this test story." },
    { type: "h2" as const, text: "What changes" },
    { type: "p" as const, text: NEWS },
  ];
  const { slug } = saveStory(db, jordan, null, { ...stories[0], title: "ZZ Test story", body }, now);
  setStoryStatus(db, jordan, slug, "published", now);
  return { slug, body };
}

describe("highlighting a news story", () => {
  it("anchors to the story, the paragraph and the edition", () => {
    const s = story();
    const edition = now.toISOString();
    const saved = savePassage(
      db,
      sam,
      { source: "news", id: s.slug, revisionId: edition, blockId: "p2", quote: "confirm a change to a visit with the client" },
      now,
    );
    expect(list(sam).items[0]).toMatchObject({ state: "current", detail: "From ZZ Test story", href: `/news/${s.slug}?fav=${saved.id}#hl-p2` });
    expect(pageMarks(db, sam, { source: "news", id: s.slug }, now).marks).toEqual([
      { id: saved.id, blockId: "p2", quote: "confirm a change to a visit with the client" },
    ]);
    // Someone else has nothing marked on the same story.
    expect(pageMarks(db, riley, { source: "news", id: s.slug }, now).marks).toEqual([]);
    // A section is from one subheading to the next; the opening is before the first.
    expect(savePassage(db, sam, { source: "news", id: s.slug, sectionId: "s1" }, now).quote).toBe(NEWS);
    expect(savePassage(db, sam, { source: "news", id: s.slug, sectionId: "s0" }, now).quote).toBe("A short opening paragraph for this test story.");
    expect(() => savePassage(db, sam, { source: "news", id: s.slug, blockId: "p0", quote: NEWS }, now)).toThrow(/within one part of the page/);
    expect(() => savePassage(db, sam, { source: "news", id: s.slug, revisionId: "2020-01-01", blockId: "p2", quote: NEWS }, now)).toThrow(/updated/);
    expect(() => savePassage(db, sam, { source: "news", id: "no-such-story", blockId: "p2", quote: NEWS }, now)).toThrow(/Story not found/);
  });

  it("says when the story changed, and shows nothing once it's unpublished", () => {
    const s = story();
    const saved = savePassage(db, sam, { source: "news", id: s.slug, blockId: "p2", quote: NEWS }, now);
    saveStory(db, jordan, s.slug, { ...stories.find((x) => x.slug === s.slug)!, body: [...s.body, { type: "p", text: "A line added later." }] }, later(1));
    expect(list(sam, {}, later(1)).items[0]).toMatchObject({ state: "changed", quote: NEWS });
    saveStory(
      db,
      jordan,
      s.slug,
      { ...stories.find((x) => x.slug === s.slug)!, body: [{ type: "p", text: "Visits change only once the coordinator agrees." }] },
      later(2),
    );
    expect(list(sam, {}, later(2)).items[0]).toMatchObject({ state: "superseded", quote: NEWS });
    setStoryStatus(db, jordan, s.slug, "draft", later(3));
    expect(favouriteFor(db, sam, saved.id, later(3))).toMatchObject({ state: "unavailable", quote: "" });
  });
});

describe("highlighting a Resources entry", () => {
  it("anchors to the entry and its date, and every entry's marks come back for the Resources page", () => {
    const r = resources.find((x) => x.id === "change-request-guide")!;
    const quote = "Contact the coordinator before you agree";
    const saved = savePassage(db, sam, { source: "resource", id: "library", blockId: r.id, quote }, now);
    expect(db.prepare("SELECT source_id, block_id, version FROM saved_passages").get()).toEqual({ source_id: r.id, block_id: r.id, version: r.updated });
    expect(list(sam).items[0]).toMatchObject({ state: "current", detail: `From ${r.title}`, href: `/resources?fav=${saved.id}#${r.id}` });
    expect(pageMarks(db, sam, { source: "resource", id: "library" }, now).marks).toEqual([{ id: saved.id, blockId: r.id, quote }]);
    expect(savePassage(db, sam, { source: "resource", id: "library", sectionId: r.id }, now).quote).toContain(r.points[0]);
    expect(() => savePassage(db, sam, { source: "resource", id: "library", blockId: "no-such-entry", quote }, now)).toThrow(/Resource not found/);
  });
});

describe("the saved passages table", () => {
  it("is widened for the new kinds of source on a database made before them, keeping what was saved", () => {
    const old = openDb(":memory:");
    old.exec("DROP TABLE IF EXISTS saved_passages");
    old.exec(`CREATE TABLE saved_passages (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), source_kind TEXT NOT NULL CHECK (source_kind IN ('guide', 'aid')), source_id TEXT NOT NULL,
  version TEXT NOT NULL, page_id TEXT NOT NULL DEFAULT '', section_id TEXT NOT NULL DEFAULT '', block_id TEXT NOT NULL DEFAULT '', source_title TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL, hash TEXT NOT NULL, whole_section INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE (user_id, source_kind, source_id, hash)
)`);
    const insert = (id: string, kind: string) =>
      old
        .prepare(
          "INSERT INTO saved_passages (id, user_id, source_kind, source_id, version, quote, hash, created_at) VALUES (?, 'riley', ?, 'x', '1', 'words', ?, ?)",
        )
        .run(id, kind, id, now.toISOString());
    insert("sp-old", "guide");
    expect(() => insert("sp-topic", "topic")).toThrow();
    ensurePassageKinds(old);
    insert("sp-topic", "topic");
    expect((old.prepare("SELECT id FROM saved_passages ORDER BY id").all() as { id: string }[]).map((r) => r.id)).toEqual(["sp-old", "sp-topic"]);
    expect((old.prepare("SELECT sql FROM sqlite_master WHERE name = 'saved_passages'").get() as { sql: string }).sql).toContain("'resource'");
  });
});
