import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewHash } from "@/lib/relayConfig";
import { openDb, type Db } from "./db";
import { userById, type User } from "./auth";
import { archiveGuide, authorGuide, publishGuide, readGuide, recordGuideEvent, saveGuideDraft } from "./magazine";
import {
  findSources,
  prepareAsk,
  recordRelayEvent,
  RELAY_QUESTIONS_PER_HOUR,
  relayAnswer,
  relayLink,
  relayOutlook,
  relaySettings,
  saveRelaySettings,
  type RelayStreamEvent,
} from "./relay";
import { createRelayPilot, relayReport } from "./relayAdmin";
import { RETURN_PILOT_DOC } from "@/content/livingPilot";
import { playbooksForRelay } from "./playbooks";
import type { RelayRequest } from "./relayModel";
import { relayCanon } from "./story";

/*
  Ava Relay on the server: what the model is and isn't told, sources a learner may open, answers that never reach
  a model, and conversations that stay with their learner, their course version and their expiry.
*/

const model = vi.hoisted(() => ({
  provider: { id: "claude", model: "test-model" } as { id: string; model: string } | null,
  reply: "What does tending the roses mean to Dot [C1]? You could ask her that first.",
  fail: false,
  calls: [] as RelayRequest[],
}));
vi.mock("./relayModel", () => ({
  RELAY_TIMEOUT_MS: 1000,
  relayProvider: () => model.provider,
  relayText: async function* (_p: unknown, req: RelayRequest) {
    model.calls.push(req);
    if (model.fail) throw new Error("the provider is down");
    yield model.reply.slice(0, 10);
    yield model.reply.slice(10);
  },
}));

let db: Db;
let jordan: User, riley: User, sam: User;
let guideId = "";
let slug = "";
let revisionId = "";
const now = new Date("2026-11-21T00:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

async function ask(user: User, input: Record<string, unknown>, at = now) {
  const prepared = prepareAsk(db, user, { action: "ask", ...input }, at);
  const events: RelayStreamEvent[] = [];
  for await (const e of relayAnswer(db, prepared, () => at)) events.push(e);
  const final = events.find((e) => e.type === "final");
  return { events, turn: final?.type === "final" ? final.turn : null, error: events.find((e) => e.type === "error") };
}
const link = (user: User, pageId = "rose-garden", extra: Record<string, unknown> = {}, at = now) =>
  relayLink(db, user, { slug, revisionId, pageId, mode: "story", ...extra }, at);
const lastContext = () => model.calls[model.calls.length - 1].context;
const lastQuestion = () => model.calls[model.calls.length - 1].messages.at(-1)!.content;

/** The pilot course, reviewed and published: what a coordinator would read. */
function publishPilot() {
  const made = createRelayPilot(db, jordan, now, RETURN_PILOT_DOC.pages);
  const a = authorGuide(db, jordan, made.id);
  const doc = structuredClone(a.doc);
  for (const p of doc.pages) if (p.relay) p.relay.reviewed = { by: jordan.id, at: now.toISOString(), hash: reviewHash(doc.relay, p.relay) };
  saveGuideDraft(db, jordan, made.id, { doc, basedOn: a.savedAt }, now);
  publishGuide(db, jordan, made.id, "The pilot", now);
  guideId = made.id;
  slug = authorGuide(db, jordan, made.id).slug;
  revisionId = readGuide(db, riley, slug).revisionId;
}
/** The sample incident playbook, approved and in effect: something real for Work guidance to cite. */
function approvePlaybook(id = "sirs-first-steps", effectiveOn = "2026-01-01", reviewBy = "2027-06-30") {
  relayOutlook(db, jordan, guideId, "rose-garden", now);
  playbooksForRelay(db, riley, now);
  const r = db.prepare("SELECT data FROM playbook_releases WHERE snippet_id = ? AND number = 1").get(id) as { data: string };
  db.prepare("UPDATE playbook_releases SET status = 'approved', approved_by = 'jordan', approved_at = ?, data = ? WHERE snippet_id = ? AND number = 1").run(
    now.toISOString(),
    JSON.stringify({ ...JSON.parse(r.data), effectiveOn, reviewBy }),
    id,
  );
}

beforeEach(() => {
  db = openDb(":memory:");
  [jordan, riley, sam] = ["jordan", "riley", "sam"].map((id) => userById(db, id)!);
  Object.assign(model, {
    provider: { id: "claude", model: "test-model" },
    reply: "What does tending the roses mean to Dot [C1]? You could ask her that first.",
    fail: false,
  });
  model.calls.length = 0;
  publishPilot();
});

describe("publishing a course with Ava on it", () => {
  it("is held until each page's test answers are reviewed, and Ava must be approved canon", () => {
    const made = createRelayPilot(db, jordan, now, RETURN_PILOT_DOC.pages);
    expect(() => publishGuide(db, jordan, made.id, "Too soon", now)).toThrow(/Resolve 2 checks/);
    expect(authorGuide(db, jordan, made.id).checks.blocking.join(" ")).toContain("run the test questions and mark the answers reviewed");
    // The pilot pins each person at their approved version.
    expect(authorGuide(db, jordan, made.id).doc.pages[0].relay!.characters).toEqual([
      { id: "dot", revision: 1 },
      { id: "fiona", revision: 1 },
    ]);
    expect(() => createRelayPilot(db, riley, now)).toThrow();
  });

  it("gives readers the bar and nothing an author wrote about it", () => {
    const sent = JSON.stringify(readGuide(db, riley, slug).doc);
    expect(sent).toContain('"mode":"on"');
    for (const secret of ["Help the learner work out", "The signal’s thin", "ep-roses", "Whether Dot should stop"]) expect(sent).not.toContain(secret);
  });
});

describe("dialling", () => {
  it("links a learner who can read the course, with Ava, the page and the suggested questions", () => {
    const l = link(riley);
    expect(l.sessionId).toMatch(/^rs-/);
    expect(l.ava).toMatchObject({ name: "Ava", monogram: "A" });
    expect(l.card).toMatchObject({
      course: "Dot and the rose garden",
      page: "Dot and the rose garden",
      scene: "This spring: Dot and the roses",
      where: "Page 1 of 2 · Before the decision question",
    });
    expect(l.card.people.map((p) => p.name)).toEqual(["Dot", "Fiona"]);
    expect(l.opening).toContain("The signal’s thin");
    expect(l.prompts.story).toEqual(["Give me a hint", "What matters to Dot?", "Why is Fiona worried?"]);
    expect(l.work).toBe(true);
    expect(l.turns).toEqual([]);
    // Dialling again picks the same conversation up.
    expect(link(riley).sessionId).toBe(l.sessionId);
  });

  it("refuses honestly: outside the audience, a page without Ava, an out-of-date page, nothing connected, or switched off", () => {
    expect(() => link(sam)).toThrow(/not found/i);
    expect(() => link(riley, "no-such-page")).toThrow(/isn’t on this page/);
    expect(() => relayLink(db, riley, { slug, revisionId: "an-older-edition", pageId: "rose-garden" }, now)).toThrow(/has been updated/);
    model.provider = null;
    expect(() => link(riley)).toThrow(/isn’t connected/);
    model.provider = { id: "openai", model: "test" };
    expect(() => saveRelaySettings(db, riley, { on: false }, now)).toThrow();
    saveRelaySettings(db, jordan, { on: false, retentionDays: 7 }, now);
    expect(relaySettings(db)).toEqual({ on: false, retentionDays: 7 });
    expect(() => link(riley)).toThrow(/switched off/);
  });
});

describe("in this story", () => {
  it("before the decision: Ava has the page and Dot's approved story, and none of the feedback, the held block or anything later", async () => {
    const l = link(riley);
    const { turn, events } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "story",
      text: "Should I tell Dot to stop using the ladder?",
      key: "question-0001",
    });
    const told = `${model.calls[0].rules}\n${lastContext()}`;
    expect(told).toContain("Fiona rings on a Tuesday");
    expect(told).toContain('learner="has not answered yet"');
    expect(told).toContain('<person tag="C1" name="Dot">');
    expect(told).toContain("Dot tends the roses in her front garden");
    expect(told).toContain("Dot and the roses");
    for (const hidden of [
      "Asking first keeps Dot",
      "It’s a kind offer",
      "makes the decision for Dot",
      "A plan Dot helps make",
      "Saturday markets",
      "A morning at the markets",
      "An invoice that looks right",
    ])
      expect(told).not.toContain(hidden);
    // Reviewer notes and the settings themselves aren't Ava's to read out.
    expect(told).toContain("steer away from: Whether Dot should stop");
    expect(lastQuestion()).toBe("Should I tell Dot to stop using the ladder?");
    // Nothing is shown until the whole answer has been checked.
    expect(events.map((e) => e.type)).toEqual(["start", "final"]);
    expect(turn).toMatchObject({ role: "ava", mode: "story", kind: "story", status: "done", pageTitle: "Dot and the rose garden" });
    expect(turn!.people).toEqual([{ ref: "C1", id: "dot", name: "Dot" }]);
    expect(turn!.text).toContain("[C1]");
  });

  it("after the decision: the approved feedback on what they chose can be cited, and the held block is released", async () => {
    const l = link(riley);
    recordGuideEvent(db, riley, guideId, { event: "decision", revisionId, blockId: "first-question", choiceId: "offer-gardener" }, now);
    expect(link(riley).card.where).toBe("Page 1 of 2 · After your answer to the decision question");
    model.reply = "The feedback says the offer solves Fiona’s problem before you know what Dot’s is [F1]. A made-up tag [F7] is dropped.";
    const { turn } = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Why wasn’t that the best answer?" });
    expect(lastContext()).toContain('<item tag="F1"');
    expect(lastContext()).toContain("It’s a kind offer");
    expect(lastContext()).toContain("A plan Dot helps make");
    // The feedback on the answers they didn't choose stays back.
    expect(lastContext()).not.toContain("Asking first keeps Dot");
    expect(turn).toMatchObject({ kind: "feedback", kindLabel: "From the approved feedback" });
    expect(turn!.feedback).toEqual([{ ref: "F1", label: "Decision question" }]);
    expect(turn!.text).not.toContain("[F7]");
    // Nothing Ava did touched the course's own record.
    expect(readGuide(db, riley, slug).progress.answers).toEqual({ "first-question": "offer-gardener" });
    expect(readGuide(db, riley, slug).completed).toBeNull();
  });

  it("an answer that hands over one of the options before the attempt is not shown", async () => {
    const l = link(riley);
    model.reply = "Easy: ask Dot what tending the roses means to her, and how she goes about it now.";
    const before = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Which one is it?" });
    expect(before.turn!.text).toContain("I won’t point you to one of the options");
    expect(before.turn!.text).not.toContain("how she goes about it now");
    expect(db.prepare("SELECT text FROM relay_turns WHERE role = 'ava' ORDER BY n LIMIT 1").get()).toEqual({ text: before.turn!.text });
    // Nor is an answer that reports feedback when there is none to report.
    model.reply = "The approved feedback points you to getting her perspective first.";
    const premise = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Why wasn’t that the best answer?" });
    expect(premise.turn!.text).toContain("There’s no feedback for me to explain yet");
    expect(JSON.parse((db.prepare("SELECT next FROM audit WHERE event = 'relay.answer' ORDER BY id DESC LIMIT 1").get() as { next: string }).next).reason).toBe(
      "spoke of feedback there isn't",
    );
    model.reply = "Easy: ask Dot what tending the roses means to her, and how she goes about it now.";
    // Once they've answered, the same words are just the feedback being discussed.
    recordGuideEvent(db, riley, guideId, { event: "decision", revisionId, blockId: "first-question", choiceId: "ask-dot" }, now);
    const after = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Which one was it?" });
    expect(after.turn!.text).toContain("how she goes about it now");
  });

  it("on the second page: the same conversation, the new page's context, and only now the later episode", async () => {
    const l = link(riley);
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint" });
    const second = link(riley, "the-markets");
    expect(second.sessionId).toBe(l.sessionId);
    expect(second.card).toMatchObject({
      page: "Dot at the markets",
      scene: "A few weeks later: A morning at the markets",
      where: "Page 2 of 2 · Before the decision question",
    });
    expect(second.card.people.map((p) => p.name)).toEqual(["Dot", "Fiona"]);
    expect(second.prompts.story).toEqual(["What’s the same here?", "What does Dot want to keep doing?", "What would I ask first?"]);
    expect(second.resumed).toBe(true);
    expect(second.turns.map((t) => [t.role, t.pageTitle])).toEqual([
      ["learner", "Dot and the rose garden"],
      ["ava", "Dot and the rose garden"],
    ]);
    const { turn } = await ask(riley, { sessionId: l.sessionId, pageId: "the-markets", mode: "story", text: "What’s the same here?" });
    expect(lastContext()).toContain("Saturday markets");
    expect(lastContext()).toContain("A morning at the markets. A few weeks on, Dot is thinking about the Saturday markets");
    expect(lastContext()).toContain("<earlier_pages>");
    expect(lastContext()).not.toContain("This finds out what the offer would replace");
    expect(model.calls.at(-1)!.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(turn!.pageTitle).toBe("Dot at the markets");
    // A fresh conversation drops the old words at once.
    const fresh = link(riley, "the-markets", { fresh: true });
    expect(fresh.sessionId).not.toBe(l.sessionId);
    expect(fresh.turns).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_turns WHERE session_id = ?").get(l.sessionId) as { n: number }).n).toBe(0);
  });

  it("gives canon only up to where the page sits in the story", () => {
    const roses = relayCanon(db, riley, { picks: [{ id: "dot", revision: 1 }], episode: "ep-roses" }, now);
    expect(roses.people[0].episodes.map((e) => e.title)).toEqual(["Thursday without Lena", "Dot and the roses"]);
    expect(roses.later).toBe(1);
    expect(relayCanon(db, riley, { picks: [{ id: "dot", revision: 1 }], episode: "" }, now).people[0].episodes).toEqual([]);
    // A draft episode is never canon, wherever the page sits.
    expect(relayCanon(db, riley, { picks: [{ id: "ava", revision: 1 }], episode: "ep-markets" }, now).people).toEqual([]);
    expect(relayCanon(db, riley, { picks: [{ id: "no-one", revision: 1 }], episode: "ep-roses" }, now).people).toEqual([]);
  });
});

describe("work guidance", () => {
  it("cites a real approved source the learner may open, with its release and owner", async () => {
    approvePlaybook();
    const l = link(riley);
    model.reply = "First, protect the person’s immediate safety [S1]. In an emergency call 000 [S1]. I haven’t reported anything for you.";
    const { turn, events } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "work",
      text: "What are the first steps for a suspected SIRS incident?",
    });
    expect(lastQuestion()).toContain('<source tag="S1" title="Suspected SIRS Priority 1: first steps" kind="Live SOP playbook"');
    expect(lastQuestion()).toContain("Release 1 · effective 2026-01-01 · owner: Quality and Clinical Governance · review by 2027-06-30");
    // The story is named so the question makes sense. It isn't quoted, and neither are the characters.
    expect(lastContext()).toContain("tells a fictional story");
    expect(`${lastContext()}${lastQuestion()}`).not.toContain("Fiona rings");
    expect(events.map((e) => e.type)).toEqual(["start", "final"]);
    expect(turn).toMatchObject({ kind: "source", kindLabel: "From an approved source" });
    expect(turn!.sources).toEqual([
      {
        ref: "S1",
        title: "Suspected SIRS Priority 1: first steps",
        href: "/resources/playbooks/sirs-first-steps",
        meta: "Release 1 · effective 2026-01-01 · owner: Quality and Clinical Governance · review by 2027-06-30",
      },
    ]);
    // "Incident" is a real concern to raise: the route comes with it, and says nothing was submitted.
    expect(turn!.route).toMatchObject({ urgent: false, note: expect.stringContaining("hasn’t reported, submitted or recorded anything") });
    const audit = db.prepare("SELECT next FROM audit WHERE event = 'relay.answer' ORDER BY id DESC LIMIT 1").get() as { next: string };
    expect(JSON.parse(audit.next)).toMatchObject({
      mode: "work",
      kind: "source",
      provider: "claude",
      model: "test-model",
      sources: ["playbook:sirs-first-steps (release 1)"],
    });
    expect(audit.next).not.toContain("first steps for a suspected");
  });

  it("throws away an answer that cites nothing real, and says it can't verify", async () => {
    approvePlaybook();
    const l = link(riley);
    model.reply = "You should report it within 24 hours to the Commission [S4].";
    const { turn } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "work",
      text: "What are the first steps for a suspected SIRS incident?",
    });
    expect(turn!.text).toBe("I can’t verify that from approved Hub guidance, so I won’t guess.");
    expect(turn!.text).not.toContain("24 hours");
    expect(turn!.kind).toBe("route");
    expect(turn!.sources).toEqual([]);
  });

  it("asks no model when nothing approved covers the question", async () => {
    const l = link(riley);
    const { turn } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "work",
      text: "What is the hourly rate for weekend xylophone tuning?",
    });
    expect(model.calls).toHaveLength(0);
    expect(turn).toMatchObject({
      kind: "no_answer",
      kindLabel: "Couldn’t be verified",
      text: "I can’t verify that from approved Hub guidance, so I won’t guess.",
    });
    expect(turn!.route).toMatchObject({ urgent: false, general: "Contact your Trilogy Care contact or care coordinator." });
  });

  it("only finds sources in the chosen collections, in effect today, for this role. Never a story", () => {
    const course = { enabled: true, work: true, sources: ["playbooks" as const, "topics" as const, "resources" as const, "webinars" as const], routes: [] };
    const q = "What are the first steps for a suspected SIRS incident?";
    // Awaiting approval: not a source yet.
    expect(findSources(db, riley, course, q, "", now).some((s) => s.id.startsWith("playbook:"))).toBe(false);
    approvePlaybook();
    expect(findSources(db, riley, course, q, "", now)[0]).toMatchObject({ ref: "S1", id: "playbook:sirs-first-steps", revision: "release 1" });
    expect(findSources(db, riley, { ...course, sources: ["topics"] }, q, "", now).some((s) => s.id.startsWith("playbook:"))).toBe(false);
    // Not yet in effect, then past review for a safety-critical procedure: neither can be cited.
    approvePlaybook("sirs-first-steps", "2027-01-01");
    expect(findSources(db, riley, course, q, "", now).some((s) => s.id.startsWith("playbook:"))).toBe(false);
    approvePlaybook("sirs-first-steps", "2026-01-01", "2026-06-30");
    expect(findSources(db, riley, course, q, "", now).some((s) => s.id.startsWith("playbook:"))).toBe(false);
    approvePlaybook();
    // A role the playbook isn't shared with.
    const row = db.prepare("SELECT data FROM playbook_snippets WHERE id = 'sirs-first-steps'").get() as { data: string };
    db.prepare("UPDATE playbook_snippets SET data = ? WHERE id = 'sirs-first-steps'").run(JSON.stringify({ ...JSON.parse(row.data), audiences: ["staff"] }));
    expect(findSources(db, riley, course, q, "", now).some((s) => s.id.startsWith("playbook:"))).toBe(false);
    // Whatever the question, a Magazine story, a character or the news is never a source.
    for (const s of findSources(db, riley, course, "Dot roses ladder Fiona markets story coordinator", "", now))
      expect(s.id).toMatch(/^(playbook|lesson|resource|webinar):/);
    expect(findSources(db, riley, course, "the", "", now)).toEqual([]);
  });

  it("stops showing an earlier answer when its source is no longer the learner's to open", async () => {
    approvePlaybook();
    const l = link(riley);
    model.reply = "Protect the person’s immediate safety first [S1].";
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "work", text: "What are the first steps for a suspected SIRS incident?" });
    expect(link(riley).turns[1].text).toContain("immediate safety");
    db.prepare("UPDATE playbook_snippets SET withdrawn = 1, withdrawn_reason = 'Superseded' WHERE id = 'sirs-first-steps'").run();
    const again = link(riley).turns[1];
    expect(again).toMatchObject({ status: "hidden", sources: [], text: "This answer used something you can no longer open, so it isn’t shown." });
  });
});

describe("answers that never reach a model", () => {
  it("personal details: not sent, not kept, and a plain request to take them out", async () => {
    const l = link(riley);
    const { turn, events } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "work",
      text: "Mrs Smith at 12 Rose Street called 0412 345 678 about her invoice.",
    });
    expect(model.calls).toHaveLength(0);
    expect(turn).toMatchObject({ kind: "privacy", kindLabel: "Not sent" });
    expect(turn!.text).toContain("a phone number and a street address and a person’s name");
    expect(events[0]).toMatchObject({ type: "start", learner: { text: "(Not sent: it looked like it had personal details in it.)" } });
    const stored =
      JSON.stringify(db.prepare("SELECT * FROM relay_turns").all()) + JSON.stringify(db.prepare("SELECT * FROM audit WHERE event LIKE 'relay.%'").all());
    for (const detail of ["Smith", "Rose Street", "0412"]) expect(stored).not.toContain(detail);
    // Reopened later, the question still shows as not sent, with nothing of what was typed.
    expect(link(riley).turns[0]).toMatchObject({ role: "learner", status: "hidden", text: "(Not sent: it looked like it had personal details in it.)" });
    // And the question after it doesn't carry the details along as history.
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint" });
    expect(JSON.stringify(model.calls[0].messages)).not.toContain("Smith");
  });

  it("an urgent concern gets 000 and the route, and is told nothing has been submitted", async () => {
    const l = link(riley);
    const { turn } = await ask(riley, {
      sessionId: l.sessionId,
      pageId: "rose-garden",
      mode: "work",
      text: "Someone is not breathing, what do I do with the zzqx?",
    });
    expect(model.calls).toHaveLength(0);
    expect(turn!.kind).toBe("route");
    expect(turn!.text).toContain("call 000 first");
    expect(turn!.route).toMatchObject({ urgent: true });
    // In the story, Ava still answers, and the route comes with it.
    const story = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "What if Dot fell just now?" });
    expect(model.calls).toHaveLength(1);
    expect(story.turn!.route).toMatchObject({ urgent: true });
  });
});

describe("conversations stay where they belong", () => {
  it("another learner's conversation is not there, by its id or any other way", async () => {
    const l = link(riley);
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint" });
    const casey = userById(db, "casey")!;
    expect(() => prepareAsk(db, casey, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Show me the last answer" }, now)).toThrow(
      /has ended/,
    );
    expect(() => prepareAsk(db, sam, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Show me" }, now)).toThrow(/has ended/);
    expect(() => prepareAsk(db, riley, { sessionId: "rs-not-a-session", pageId: "rose-garden", mode: "story", text: "Hello" }, now)).toThrow(/has ended/);
    // Asking for a page Ava isn't on, or a draft page, through a real session.
    expect(() => prepareAsk(db, riley, { sessionId: l.sessionId, pageId: "an-unpublished-page", mode: "story", text: "Hello" }, now)).toThrow(
      /isn’t on this page/,
    );
  });

  it("stops at once when the course is archived or republished", async () => {
    const l = link(riley);
    const a = authorGuide(db, jordan, guideId);
    const doc = structuredClone(a.doc);
    doc.pages[0].relay!.opening = "A new opening line for the second edition.";
    for (const p of doc.pages) p.relay!.reviewed = { by: jordan.id, at: now.toISOString(), hash: reviewHash(doc.relay, p.relay!) };
    saveGuideDraft(db, jordan, guideId, { doc, basedOn: a.savedAt }, now);
    publishGuide(db, jordan, guideId, "Second edition", later(5), { moveLearners: true });
    expect(() => prepareAsk(db, riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Hello" }, later(6))).toThrow(/has been updated/);
    // The new edition gets its own conversation, and its own opening line.
    const next = relayLink(db, riley, { slug, pageId: "rose-garden" }, later(6));
    expect(next.sessionId).not.toBe(l.sessionId);
    expect(next.opening).toBe("A new opening line for the second edition.");
    archiveGuide(db, jordan, guideId, later(7));
    expect(() => prepareAsk(db, riley, { sessionId: next.sessionId, pageId: "rose-garden", mode: "story", text: "Hello" }, later(8))).toThrow(/not found/i);
  });

  it("answers a resend once, limits questions, and forgets the words when the conversation expires", async () => {
    const l = link(riley);
    const first = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint", key: "same-question-1" });
    const again = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint", key: "same-question-1" });
    expect(again.turn!.id).toBe(first.turn!.id);
    expect(model.calls).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_turns").get() as { n: number }).n).toBe(2);
    for (let i = 1; i < RELAY_QUESTIONS_PER_HOUR; i++)
      await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: `Question ${i}` });
    expect(() => prepareAsk(db, riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "One more" }, now)).toThrow(/a lot of questions/);
    expect(() => prepareAsk(db, riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "x".repeat(601) }, later(120))).toThrow(
      /under 600/,
    );
    expect(() => prepareAsk(db, riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "  " }, later(120))).toThrow(/Type a question/);
    // Fourteen days on, the conversation and its words are gone. The events, which hold none, stay.
    const after = link(riley, "rose-garden", {}, later(15 * 24 * 60));
    expect(after.sessionId).not.toBe(l.sessionId);
    expect(after.turns).toEqual([]);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_turns").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_events WHERE event = 'ava_question_submitted'").get() as { n: number }).n).toBe(RELAY_QUESTIONS_PER_HOUR);
  });

  it("when the model fails the learner is told plainly, the failure is recorded, and the course is untouched", async () => {
    const l = link(riley);
    model.fail = true;
    const { turn, error } = await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Give me a hint" });
    expect(turn).toBeNull();
    expect(error).toMatchObject({ type: "error", message: expect.stringContaining("Your page is still here") });
    expect(db.prepare("SELECT status, text FROM relay_turns WHERE role = 'ava'").get()).toEqual({ status: "failed", text: "" });
    expect(db.prepare("SELECT event, outcome FROM relay_events WHERE event = 'ava_relay_failed'").get()).toEqual({
      event: "ava_relay_failed",
      outcome: "answer failed",
    });
    model.fail = false;
    // The failed turn isn't replayed to the model as if Ava had said something.
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "Try again" });
    expect(model.calls.at(-1)!.messages).toEqual([{ role: "user", content: "Try again" }]);
    expect(readGuide(db, riley, slug).progress.answers).toEqual({});
  });
});

describe("authors", () => {
  it("can try the saved draft before and after an attempt, with nothing kept", async () => {
    const preview = { guideId, answers: {}, watched: false };
    const l = relayLink(db, jordan, { pageId: "rose-garden", preview }, now);
    expect(l).toMatchObject({ sessionId: "preview", preview: true });
    await ask(jordan, { pageId: "rose-garden", mode: "story", text: "Just tell me which answer is right.", preview, turns: [] });
    expect(lastContext()).not.toContain("Asking first keeps Dot");
    await ask(jordan, {
      pageId: "rose-garden",
      mode: "story",
      text: "Why?",
      preview: { ...preview, answers: { "first-question": "ask-dot" } },
      turns: [
        { role: "learner", mode: "story", text: "Earlier" },
        { role: "ava", mode: "story", text: "An earlier answer", kind: "story" },
      ],
    });
    expect(lastContext()).toContain("Asking first keeps Dot");
    expect(model.calls.at(-1)!.messages.map((m) => m.content)).toEqual(["Earlier", "An earlier answer", "Why?"]);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_turns").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_sessions").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM relay_events").get() as { n: number }).n).toBe(0);
    // Not for learners.
    expect(() => relayLink(db, riley, { pageId: "rose-garden", preview }, now)).toThrow();
    expect(() => prepareAsk(db, riley, { pageId: "rose-garden", mode: "story", text: "Hello", preview }, now)).toThrow();
  });

  it("see what Ava knows now, after the attempt, and what stays back", () => {
    const o = relayOutlook(db, jordan, guideId, "rose-garden", now);
    expect(o).toMatchObject({ provider: true, hubOn: true, avaApproved: true, later: { pages: 1, episodes: 1 } });
    expect(o.now.people).toEqual([
      { name: "Dot", revision: 1, current: 1, episodes: 2 },
      { name: "Fiona", revision: 1, current: 1, episodes: 2 },
    ]);
    expect(o.afterAttempt).toMatchObject({ held: 1, activities: [{ blockId: "first-question", label: "Decision question" }] });
    expect(() => relayOutlook(db, riley, guideId, "rose-garden", now)).toThrow();
  });
});

describe("events and the report", () => {
  it("counts an event once, keeps engagement apart from learning, and holds no one's words", async () => {
    for (const u of [riley, jordan]) {
      const rev = readGuide(db, u, slug).revisionId;
      recordGuideEvent(db, u, guideId, { event: "page", revisionId: rev, pageId: "rose-garden" }, now);
    }
    const l = link(riley);
    const sent = { slug, pageId: "rose-garden", sessionId: l.sessionId, mode: "story", event: "ava_relay_dialled", key: "dial-00000001" };
    expect(recordRelayEvent(db, riley, sent, now)).toEqual({ ok: true, recorded: true });
    expect(recordRelayEvent(db, riley, sent, now)).toEqual({ ok: true, recorded: false });
    recordRelayEvent(db, riley, { ...sent, event: "ava_relay_linked", key: "link-00000001" }, now);
    expect(() => recordRelayEvent(db, riley, { ...sent, event: "ava_answer_delivered" }, now)).toThrow(/Unknown event/);
    expect(() => recordRelayEvent(db, sam, sent, now)).toThrow();
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "story", text: "A very particular question about petunias" });
    await ask(riley, { sessionId: l.sessionId, pageId: "rose-garden", mode: "work", text: "What is the rate for xylophone tuning?" });
    recordGuideEvent(db, riley, guideId, { event: "decision", revisionId, blockId: "first-question", choiceId: "ladder-goes" }, now);
    recordGuideEvent(db, riley, guideId, { event: "decision", revisionId, blockId: "first-question", choiceId: "ask-dot" }, later(1));

    const r = relayReport(db, jordan, { guide: guideId, from: "2026-11-01", to: "2026-11-30" }, now);
    expect(r.course!.version).toMatchObject({ number: 1, live: true, relayPages: 2, pages: 2 });
    expect(r.course!.engagement).toMatchObject({
      eligible: 2,
      dialledPeople: 1,
      dialled: 1,
      linked: 1,
      askers: 1,
      questions: { story: 1, work: 1 },
      returned: 0,
      sourceOpens: 0,
    });
    expect(r.course!.engagement!.answers).toEqual([
      { kind: "no_answer", label: "Couldn’t be verified", n: 1 },
      { kind: "story", label: "From this story", n: 1 },
    ]);
    expect(r.course!.engagement!.perPage[0]).toMatchObject({ title: "Dot and the rose garden", opened: 2, dialled: 1, questions: 2 });
    // Learning is the course's own record of its own activity. An answer from Ava is not a pass.
    expect(r.course!.learning!.decisions[0]).toMatchObject({ blockId: "first-question", answered: 1, first: { best: 0, acceptable: 0, risky: 1 }, retried: 1 });
    expect(r.course!.work).toBeNull();
    const everything = JSON.stringify(r) + JSON.stringify(db.prepare("SELECT * FROM relay_events").all());
    expect(everything).not.toContain("petunias");
    expect(everything).not.toContain("xylophone");
    expect(() => relayReport(db, riley, {}, now)).toThrow();
    // Outside the date range, nothing is counted, and the range is always shown.
    const empty = relayReport(db, jordan, { guide: guideId, from: "2026-10-01", to: "2026-10-31" }, now);
    expect(empty.range).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(empty.course!.engagement).toMatchObject({ eligible: 0, dialled: 0 });
  });
});
